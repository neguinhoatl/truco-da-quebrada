import { createServer, Server as HttpServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { makeRules, Rules } from '@truco/engine';

// STUB da Fase 1: salas em memória, sem partida ainda (Fase 2 liga o motor autoritativo).
interface Member { playerId: string; nickname: string; seat: number }
interface Room { code: string; rules: Rules; hostId: string; members: Member[]; status: 'lobby' }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode(len = 8) { const b = randomBytes(len); return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join(''); }
const cleanNick = (n: unknown) => typeof n === 'string' ? n.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20) : '';

export function buildServer(): { http: HttpServer; io: Server; rooms: Map<string, Room> } {
  const rooms = new Map<string, Room>();
  const http = createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
    res.writeHead(404); res.end();
  });
  const io = new Server(http, { cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' } });
  io.on('connection', (socket) => {
    const playerId = randomUUID(); // sessão de convidado (Fase 2: token assinado p/ reconexão)
    socket.on('room:create', (p: any, ack?: (r: any) => void) => {
      const nickname = cleanNick(p?.nickname);
      if (!nickname) return ack?.({ ok: false, error: 'Apelido obrigatório' });
      let rules: Rules;
      try { rules = makeRules(p?.rules ?? {}); } catch (e: any) { return ack?.({ ok: false, error: e.message }); }
      let code = newRoomCode(); while (rooms.has(code)) code = newRoomCode();
      const room: Room = { code, rules, hostId: playerId, members: [{ playerId, nickname, seat: 0 }], status: 'lobby' };
      rooms.set(code, room); socket.join(code);
      ack?.({ ok: true, code, playerId, seat: 0, rules });
    });
    socket.on('room:join', (p: any, ack?: (r: any) => void) => {
      const nickname = cleanNick(p?.nickname);
      const room = rooms.get(String(p?.code ?? '').toUpperCase());
      if (!nickname) return ack?.({ ok: false, error: 'Apelido obrigatório' });
      if (!room) return ack?.({ ok: false, error: 'Mesa não encontrada' });
      if (room.members.some((m) => m.playerId === playerId)) return ack?.({ ok: false, error: 'Você já está nessa mesa' });
      if (room.members.length >= room.rules.playersCount) return ack?.({ ok: false, error: 'Mesa cheia' });
      const taken = new Set(room.members.map((m) => m.seat));
      let seat = 0; while (taken.has(seat)) seat++;
      room.members.push({ playerId, nickname, seat }); socket.join(room.code);
      io.to(room.code).emit('room:update', { code: room.code, members: room.members.map(({ nickname, seat }) => ({ nickname, seat })) });
      ack?.({ ok: true, code: room.code, playerId, seat, rules: room.rules });
    });
  });
  return { http, io, rooms };
}
