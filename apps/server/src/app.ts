import { createServer, Server as HttpServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { Server, Socket } from 'socket.io';
import { makeRules, Rules, Rank, RANK_ORDER, GameState, createGame, applyAction, getPlayerView, getSpectatorView, legalActions, deriveEvents, Action, teamOf } from '@truco/engine';

export const MAX_SPECTATORS = 10;
export const MAX_CLIP_BYTES = 300 * 1024, MAX_CLIP_MS = 10_000, CLIP_COOLDOWN_MS = 5000;
export const CLIP_MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode(len = 8) { const b = randomBytes(len); return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join(''); }
const cleanNick = (n: unknown) => typeof n === 'string' ? n.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20) : '';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

interface Session { token: string; playerId: string; nickname: string; socketId?: string; roomCode?: string; lastClip: number }
interface Member { playerId: string; nickname: string; connected: boolean; graceTimer?: NodeJS.Timeout }
interface Room {
  code: string; rules: Rules; hostId: string; seats: (string | null)[];
  members: Map<string, Member>; spectators: Map<string, Member>;
  status: 'lobby' | 'playing' | 'finished'; game?: GameState; matchNumber: number;
}
export interface ServerOptions { graceMs?: number; seed?: number; rateLimit?: { max: number; windowMs: number }; webDist?: string }

/** Validação manual das regras enviadas pelo cliente. */
function parseRules(p: any): Rules {
  const o: Partial<Rules> = {};
  if (p?.variant !== undefined) { if (!['paulista', 'mineiro'].includes(p.variant)) throw new Error('Variante inválida'); o.variant = p.variant; }
  if (p?.playersCount !== undefined) { if (![2, 4, 6].includes(p.playersCount)) throw new Error('Escolha 2, 4 ou 6 jogadores'); o.playersCount = p.playersCount; }
  if (p?.deckPreset !== undefined) { if (!['sujo', 'limpo', 'custom'].includes(p.deckPreset)) throw new Error('Baralho inválido'); o.deckPreset = p.deckPreset; }
  if (p?.deckRanks !== undefined) { if (!Array.isArray(p.deckRanks) || p.deckRanks.some((r: any) => !RANK_ORDER.includes(r))) throw new Error('Composição do baralho inválida'); o.deckRanks = p.deckRanks as Rank[]; }
  if (p?.targetScore !== undefined) { const t = Number(p.targetScore); if (!Number.isInteger(t) || t < 3 || t > 30) throw new Error('Pontuação final entre 3 e 30'); o.targetScore = t; }
  return makeRules(o);
}
function parseAction(p: any): Omit<Action, 'seat'> | null {
  const t = p?.type;
  if (['truco', 'accept', 'raise', 'run', 'onze_play', 'onze_run'].includes(t)) return { type: t } as any;
  if (t === 'play') {
    if (Number.isInteger(p.cardIndex) && p.cardIndex >= 0 && p.cardIndex < 3) return { type: 'play', cardIndex: p.cardIndex } as any;
    if (p.card && typeof p.card.rank === 'string' && typeof p.card.suit === 'string') return { type: 'play', card: { rank: p.card.rank, suit: p.card.suit } } as any;
  }
  return null;
}

export function buildServer(opts: ServerOptions = {}) {
  const graceMs = opts.graceMs ?? 120_000;
  const rl = opts.rateLimit ?? { max: 40, windowMs: 5000 };
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Session>(); // token -> sessão
  const byPlayer = new Map<string, Session>();

  const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
  const http = createServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
    if (opts.webDist) { // serve o build do site (uso local / produção simples)
      const p = normalize(join(opts.webDist, url === '/' ? 'index.html' : url));
      if (p.startsWith(opts.webDist)) {
        try { const st = await stat(p); if (st.isFile()) { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(p)); return; } } catch { /* cai no index */ }
        if (!extname(url)) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile(join(opts.webDist, 'index.html'))); return; }
      }
    }
    res.writeHead(404); res.end();
  });
  const io = new Server(http, { maxHttpBufferSize: 400 * 1024, cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' } });

  const publicRoom = (r: Room) => ({
    code: r.code, rules: r.rules, status: r.status, hostId: r.hostId, matchNumber: r.matchNumber,
    seats: r.seats.map((id, seat) => { const m = id ? r.members.get(id) : undefined; return { seat, team: teamOf(seat), playerId: id, nickname: m?.nickname ?? null, connected: m?.connected ?? false }; }),
    spectators: [...r.spectators.values()].map((s) => ({ playerId: s.playerId, nickname: s.nickname, connected: s.connected })),
  });
  const emitState = (r: Room, events: unknown[] = []) => {
    const pub = publicRoom(r);
    const send = (id: string, role: 'player' | 'spectator') => {
      const s = byPlayer.get(id); if (!s?.socketId) return;
      const seat = r.seats.indexOf(id);
      const view = r.game ? (role === 'player' && seat >= 0 ? getPlayerView(r.game, seat) : getSpectatorView(r.game)) : null;
      io.to(s.socketId).emit('room:state', { room: pub, you: { playerId: id, role, seat: seat >= 0 ? seat : null, isHost: r.hostId === id }, view, legal: r.game && seat >= 0 ? legalActions(r.game, seat) : [], events });
    };
    r.members.forEach((m) => send(m.playerId, 'player'));
    r.spectators.forEach((m) => send(m.playerId, 'spectator'));
  };
  const transferHost = (r: Room) => {
    const host = r.members.get(r.hostId);
    if (host?.connected) return;
    const next = [...r.members.values()].find((m) => m.connected) ?? [...r.members.values()][0];
    if (next) r.hostId = next.playerId;
  };
  const removeFromRoom = (s: Session) => {
    const r = s.roomCode ? rooms.get(s.roomCode) : undefined; s.roomCode = undefined;
    if (!r) return;
    const m = r.members.get(s.playerId); if (m?.graceTimer) clearTimeout(m.graceTimer);
    r.spectators.delete(s.playerId);
    if (m) {
      if (r.status === 'playing') { m.connected = false; } // partida em andamento: assento fica guardado (desconectado)
      else { r.members.delete(s.playerId); r.seats = r.seats.map((x) => (x === s.playerId ? null : x)); }
    }
    if (r.members.size === 0 && r.spectators.size === 0) { rooms.delete(r.code); return; }
    if (r.hostId === s.playerId) { const n = [...r.members.values()].find((x) => x.playerId !== s.playerId && x.connected); if (n) r.hostId = n.playerId; }
    emitState(r);
  };

  io.on('connection', (socket: Socket) => {
    // ---- sessão de convidado (token aleatório seguro) ----
    const t = socket.handshake.auth?.token;
    let s = typeof t === 'string' && TOKEN_RE.test(t) ? sessions.get(t) : undefined;
    if (!s) {
      const token = randomBytes(32).toString('base64url');
      s = { token, playerId: randomUUID(), nickname: '', lastClip: -Infinity };
      sessions.set(token, s); byPlayer.set(s.playerId, s);
    }
    const sess = s;
    if (sess.socketId && sess.socketId !== socket.id) io.sockets.sockets.get(sess.socketId)?.disconnect(true); // uma aba por sessão
    sess.socketId = socket.id;
    socket.emit('session', { token: sess.token, playerId: sess.playerId, nickname: sess.nickname });
    // reconexão: volta pra mesa
    const room0 = sess.roomCode ? rooms.get(sess.roomCode) : undefined;
    if (room0) {
      const m = room0.members.get(sess.playerId) ?? room0.spectators.get(sess.playerId);
      if (m) { m.connected = true; if (m.graceTimer) clearTimeout(m.graceTimer); m.graceTimer = undefined; }
      emitState(room0);
    }

    // ---- limitação de requisições por socket ----
    let hits: number[] = [];
    const limited = () => { const now = Date.now(); hits = hits.filter((x) => now - x < rl.windowMs); hits.push(now); return hits.length > rl.max; };
    const on = (ev: string, fn: (p: any, ack: (r: any) => void) => void) => socket.on(ev, (p: any, ack?: any) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limited()) return reply({ ok: false, error: 'Muitas ações seguidas. Respira e tenta de novo.' });
      try { fn(p, reply); } catch (e: any) { reply({ ok: false, error: e?.message ?? 'Erro inesperado' }); }
    });
    const myRoom = () => (sess.roomCode ? rooms.get(sess.roomCode) : undefined);

    on('session:nick', (p, ack) => { const n = cleanNick(p?.nickname); if (n.length < 2) return ack({ ok: false, error: 'Apelido precisa de 2+ letras' }); sess.nickname = n; ack({ ok: true, nickname: n }); });

    on('room:create', (p, ack) => {
      const nickname = cleanNick(p?.nickname) || sess.nickname;
      if (nickname.length < 2) return ack({ ok: false, error: 'Apelido obrigatório' });
      const rules = parseRules(p?.rules ?? {});
      if (sess.roomCode) removeFromRoom(sess);
      sess.nickname = nickname;
      let code = newRoomCode(); while (rooms.has(code)) code = newRoomCode();
      const room: Room = { code, rules, hostId: sess.playerId, seats: Array(rules.playersCount).fill(null), members: new Map(), spectators: new Map(), status: 'lobby', matchNumber: 0 };
      room.seats[0] = sess.playerId; room.members.set(sess.playerId, { playerId: sess.playerId, nickname, connected: true });
      rooms.set(code, room); sess.roomCode = code;
      ack({ ok: true, code, seat: 0, role: 'player', rules, playerId: sess.playerId });
      emitState(room);
    });

    on('room:join', (p, ack) => {
      const nickname = cleanNick(p?.nickname) || sess.nickname;
      if (nickname.length < 2) return ack({ ok: false, error: 'Apelido obrigatório' });
      const room = rooms.get(String(p?.code ?? '').toUpperCase().trim());
      if (!room) return ack({ ok: false, error: 'Mesa não encontrada. Confere o código.' });
      sess.nickname = nickname;
      // já está nessa mesa? (reentrada)
      const existing = room.members.get(sess.playerId) ?? room.spectators.get(sess.playerId);
      if (existing) {
        if (p?.role === 'spectator' && room.members.has(sess.playerId)) return ack({ ok: false, error: 'Você já está sentado nessa mesa' });
        if (p?.role !== 'spectator' && room.spectators.has(sess.playerId)) return ack({ ok: false, error: 'Você já está assistindo essa mesa' });
        existing.connected = true; if (existing.graceTimer) clearTimeout(existing.graceTimer);
        sess.roomCode = room.code;
        const seat = room.seats.indexOf(sess.playerId);
        ack({ ok: true, code: room.code, seat: seat >= 0 ? seat : null, role: seat >= 0 ? 'player' : 'spectator', rules: room.rules, rejoined: true, spectators: room.spectators.size });
        return emitState(room);
      }
      if (sess.roomCode) removeFromRoom(sess);
      if (p?.role === 'spectator') {
        if (room.spectators.size >= MAX_SPECTATORS) return ack({ ok: false, error: 'Galera lotada (máx. 10 assistindo)' });
        room.spectators.set(sess.playerId, { playerId: sess.playerId, nickname, connected: true }); sess.roomCode = room.code;
        ack({ ok: true, code: room.code, role: 'spectator', seat: null, rules: room.rules, spectators: room.spectators.size });
        return emitState(room);
      }
      if (room.status !== 'lobby') return ack({ ok: false, error: 'A partida já começou. Você pode entrar pra assistir.' });
      const seat = room.seats.indexOf(null);
      if (seat < 0) return ack({ ok: false, error: 'Mesa cheia. Você pode entrar pra assistir.' });
      room.seats[seat] = sess.playerId; room.members.set(sess.playerId, { playerId: sess.playerId, nickname, connected: true }); sess.roomCode = room.code;
      ack({ ok: true, code: room.code, role: 'player', seat, rules: room.rules, playerId: sess.playerId });
      emitState(room);
    });

    on('room:seat', (p, ack) => {
      const r = myRoom(); if (!r || !r.members.has(sess.playerId)) return ack({ ok: false, error: 'Você não está sentado numa mesa' });
      if (r.status !== 'lobby') return ack({ ok: false, error: 'Não dá pra trocar de lugar com a partida rolando' });
      const seat = p?.seat;
      if (!Number.isInteger(seat) || seat < 0 || seat >= r.seats.length) return ack({ ok: false, error: 'Lugar inválido' });
      if (r.seats[seat] && r.seats[seat] !== sess.playerId) return ack({ ok: false, error: 'Esse lugar já tem dono' });
      r.seats = r.seats.map((x) => (x === sess.playerId ? null : x)); r.seats[seat] = sess.playerId; // nunca ocupa 2 lugares
      ack({ ok: true, seat }); emitState(r);
    });

    const startMatch = (r: Room) => {
      r.matchNumber++;
      r.game = createGame(r.rules, { seed: opts.seed !== undefined ? opts.seed + r.matchNumber : undefined, dealer: r.rules.playersCount - 1 });
      r.status = 'playing';
      emitState(r, [{ type: 'match_start' }]);
    };
    on('room:start', (_p, ack) => {
      const r = myRoom(); if (!r) return ack({ ok: false, error: 'Você não está numa mesa' });
      if (r.hostId !== sess.playerId) return ack({ ok: false, error: 'Só o dono da mesa pode começar' });
      if (r.status === 'playing') return ack({ ok: false, error: 'A partida já está rolando' });
      if (r.seats.some((x) => !x)) return ack({ ok: false, error: `Faltam jogadores: ${r.seats.filter((x) => !x).length} lugar(es) vazio(s)` });
      ack({ ok: true }); startMatch(r);
    });
    on('room:restart', (p, ack) => { // "jogar outra" ou reiniciar (cliente pede confirmação)
      const r = myRoom(); if (!r) return ack({ ok: false, error: 'Você não está numa mesa' });
      if (r.hostId !== sess.playerId) return ack({ ok: false, error: 'Só o dono da mesa pode reiniciar' });
      if (r.status === 'playing' && p?.confirm !== true) return ack({ ok: false, error: 'Confirme para reiniciar a partida em andamento' });
      if (r.seats.some((x) => !x)) return ack({ ok: false, error: 'Faltam jogadores' });
      ack({ ok: true }); startMatch(r);
    });
    on('room:end', (p, ack) => {
      const r = myRoom(); if (!r) return ack({ ok: false, error: 'Você não está numa mesa' });
      if (r.hostId !== sess.playerId) return ack({ ok: false, error: 'Só o dono da mesa pode encerrar' });
      if (p?.confirm !== true) return ack({ ok: false, error: 'Confirme para encerrar a partida' });
      r.status = 'lobby'; r.game = undefined;
      for (const [id, m] of r.members) if (!m.connected) { r.members.delete(id); r.seats = r.seats.map((x) => (x === id ? null : x)); }
      ack({ ok: true }); emitState(r, [{ type: 'match_ended_by_host' }]);
    });
    on('room:leave', (_p, ack) => { removeFromRoom(sess); ack({ ok: true }); });

    on('game:action', (p, ack) => {
      const r = myRoom(); if (!r?.game) return ack({ ok: false, error: 'Nenhuma partida rolando' });
      const seat = r.seats.indexOf(sess.playerId); // assento SEMPRE vem da sessão, nunca do cliente
      if (seat < 0) return ack({ ok: false, error: 'Espectador não joga' });
      const a = parseAction(p); if (!a) return ack({ ok: false, error: 'Ação inválida' });
      const prev = r.game;
      const res = applyAction(prev, { ...a, seat } as Action);
      if (!res.ok) return ack({ ok: false, error: res.error });
      r.game = res.state;
      if (r.game.phase === 'match_over') r.status = 'finished';
      ack({ ok: true });
      emitState(r, [...(a.type === 'play' ? [{ type: 'card_played', seat }] : []), ...deriveEvents(prev, r.game)]);
    });

    // Áudio de zoeira: retransmitido para a sala, NUNCA armazenado no servidor.
    on('clip:send', (p, ack) => {
      const room = myRoom();
      if (!room) return ack({ ok: false, error: 'Você não está em nenhuma mesa' });
      const mime = typeof p?.mime === 'string' ? p.mime.split(';')[0].trim().toLowerCase() : '';
      if (!CLIP_MIMES.includes(mime)) return ack({ ok: false, error: 'Formato de áudio não suportado' });
      const data = p?.data;
      if (!(data instanceof Buffer || data instanceof ArrayBuffer || data instanceof Uint8Array)) return ack({ ok: false, error: 'Áudio inválido' });
      const size = data.byteLength;
      if (size === 0 || size > MAX_CLIP_BYTES) return ack({ ok: false, error: 'Áudio grande demais (máx. 300 KB)' });
      const dur = Number(p?.durationMs);
      if (!Number.isFinite(dur) || dur <= 0 || dur > MAX_CLIP_MS + 500) return ack({ ok: false, error: 'Áudio até 10 segundos' });
      const now = Date.now();
      if (now - sess.lastClip < CLIP_COOLDOWN_MS) return ack({ ok: false, error: 'Calma aí! Espera uns segundos pra mandar outro áudio' });
      sess.lastClip = now;
      const seat = room.seats.indexOf(sess.playerId);
      const msg = { id: randomUUID(), fromId: sess.playerId, nickname: sess.nickname, seat: seat >= 0 ? seat : null, role: seat >= 0 ? 'player' : 'spectator', mime, durationMs: dur, data };
      for (const id of [...room.members.keys(), ...room.spectators.keys()]) { const o = byPlayer.get(id); if (id !== sess.playerId && o?.socketId) io.to(o.socketId).emit('clip:receive', msg); }
      ack({ ok: true });
    });
    socket.on('disconnect', () => {
      if (sess.socketId !== socket.id) return; // substituído por outra conexão
      sess.socketId = undefined;
      const r = myRoom(); if (!r) return;
      const m = r.members.get(sess.playerId) ?? r.spectators.get(sess.playerId); if (!m) return;
      m.connected = false;
      transferHost(r);
      emitState(r);
      m.graceTimer = setTimeout(() => { // prazo de reconexão
        if (m.connected) return;
        if (r.spectators.has(sess.playerId) || r.status !== 'playing') removeFromRoom(sess);
        else { transferHost(r); emitState(r); }
      }, graceMs);
    });
  });
  return { http, io, rooms, sessions };
}
