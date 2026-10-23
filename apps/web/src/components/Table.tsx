import type { Card } from '@truco/engine';
import { PlayingCard } from './PlayingCard';
import { Character, LOOKS } from './Character';
export interface TableSeat { nickname: string; team: 0 | 1; cardCount: number; connected?: boolean; isTurn?: boolean }
const TEAM = ['#5fa87a', '#e0893f'];

/** Mesa de boteco: personagens nas banquetas, mesa amarela de bar, galera assistindo. Assento 0 = você (embaixo). */
export function Table({ seats, myCards = [], center = [], vira, score = [0, 0], value = 1, compact, spectators = [] }: {
  seats: TableSeat[]; myCards?: Card[]; center?: { seat: number; card: Card }[]; vira?: Card; score?: [number, number]; value?: number; compact?: boolean; spectators?: string[];
}) {
  const n = seats.length;
  const pos = (i: number) => { const a = (i / n) * 2 * Math.PI; return { x: 50 - Math.sin(a) * 36, y: 52 + Math.cos(a) * 36 }; };
  return (
    <div className={`boteco${compact ? ' boteco--compact' : ''}`}>
      <div className="wall" aria-hidden><div className="bulb" /><div className="counter"><span className="bottle" /><span className="bottle b2" /><span className="bottle" /></div></div>
      <div className="chalk" aria-label={`placar: nós ${score[0]}, eles ${score[1]}, vale ${value}`}>
        <span style={{ color: TEAM[0] }}>NÓS <b>{score[0]}</b></span><span className="val">tá valendo {value}</span><span style={{ color: TEAM[1] }}>ELES <b>{score[1]}</b></span>
      </div>
      {spectators.length > 0 && <div className="galera" aria-label={`${spectators.length} assistindo`}>
        <span className="galera-count">👀 {spectators.length} na galera</span>
        <div className="galera-row">{spectators.slice(0, 6).map((s, i) => <div key={i} className="spec"><Character look={LOOKS[(i + 3) % LOOKS.length]} scale={0.38} cards={0} standing /><small>{s}</small></div>)}</div>
      </div>}
      <div className="floor">
        <div className="crate c1" aria-hidden /><div className="crate c2" aria-hidden />
        <div className="bartable"><div className="center">
          {vira && <div className="vira"><PlayingCard card={vira} small /><small>vira</small></div>}
          {center.map((p, i) => <div key={i} className="played" style={{ transform: `rotate(${(i - center.length / 2) * 10}deg)` }}><PlayingCard card={p.card} small /></div>)}
        </div></div>
        {seats.map((s, i) => { const { x, y } = pos(i); return (
          <div key={i} className={`seat${s.isTurn ? ' turn' : ''}${i === 0 ? ' me' : ''}`} style={{ left: `${x}%`, top: `${y}%`, zIndex: Math.round(y) }}>
            <Character look={LOOKS[i % LOOKS.length]} cards={i === 0 && myCards.length ? 0 : s.cardCount} scale={n === 6 ? 0.62 : 0.75} teamColor={TEAM[s.team]} />
            <div className="tag" style={{ borderColor: TEAM[s.team] }}>
              <span className={`dot ${s.connected === false ? 'off' : 'on'}`} title={s.connected === false ? 'desconectado' : 'conectado'} />
              <b>{s.nickname}</b>{s.isTurn && <em> · na vez</em>}
            </div>
          </div>); })}
      </div>
      {myCards.length > 0 && <div className="hand">{myCards.map((c, i) => <button key={i} className="hand-card" aria-label={`jogar ${c.rank} de ${c.suit}`}><PlayingCard card={c} /></button>)}</div>}
    </div>);
}
