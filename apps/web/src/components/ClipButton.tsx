import { useEffect, useRef, useState } from 'react';
import { startRecording, Recorder } from '../audio/recordings';
/** Botão de áudio estilo WhatsApp: segura pra gravar (máx 10s), arrasta pra fora/solta fora = cancela, prévia, enviar. */
export function ClipButton({ onSend, disabled, autoStartDemo }: { onSend: (blob: Blob, durationMs: number) => Promise<string | null>; disabled?: boolean; autoStartDemo?: boolean }) {
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'preview' | 'sending'>('idle');
  const [elapsed, setElapsed] = useState(0), [level, setLevel] = useState(0), [cancelArmed, setCancelArmed] = useState(false);
  const [msg, setMsg] = useState(''); const [clip, setClip] = useState<{ blob: Blob; durationMs: number; url: string } | null>(null);
  const rec = useRef<Recorder | null>(null), startX = useRef(0), raf = useRef(0), t0 = useRef(0);
  const begin = async () => {
    setMsg(''); setState('asking');
    try {
      rec.current = await startRecording(10_000, () => finish(false));
      t0.current = performance.now(); setState('recording');
      const tick = () => { setElapsed(performance.now() - t0.current); setLevel(rec.current?.level() ?? 0); raf.current = requestAnimationFrame(tick); }; tick();
    } catch { setState('idle'); setMsg('Sem permissão do microfone. Libera nas configurações do navegador.'); }
  };
  const finish = async (cancel: boolean) => {
    cancelAnimationFrame(raf.current);
    const r = rec.current; rec.current = null; if (!r) return;
    if (cancel) { r.cancel(); setState('idle'); setMsg('Áudio cancelado'); return; }
    const out = await r.stop();
    if (out.durationMs < 400) { setState('idle'); setMsg('Muito curto — segura o botão enquanto fala'); return; }
    setClip({ ...out, url: URL.createObjectURL(out.blob) }); setState('preview');
  };
  useEffect(() => { if (autoStartDemo) begin(); return () => { rec.current?.cancel(); cancelAnimationFrame(raf.current); }; }, []); // eslint-disable-line
  const send = async () => { if (!clip) return; setState('sending'); const e = await onSend(clip.blob, clip.durationMs); setMsg(e ?? 'Áudio enviado pra mesa 🔥'); URL.revokeObjectURL(clip.url); setClip(null); setState('idle'); };
  const discard = () => { if (clip) URL.revokeObjectURL(clip.url); setClip(null); setState('idle'); };
  return (
    <div className="clip">
      {state === 'recording' && <div className={`clip-rec${cancelArmed ? ' cancel' : ''}`} role="status">
        <span className="rec-dot" /> <b>GRAVANDO</b> <span className="mono">{(elapsed / 1000).toFixed(1)}s / 10s</span>
        <span className="meter"><i style={{ width: `${Math.min(100, level * 160)}%` }} /></span>
        <small>{cancelArmed ? 'Solta pra cancelar' : '← arrasta pra cancelar'}</small>
      </div>}
      {state === 'preview' && clip && <div className="clip-preview">
        <audio src={clip.url} controls preload="auto" /><span className="mono">{(clip.durationMs / 1000).toFixed(1)}s</span>
        <button className="btn small ghost" onClick={discard}>🗑️ Apagar</button><button className="btn small primary" onClick={send}>Enviar ➤</button>
      </div>}
      {(state === 'idle' || state === 'asking' || state === 'recording') && (
        <button className={`clip-btn${state === 'recording' ? ' on' : ''}`} disabled={disabled} aria-label="Segure para gravar áudio de zoeira"
          onPointerDown={(e) => { if (state !== 'idle') return; (e.target as HTMLElement).setPointerCapture(e.pointerId); startX.current = e.clientX; setCancelArmed(false); begin(); }}
          onPointerMove={(e) => state === 'recording' && setCancelArmed(startX.current - e.clientX > 70 || e.clientY < (e.currentTarget.getBoundingClientRect().top - 60))}
          onPointerUp={() => state === 'recording' && finish(cancelArmed)} onPointerCancel={() => finish(true)}>
          🎙️<span>{state === 'asking' ? 'Liberando mic…' : state === 'recording' ? 'Solta pra parar' : 'Segura e zoa'}</span>
        </button>)}
      {msg && <p className="notice clip-msg">{msg}</p>}
    </div>);
}
