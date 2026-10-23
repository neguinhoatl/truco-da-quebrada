import { useState } from 'react';
import { DECK_PRESETS, Card } from '@truco/engine';
import { Table, TableSeat } from './components/Table';
import { PlayingCard } from './components/PlayingCard';

const PREVIEW_SEATS: TableSeat[] = [
  { nickname: 'Você', team: 0, cardCount: 3, isTurn: true }, { nickname: 'Tião', team: 1, cardCount: 2 },
  { nickname: 'Parça', team: 0, cardCount: 2 }, { nickname: 'Baixinho', team: 1, cardCount: 2, connected: false },
];
const MY: Card[] = [{ rank: '3', suit: 'copas' }, { rank: '7', suit: 'ouros' }, { rank: 'A', suit: 'espadas' }];
const CENTER = [{ seat: 1, card: { rank: 'K', suit: 'paus' } as Card }, { seat: 2, card: { rank: '2', suit: 'ouros' } as Card }, { seat: 3, card: { rank: 'J', suit: 'copas' } as Card }];

type Screen = 'entry' | 'menu' | 'rules' | 'settings' | 'table' | 'join';
export default function App() {
  const [nick, setNick] = useState(() => localStorage.getItem('tq:nick') ?? '');
  const [sound, setSound] = useState(() => localStorage.getItem('tq:sound') !== 'off');
  const [screen, setScreen] = useState<Screen>('entry');
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const toggleSound = () => { setSound((s) => { localStorage.setItem('tq:sound', s ? 'off' : 'on'); return !s; }); };
  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nick.trim();
    if (n.length < 2) return setErr('Fala teu apelido aí (mínimo 2 letras).');
    localStorage.setItem('tq:nick', n); setErr(''); setScreen('menu');
  };
  const SoundBtn = <button type="button" className="icon-btn" onClick={toggleSound} aria-pressed={sound}>{sound ? '🔊 Som ligado' : '🔇 Som desligado'}</button>;

  if (screen === 'entry') return (
    <main className="screen entry">
      <div className="streetlight" aria-hidden />
      <h1 className="logo"><span>TRUCO</span><small>DA</small><span>QUEBRADA</span></h1>
      <p className="tagline">O truco raiz, agora online. Chama a rapaziada.</p>
      <div className="preview" aria-hidden><Table seats={PREVIEW_SEATS} center={CENTER} vira={{ rank: '4', suit: 'paus' }} score={[7, 9]} value={3} compact /></div>
      <form onSubmit={enter} className="entry-form">
        <label htmlFor="nick">Seu nome ou apelido</label>
        <input id="nick" required maxLength={20} autoComplete="nickname" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Ex.: Zé do Bar" />
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary" type="submit">ENTRAR NA RESENHA</button>
        {SoundBtn}
        <p className="notice">🎙️ O microfone é <b>opcional</b>. Só liga se você quiser, e sempre com sua permissão.</p>
      </form>
    </main>);

  const back = <button className="btn ghost" onClick={() => setScreen('menu')}>← Voltar</button>;
  if (screen === 'rules') return (
    <main className="screen panel"><h2>Regras</h2>
      <h3>Paulista</h3><p>Vira define a manilha (próxima carta). Naipes da manilha: ♣ paus &gt; ♥ copas &gt; ♠ espadas &gt; ♦ ouros. Truco: 1 → 3 → 6 → 9 → 12.</p>
      <h3>Mineiro</h3><p>Manilhas fixas: 4♣ (zap) &gt; 7♥ (copas) &gt; A♠ (espadilha) &gt; 7♦ (pica-fumo). Truco: 2 → 4 → 6 → 8 → 10 → 12.</p>
      <h3>Força das cartas</h3><div className="row">{(['3', '2', 'A', 'K', 'J', 'Q', '7', '6', '5', '4'] as const).map((r) => <PlayingCard key={r} small card={{ rank: r, suit: 'espadas' }} />)}</div>
      <h3>Baralho (confirme com a rapaziada)</h3>
      <p><b>{DECK_PRESETS.sujo.label}:</b> {DECK_PRESETS.sujo.ranks.join(' ')}<br /><b>{DECK_PRESETS.limpo.label}:</b> {DECK_PRESETS.limpo.ranks.join(' ')}</p>
      <p className="notice">“Limpo” e “sujo” mudam de grupo pra grupo — a composição é editável na criação da mesa.</p>
      <h3>Mão de onze / mão de ferro</h3><p>Time com 11 vê as cartas do parceiro e decide: joga valendo 3 ou corre (adversário leva 1). Sem truco. 11 a 11: mão de ferro, todo mundo às cegas.</p>
      {back}</main>);
  if (screen === 'settings') return (
    <main className="screen panel"><h2>Configurações</h2>{SoundBtn}
      <p className="notice">Volumes separados (efeitos, vozes, ambiente), microfone e aparência chegam na Fase 3.</p>{back}</main>);
  if (screen === 'join') return (
    <main className="screen panel"><h2>Entrar por código</h2>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="CÓDIGO DA MESA" />
      <button className="btn primary" disabled title="Multiplayer na Fase 2">Entrar (em breve)</button>{back}</main>);
  if (screen === 'table') return (
    <main className="screen game"><Table seats={PREVIEW_SEATS.map((s, i) => i === 0 ? { ...s, nickname: nick } : s)} myCards={MY} center={CENTER} vira={{ rank: '4', suit: 'paus' }} score={[7, 9]} value={3} />
      <div className="actions"><button className="btn truco">TRUCO!</button><button className="btn">Aceitar</button><button className="btn ghost">Correr</button></div>
      <p className="notice">Mesa de demonstração — partida online chega na Fase 2.</p>{back}</main>);

  return (
    <main className="screen menu">
      <h1 className="logo small"><span>TRUCO</span><small>DA</small><span>QUEBRADA</span></h1>
      <p className="hello">E aí, <b>{nick}</b>! Bora?</p>
      <nav className="menu-list">
        <button className="btn primary" onClick={() => setScreen('table')}>Criar mesa</button>
        <button className="btn" onClick={() => setScreen('join')}>Entrar por código</button>
        <button className="btn" onClick={() => setScreen('table')}>Jogar com amigos</button>
        <button className="btn" disabled>Contra bots (em breve)</button>
        <button className="btn" onClick={() => setScreen('rules')}>Regras</button>
        <button className="btn" onClick={() => setScreen('settings')}>Configurações</button>
      </nav>
      <button className="btn ghost" onClick={() => setScreen('entry')}>Trocar apelido</button>
    </main>);
}
