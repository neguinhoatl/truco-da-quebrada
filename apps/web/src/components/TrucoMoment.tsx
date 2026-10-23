import { useEffect } from 'react';
export type MomentKind = 'call' | 'run' | 'win' | 'special';
/** Momento do truco: banner de giz gigante + tremida. <1,2s, toque pula, respeita reduced-motion. */
export function TrucoMoment({ text, sub, kind, onDone, ms = 1100 }: { text: string; sub?: string; kind: MomentKind; onDone: () => void; ms?: number }) {
  useEffect(() => { const t = setTimeout(onDone, ms); const k = (e: KeyboardEvent) => e.key === 'Escape' && onDone(); addEventListener('keydown', k); return () => { clearTimeout(t); removeEventListener('keydown', k); }; }, [text, onDone, ms]);
  return (
    <div className={`moment moment--${kind}`} onPointerDown={onDone} role="alert" aria-live="assertive">
      <div className="moment-banner"><span className="moment-text">{text}</span>{sub && <small>{sub}</small>}</div>
      <span className="moment-skip">toque pra pular</span>
    </div>);
}
