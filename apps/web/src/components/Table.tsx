import type { Card } from '@truco/engine';
import { PlayingCard } from './PlayingCard';
export interface TableSeat { nickname: string; team: 0 | 1; cardCount: number; connected?: boolean; isTurn?: boolean }
/** Mesa estática (Fase 1): posições, times, cartas no centro, vira e placar. */
export function Table({ seats, myCards = [], center = [], vira, score = [0, 0], value = 1, compact }: {
  seats: TableSeat[]; myCards?: Card[]; center?: { seat: number; card: Card }[]; vira?: Card; score?: [number, number]; value?: number; compact?: boolean;
}) {
  const n = seats.length;
  return (
    <div className={`table${compact ? ' table--compact' : ''}`}>
      <div className="scoreboard"><span className="t0">NÓS {score[0]}</span><span className="val">vale {value}</span><span className="t1">ELES {score[1]}</span></div>
      <div className="felt">
        {seats.map((s, i) => {
          const angle = (i / n) * 2 * Math.PI; // assento 0 embaixo (você)
          const x = 50 - Math.sin(angle) * 42, y = 50 + Math.cos(angle) * 40;
          return (
            <div key={i} className={`seat team${s.team}${s.isTurn ? ' turn' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
              <span className={`dot ${s.connected === false ? 'off' : 'on'}`} aria-label={s.connected === false ? 'desconectado' : 'conectado'} />
              <b>{s.nickname}</b><small>{s.team === 0 ? 'Nós' : 'Eles'} · {s.cardCount}🂠</small>
            </div>);
        })}
        <div className="center">
          {vira && <div className="vira"><PlayingCard card={vira} small /><small>vira</small></div>}
          {center.map((p, i) => <div key={i} className="played" style={{ transform: `rotate(${(i - center.length / 2) * 9}deg)` }}><PlayingCard card={p.card} small /></div>)}
        </div>
      </div>
      {myCards.length > 0 && <div className="hand">{myCards.map((c, i) => <button key={i} className="hand-card" aria-label={`jogar ${c.rank} de ${c.suit}`}><PlayingCard card={c} /></button>)}</div>}
    </div>);
}
