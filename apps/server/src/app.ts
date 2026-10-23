import { createServer, Server as HttpServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { makeRules, Rules } from '@truco/engine';

// STUB da Fase 1: salas em memória, sem partida ainda (Fase 2 liga o motor autoritativo).
interface Member { playerId: string; nickname: string; seat: number }
interface Spectator { playerId: string; nickname: string }
export const MAX_SPECTATORS = 10;
export const MAX_CLIP_BYTES = 300 * 1024, MAX_CLIP_MS = 10_000, CLIP_COOLDOWN_MS = 5000;
export const CLIP_MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4'];
interface Room { code: string; rules: Rules; hostId: string; members: Member[]; spectators: Spectator[]; status: 'lobby' }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode(len = 8) { const b = randomBytes(len); return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join(''); }
const cleanNick = (n: unknown) => typeof n === 'string' ? n.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20) : '';

export function buildServer(): { http: HttpServer; io: Server; rooms: Map<string, Room> } {
  const rooms = new Map<string, Room>();
  const http = createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
    res.writeHead(404); res.end();
  });
  const io = new Server(http, { maxHttpBufferSize: 400 * 1024, cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' } });
  io.on('connection', (socket) => {
    const playerId = randomUUID(); // sessão de convidado (Fase 2: token assinado p/ reconexão)
    const me: { code?: string; nickname?: string; role?: 'player' | 'spectator'; seat?: number | null; lastClip: number } = { lastClip: -Infinity };
    // Áudio de zoeira: retransmitido para a sala, NUNCA armazenado no servidor.
    socket.on('clip:send', (p: any, ack?: (r: any) => void) => {
      const room = me.code ? rooms.get(me.code) : undefined;
      if (!room) return ack?.({ ok: false, error: 'Você não está em nenhuma mesa' });
      const mime = typeof p?.mime === 'string' ? p.mime.split(';')[0].trim().toLowerCase() : '';
      if (!CLIP_MIMES.includes(mime)) return ack?.({ ok: false, error: 'Formato de áudio não suportado' });
      const data = p?.data;
      if (!(data instanceof Buffer || data instanceof ArrayBuffer || data instanceof Uint8Array)) return ack?.({ ok: false, error: 'Áudio inválido' });
      const size = data.byteLength;
      if (size === 0 || size > MAX_CLIP_BYTES) return ack?.({ ok: false, error: 'Áudio grande demais (máx. 300 KB)' });
      const dur = Number(p?.durationMs);
      if (!Number.isFinite(dur) || dur <= 0 || dur > MAX_CLIP_MS + 500) return ack?.({ ok: false, error: 'Áudio até 10 segundos' });
      const now = Date.now();
      if (now - me.lastClip < CLIP_COOLDOWN_MS) return ack?.({ ok: false, error: 'Calma aí! Espera uns segundos pra mandar outro áudio' });
      me.lastClip = now;
      socket.to(room.code).emit('clip:receive', { id: randomUUID(), fromId: playerId, nickname: me.nickname, seat: me.seat ?? null, role: me.role, mime, durationMs: dur, data });
      ack?.({ ok: true });
    });
    socket.on('room:create', (p: any, ack?: (r: any) => void) => {
      const nickname = cleanNick(p?.nickname);
      if (!nickname) return ack?.({ ok: false, error: 'Apelido obrigatório' });
      let rules: Rules;
      try { rules = makeRules(p?.rules ?? {}); } catch (e: any) { return ack?.({ ok: false, error: e.message }); }
      let code = newRoomCode(); while (rooms.has(code)) code = newRoomCode();
      const room: Room = { code, rules, hostId: playerId, members: [{ playerId, nickname, seat: 0 }], spectators: [], status: 'lobby' };
      rooms.set(code, room); socket.join(code); Object.assign(me, { code, nickname, role: 'player', seat: 0 });
      ack?.({ ok: true, code, playerId, seat: 0, rules });
    });
    socket.on('room:join', (p: any, ack?: (r: any) => void) => {
      const nickname = cleanNick(p?.nickname);
      const room = rooms.get(String(p?.code ?? '').toUpperCase());
      if (!nickname) return ack?.({ ok: false, error: 'Apelido obrigatório' });
      if (!room) return ack?.({ ok: false, error: 'Mesa não encontrada' });
      if (room.members.some((m) => m.playerId === playerId) || room.spectators.some((m) => m.playerId === playerId)) return ack?.({ ok: false, error: 'Você já está nessa mesa' });
      const update = () => io.to(room.code).emit('room:update', { code: room.code, members: room.members.map(({ nickname, seat }) => ({ nickname, seat })), spectators: room.spectators.map((x) => x.nickname) });
      if (p?.role === 'spectator') {
        if (room.spectators.length >= MAX_SPECTATORS) return ack?.({ ok: false, error: 'Galera lotada (máx. 10 assistindo)' });
        room.spectators.push({ playerId, nickname }); socket.join(room.code); Object.assign(me, { code: room.code, nickname, role: 'spectator', seat: null }); update();
        return ack?.({ ok: true, code: room.code, playerId, role: 'spectator', seat: null, rules: room.rules, spectators: room.spectators.length });
      }
      if (room.members.length >= room.rules.playersCount) return ack?.({ ok: false, error: 'Mesa cheia' });
      const taken = new Set(room.members.map((m) => m.seat));
      let seat = 0; while (taken.has(seat)) seat++;
      room.members.push({ playerId, nickname, seat }); socket.join(room.code); Object.assign(me, { code: room.code, nickname, role: 'player', seat });
      update();
      ack?.({ ok: true, code: room.code, playerId, role: 'player', seat, rules: room.rules });
    });
  });
  return { http, io, rooms };
}
