import { useState } from 'react';
import { DECK_PRESETS, RANK_ORDER, Rank, buildDeck } from '@truco/engine';
import { PlayingCard } from './PlayingCard';
import { call } from '../net';
const ALL: Rank[] = ['A', '2', '3', '4', '5', '6', '7', 'Q', 'J', 'K'];
export function CreateRoom({ nick, onCreated }: { nick: string; onCreated: (code: string) => void }) {
  const [playersCount, setPC] = useState<2 | 4 | 6>(4), [variant, setV] = useState<'paulista' | 'mineiro'>('paulista');
  const [preset, setPreset] = useState<'sujo' | 'limpo' | 'custom'>('sujo'), [ranks, setRanks] = useState<Rank[]>([...DECK_PRESETS.sujo.ranks]);
  const [targetScore, setT] = useState(12), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const pick = (p: 'sujo' | 'limpo') => { setPreset(p); setRanks([...DECK_PRESETS[p].ranks]); };
  const toggle = (r: Rank) => { setPreset('custom'); setRanks((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r])); };
  const deck = buildDeck(RANK_ORDER.filter((r) => ranks.includes(r)).reverse());
  const create = async () => {
    setBusy(true); setErr('');
    const r = await call('room:create', { nickname: nick, rules: { playersCount, variant, deckPreset: preset, deckRanks: ranks, targetScore } });
    setBusy(false); if (!r.ok) return setErr(r.error); onCreated(r.code);
  };
  return (<div className="create">
    <h3>Jogadores</h3><div className="seg">{([2, 4, 6] as const).map((k) => <button key={k} className={`btn small${k === playersCount ? ' primary' : ''}`} onClick={() => setPC(k)}>{k === 2 ? '1 x 1' : k === 4 ? '2 x 2' : '3 x 3'}</button>)}</div>
    <h3>Modalidade</h3><div className="seg">{(['paulista', 'mineiro'] as const).map((k) => <button key={k} className={`btn small${k === variant ? ' primary' : ''}`} onClick={() => setV(k)}>{k === 'paulista' ? 'Paulista' : 'Mineiro'}</button>)}</div>
    <h3>Baralho</h3><div className="seg">
      <button className={`btn small${preset === 'sujo' ? ' primary' : ''}`} onClick={() => pick('sujo')}>SUJO (40)</button>
      <button className={`btn small${preset === 'limpo' ? ' primary' : ''}`} onClick={() => pick('limpo')}>LIMPO (24)</button></div>
    <p className="notice">Toque nas cartas pra editar a composição {preset === 'custom' && <b>(personalizado)</b>}:</p>
    <div className="seg wrap">{ALL.map((r) => <button key={r} className={`btn small chip${ranks.includes(r) ? ' primary' : ''}`} onClick={() => toggle(r)}>{r}</button>)}</div>
    <div className="deck-preview" aria-label={`${deck.length} cartas`}>{deck.filter((c) => c.suit === 'espadas').map((c, i) => <PlayingCard key={i} small card={c} />)}<span className="notice">× 4 naipes = <b>{deck.length} cartas</b></span></div>
    <h3>Pontos pra ganhar</h3><div className="seg">{[12, 15, 24].map((k) => <button key={k} className={`btn small${k === targetScore ? ' primary' : ''}`} onClick={() => setT(k)}>{k}</button>)}</div>
    {err && <p className="error" role="alert">{err}</p>}
    <button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Criando…' : 'CRIAR MESA'}</button>
  </div>);
}
