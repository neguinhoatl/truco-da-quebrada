import { useEffect, useRef, useState } from 'react';
import { BERROS, Berro } from '@truco/engine';
import { saveBerro, getBerro, deleteBerro, listBerros, startRecording, Recorder } from '../audio/recordings';
const CAT: Record<string, string> = { chamadas: 'Chamadas', provocacoes: 'Provocações', comemoracoes: 'Comemorações', derrota: 'Derrota', especiais: 'Especiais' };
/** Grave sua própria voz pra cada berro. Fica só no seu aparelho (IndexedDB). */
export function MeusBerros() {
  const [have, setHave] = useState<string[]>([]), [recId, setRecId] = useState<string | null>(null), [err, setErr] = useState('');
  const rec = useRef<Recorder | null>(null);
  const refresh = () => listBerros().then(setHave).catch(() => setErr('Seu navegador bloqueou o armazenamento local.'));
  useEffect(() => { refresh(); }, []);
  const toggle = async (b: Berro) => {
    if (recId === b.id && rec.current) { const out = await rec.current.stop(); rec.current = null; setRecId(null); await saveBerro(b.id, out.blob); refresh(); return; }
    try { setErr(''); rec.current = await startRecording(4000, () => toggle(b)); setRecId(b.id); } catch { setErr('Sem permissão do microfone.'); }
  };
  const play = async (id: string) => { const blob = await getBerro(id); if (blob) new Audio(URL.createObjectURL(blob)).play(); };
  return (
    <div className="berros">
      <p className="notice">🎙️ Grave do seu jeito (até 4s cada). Fica <b>só no seu aparelho</b>; nas próximas fases seus amigos vão ouvir quando VOCÊ pedir truco. Sem gravação, sai o balão + um efeito de impacto (nada de voz robótica).</p>
      {err && <p className="error">{err}</p>}
      {Object.keys(CAT).map((c) => <section key={c}><h3>{CAT[c]}</h3>
        {BERROS.filter((b) => b.category === c).map((b) => <div key={b.id} className="berro-row">
          <span className="berro-text">“{b.text}”</span>
          <button className={`btn small${recId === b.id ? ' truco' : ''}`} onClick={() => toggle(b)}>{recId === b.id ? '⏹ Parar' : have.includes(b.id) ? '🎙️ Regravar' : '🎙️ Gravar'}</button>
          {have.includes(b.id) && <><button className="btn small ghost" onClick={() => play(b.id)}>▶</button><button className="btn small ghost" onClick={() => deleteBerro(b.id).then(refresh)} aria-label="apagar">🗑️</button></>}
        </div>)}</section>)}
    </div>);
}
