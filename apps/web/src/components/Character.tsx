// Personagens originais estilizados (adultos), em SVG puro.
export interface Look { skin: string; hair: string; shirt: string; hat: 'none' | 'bone' | 'chapeu' | 'touca'; regata?: boolean; bigode?: boolean; barba?: boolean; cabelo?: 'curto' | 'black' | 'careca' | 'longo'; oculos?: boolean }
export const LOOKS: Look[] = [
  { skin: '#8d5a3b', hair: '#1a1410', shirt: '#2e6b47', hat: 'bone', bigode: true, cabelo: 'curto' },
  { skin: '#e2b48c', hair: '#6b3e1f', shirt: '#c9372b', hat: 'none', regata: true, cabelo: 'longo' },
  { skin: '#5a3825', hair: '#0f0b08', shirt: '#e9c77b', hat: 'none', barba: true, cabelo: 'black' },
  { skin: '#c68e63', hair: '#2a2018', shirt: '#2f4f7f', hat: 'chapeu', bigode: true, cabelo: 'careca' },
  { skin: '#f0c9a4', hair: '#b88a4a', shirt: '#6b4426', hat: 'touca', oculos: true, cabelo: 'curto' },
  { skin: '#a46a45', hair: '#141010', shirt: '#f3ead6', hat: 'none', regata: true, bigode: true, cabelo: 'careca' },
];

/** Personagem sentado na cadeira de bar, segurando o leque de cartas (verso). */
export function Character({ look, cards = 3, scale = 1, teamColor, standing }: { look: Look; cards?: number; scale?: number; teamColor?: string; standing?: boolean }) {
  const L = look;
  const w = 110 * scale, h = 130 * scale;
  return (
    <svg width={w} height={h} viewBox="0 0 110 130" className="character" aria-hidden>
      {!standing && <g>{/* banqueta de bar metálica */}
        <rect x="28" y="96" width="54" height="7" rx="3" fill="#c9a227" stroke="#5a4510" />
        <path d="M34 103 L30 128 M76 103 L80 128 M40 116 H70" stroke="#8c8c84" strokeWidth="3" fill="none" />
      </g>}
      {standing && <path d="M44 100 L42 128 M66 100 L68 128" stroke="#2a2926" strokeWidth="9" strokeLinecap="round" />}
      {/* tronco */}
      <path d="M30 100 Q30 66 55 64 Q80 66 80 100 Z" fill={L.shirt} stroke="#0003" />
      {L.regata && <path d="M38 70 Q55 84 72 70 L72 66 Q55 72 38 66 Z" fill={L.skin} />}
      {L.regata && <><circle cx="33" cy="80" r="6" fill={L.skin} /><circle cx="77" cy="80" r="6" fill={L.skin} /></>}
      {teamColor && <rect x="30" y="94" width="50" height="6" fill={teamColor} />}
      {/* pescoço e cabeça */}
      <rect x="49" y="54" width="12" height="12" fill={L.skin} />
      <ellipse cx="55" cy="40" rx="17" ry="19" fill={L.skin} stroke="#0002" />
      {L.cabelo === 'black' && <circle cx="55" cy="28" r="20" fill={L.hair} />}
      {L.cabelo === 'black' && <ellipse cx="55" cy="42" rx="16" ry="16" fill={L.skin} />}
      {L.cabelo === 'curto' && <path d="M38 36 Q40 18 55 19 Q71 18 72 36 Q66 26 55 27 Q44 26 38 36Z" fill={L.hair} />}
      {L.cabelo === 'longo' && <path d="M37 40 Q36 18 55 18 Q74 18 73 40 L75 60 L68 58 L68 32 Q55 26 42 32 L42 58 L35 60Z" fill={L.hair} />}
      <circle cx="49" cy="40" r="2" fill="#1a1410" /><circle cx="61" cy="40" r="2" fill="#1a1410" />
      <path d="M47 34 h5 M58 34 h5" stroke={L.hair} strokeWidth="2" />
      {L.oculos && <g fill="none" stroke="#1a1410" strokeWidth="1.6"><circle cx="49" cy="40" r="4.5" /><circle cx="61" cy="40" r="4.5" /><path d="M53.5 40 h3" /></g>}
      {L.barba && <path d="M39 42 Q40 60 55 60 Q70 60 71 42 Q66 52 55 52 Q44 52 39 42Z" fill={L.hair} />}
      {L.bigode && <path d="M47 49 Q55 44 63 49 Q55 47 47 49Z" fill={L.hair} stroke={L.hair} strokeWidth="2" />}
      <path d="M50 53 Q55 55 60 53" stroke="#5a2a1a" strokeWidth="1.5" fill="none" />
      {L.hat === 'bone' && <g><path d="M37 32 Q38 16 55 16 Q72 16 73 32 Z" fill="#1f4d33" /><path d="M37 31 Q30 33 26 36 L40 34Z" fill="#163a26" /></g>}
      {L.hat === 'chapeu' && <g><ellipse cx="55" cy="26" rx="27" ry="5" fill="#b8925a" /><path d="M42 26 Q42 10 55 10 Q68 10 68 26Z" fill="#c9a26a" /><rect x="42" y="21" width="26" height="4" fill="#6b4426" /></g>}
      {L.hat === 'touca' && <path d="M37 34 Q37 14 55 14 Q73 14 73 34 Z" fill="#7a2a1d" />}
      {/* braços + leque de cartas (verso) */}
      <path d="M34 78 Q36 92 50 90 M76 78 Q74 92 60 90" stroke={L.regata ? L.skin : L.shirt} strokeWidth="9" strokeLinecap="round" fill="none" />
      {Array.from({ length: cards }, (_, i) => {
        const a = (i - (cards - 1) / 2) * 16;
        return <g key={i} transform={`rotate(${a} 55 96)`}><rect x="48" y="72" width="14" height="20" rx="2" fill="#7a2a1d" stroke="#f3ead6" strokeWidth="1.5" /></g>;
      })}
      <circle cx="50" cy="90" r="4" fill={L.skin} /><circle cx="60" cy="90" r="4" fill={L.skin} />
    </svg>);
}
