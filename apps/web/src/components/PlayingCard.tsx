import type { Card } from '@truco/engine';
const SYM = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' } as const;
const RED = { paus: false, copas: true, espadas: false, ouros: true } as const;
export function PlayingCard({ card, faceDown, small, highlight }: { card?: Card; faceDown?: boolean; small?: boolean; highlight?: boolean }) {
  const w = small ? 46 : 70, h = small ? 66 : 100;
  if (faceDown || !card) return (
    <svg className="card" width={w} height={h} viewBox="0 0 70 100" role="img" aria-label="carta virada">
      <rect x="1" y="1" width="68" height="98" rx="6" fill="#f3ead6" stroke="#2b2418" />
      <rect x="6" y="6" width="58" height="88" rx="4" fill="#7a2a1d" />
      <path d="M6 6 L64 94 M64 6 L6 94" stroke="#a8432f" strokeWidth="1" />
      <rect x="18" y="38" width="34" height="24" rx="3" fill="#7a2a1d" stroke="#e9c77b" />
      <text x="35" y="54" textAnchor="middle" fontSize="10" fill="#e9c77b" fontWeight="900">TQ</text>
    </svg>);
  const color = RED[card.suit] ? '#b3261e' : '#1b1b1b';
  return (
    <svg className={`card${highlight ? ' card--hl' : ''}`} width={w} height={h} viewBox="0 0 70 100" role="img" aria-label={`${card.rank} de ${card.suit}`}>
      <rect x="1" y="1" width="68" height="98" rx="6" fill="#fbf6ea" stroke="#2b2418" strokeWidth="1.5" />
      <text x="7" y="20" fontSize="17" fontWeight="800" fill={color} fontFamily="Georgia, serif">{card.rank}</text>
      <text x="7" y="35" fontSize="14" fill={color}>{SYM[card.suit]}</text>
      <text x="35" y="66" textAnchor="middle" fontSize="34" fill={color}>{SYM[card.suit]}</text>
      <g transform="rotate(180 35 50)"><text x="7" y="20" fontSize="17" fontWeight="800" fill={color} fontFamily="Georgia, serif">{card.rank}</text></g>
    </svg>);
}
