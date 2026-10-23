import { useState } from 'react';
import { RoomState, call, inviteLink } from '../net';
import { Character, LOOKS } from './Character';
const TEAM = ['#5fa87a', '#e0893f'];
export function Lobby({ st, onLeave }: { st: RoomState; onLeave: () => void }) {
  const { room, you } = st; const [msg, setMsg] = useState('');
  const link = inviteLink(room.code);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setMsg('Link copiado! Manda no grupo.'); } catch { setMsg(link); } };
  const share = () => (navigator as any).share ? (navigator as any).share({ title: 'Truco da Quebrada', text: `Bora um truco? Mesa ${room.code}`, url: link }).catch(() => {}) : copy();
  const missing = room.seats.filter((s: any) => !s.playerId).length;
  const act = async (ev: string, p?: any) => { const r = await call(ev, p); if (!r.ok) setMsg(r.error); };
  return (<div className="lobby">
    <div className="code-box"><small>Código da mesa</small><b className="code">{room.code}</b>
      <div className="seg"><button className="btn small" onClick={copy}>📋 Copiar link</button><button className="btn small" onClick={share}>📤 Convidar</button></div></div>
    <p className="notice">{room.rules.variant === 'paulista' ? 'Paulista' : 'Mineiro'} · baralho {room.rules.deckPreset} ({room.rules.deckRanks.length * 4} cartas) · até {room.rules.targetScore} pontos</p>
    <div className={`lobby-seats n${room.seats.length}`}>
      {room.seats.map((s: any) => <button key={s.seat} className={`lobby-seat${s.playerId === you.playerId ? ' me' : ''}`} style={{ borderColor: TEAM[s.team] }} disabled={you.role !== 'player' || (!!s.playerId && s.playerId !== you.playerId)} onClick={() => act('room:seat', { seat: s.seat })}>
        <small style={{ color: TEAM[s.team] }}>{s.team === 0 ? 'Time A' : 'Time B'} · lugar {s.seat + 1}</small>
        {s.playerId ? <><Character look={LOOKS[s.seat % LOOKS.length]} scale={0.5} cards={0} /><b>{s.nickname}{room.hostId === s.playerId ? ' 👑' : ''}</b>{!s.connected && <em className="off">desconectado</em>}</> : <span className="empty">{you.role === 'player' ? 'Sentar aqui' : 'Vago'}</span>}
      </button>)}
    </div>
    <p className="notice">👀 Galera assistindo ({room.spectators.length}): {room.spectators.map((x: any) => x.nickname).join(', ') || 'ninguém ainda'}</p>
    {msg && <p className="notice" role="status">{msg}</p>}
    {you.isHost ? <button className="btn primary" disabled={missing > 0} onClick={() => act('room:start')}>{missing > 0 ? `Esperando ${missing} jogador(es)…` : 'COMEÇAR PARTIDA'}</button>
      : <p className="notice">Esperando o dono da mesa começar…</p>}
    <button className="btn ghost" onClick={async () => { await call('room:leave'); onLeave(); }}>Sair da mesa</button>
  </div>);
}
