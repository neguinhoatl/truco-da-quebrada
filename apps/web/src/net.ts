import { io, Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
/** Conexão única com o servidor. Token de sessão de convidado guardado no localStorage. */
let sock: Socket | null = null;
export function socket(): Socket {
  if (sock) return sock;
  sock = io(import.meta.env.VITE_SERVER_URL ?? '/', { auth: (cb) => cb({ token: localStorage.getItem('tq:token') ?? undefined }), transports: ['websocket', 'polling'] });
  sock.on('session', (s: { token: string; playerId: string }) => { localStorage.setItem('tq:token', s.token); localStorage.setItem('tq:pid', s.playerId); });
  return sock;
}
export const call = (ev: string, p: any = {}) => new Promise<any>((res) => {
  const s = socket(); const t = setTimeout(() => res({ ok: false, error: 'Sem resposta do servidor. Confere a conexão.' }), 8000);
  s.emit(ev, p, (r: any) => { clearTimeout(t); res(r); });
});
export interface RoomState { room: any; you: { playerId: string; role: 'player' | 'spectator'; seat: number | null; isHost: boolean }; view: any; legal: string[]; events: any[] }
export function useRoomState() {
  const [st, setSt] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const s = socket();
    const on = (x: RoomState) => setSt(x);
    const c = () => setConnected(true), d = () => setConnected(false);
    s.on('room:state', on); s.on('connect', c); s.on('disconnect', d); setConnected(s.connected);
    return () => { s.off('room:state', on); s.off('connect', c); s.off('disconnect', d); };
  }, []);
  return { st, connected, clear: () => setSt(null) };
}
export const inviteLink = (code: string) => `${location.origin}${location.pathname}?sala=${code}`;
