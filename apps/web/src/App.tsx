import { useState } from 'react';
import { DECK_PRESETS, Card } from '@truco/engine';
import { Table, TableSeat } from './components/Table';
import { DemoTable } from './components/DemoTable';
import { MeusBerros } from './components/MeusBerros';
import { audio, AudioSettings } from './audio/AudioManager';
const params = new URLSearchParams(location.search);
import { PlayingCard } from './components/PlayingCard';
import { CreateRoom } from './components/CreateRoom';
import { Lobby } from './components/Lobby';
import { OnlineTable } from './components/OnlineTable';
import { useRoomState, call, socket } from './net';

const PREVIEW_SEATS: TableSeat[] = [
  { nickname: 'Você', team: 0, cardCount: 3, isTurn: true }, { nickname: 'Tião', team: 1, cardCount: 2 },
  { nickname: 'Parça', team: 0, cardCount: 2 }, { nickname: 'Baixinho', team: 1, cardCount: 2, connected: false },
];
const MY: Card[] = [{ rank: '3', suit: 'copas' }, { rank: '7', suit: 'ouros' }, { rank: 'A', suit: 'espadas' }];
const CENTER = [{ seat: 1, card: { rank: 'K', suit: 'paus' } as Card }, { seat: 2, card: { rank: '2', suit: 'ouros' } as Card }, { seat: 3, card: { rank: 'J', suit: 'copas' } as Card }];

type Screen = 'entry' | 'menu' | 'rules' | 'settings' | 'table' | 'join' | 'berros' | 'create' | 'room';
export default function App() {
  const [nick, setNick] = useState(() => localStorage.getItem('tq:nick') ?? '');
  const [sound, setSound] = useState(() => localStorage.getItem('tq:sound') !== 'off');
  const [screen, setScreen] = useState<Screen>(() => (new URLSearchParams(location.search).get('screen') as Screen) || 'entry');
  const [err, setErr] = useState('');
  const [code, setCode] = useState(() => (params.get('sala') ?? '').toUpperCase());
  const { st, connected, clear } = useRoomState();
  const [joinErr, setJoinErr] = useState(''), [canWatch, setCanWatch] = useState(false);
  const join = async (role: 'player' | 'spectator', c = code, nn = nick) => {
    setJoinErr(''); socket();
    const r = await call('room:join', { code: c.trim(), nickname: nn.trim(), role });
    if (!r.ok) { setJoinErr(r.error); setCanWatch(/assistir/.test(r.error)); setScreen('join'); return; }
    setScreen('room');
  };
  const leaveRoom = () => { clear(); history.replaceState(null, '', location.pathname); setCode(''); setScreen('menu'); };
  const [seatCount, setSeatCount] = useState(() => Number(new URLSearchParams(location.search).get('n')) || 4);
  const toggleSound = () => { audio.unlock(); setSound((s) => { localStorage.setItem('tq:sound', s ? 'off' : 'on'); audio.set({ muteAll: s }); return !s; }); };
  const [as, setAs] = useState<AudioSettings>(audio.settings);
  const upd = (p: Partial<AudioSettings>) => { audio.unlock(); audio.set(p); setAs({ ...audio.settings }); if ('ambient' in p || 'privacy' in p) audio.ambient(!audio.settings.privacy && audio.settings.ambient > 0); };
  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nick.trim();
    if (n.length < 2) return setErr('Fala teu apelido aí (mínimo 2 letras).');
    localStorage.setItem('tq:nick', n); setErr(''); audio.unlock(); socket();
    if (code) join('player', code, n); else setScreen('menu');
  };
  const SoundBtn = <button type="button" className="icon-btn" onClick={toggleSound} aria-pressed={sound}>{sound ? '🔊 Som ligado' : '🔇 Som desligado'}</button>;

  if (screen === 'entry') return (
    <main className="screen entry">
      <div className="streetlight" aria-hidden />
      <h1 className="logo"><span>TRUCO</span><small>DA</small><span>QUEBRADA</span></h1>
      <p className="tagline">O truco raiz, agora online. Chama a rapaziada.</p>
      {code && <p className="invite-banner">🃏 Você foi chamado pra mesa <b>{code}</b>. Põe teu apelido e entra!</p>}
      <div className="preview" aria-hidden><Table seats={PREVIEW_SEATS} spectators={['Dona Cida', 'Juninho']} center={CENTER} vira={{ rank: '4', suit: 'paus' }} score={[7, 9]} value={3} compact /></div>
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
      <h3>Baralho (confirmado)</h3>
      <p><b>{DECK_PRESETS.sujo.label}:</b> {DECK_PRESETS.sujo.ranks.join(' ')}<br /><b>{DECK_PRESETS.limpo.label}:</b> {DECK_PRESETS.limpo.ranks.join(' ')}</p>
      <p className="notice">Composição confirmada; continua editável na criação da mesa.</p>
      <h3>Mão de onze / mão de ferro</h3><p>Time com 11 vê as cartas do parceiro e decide: joga valendo 3 ou corre (adversário leva 1). Sem truco. 11 a 11: mão de ferro, todo mundo às cegas, vale 3, sem truco. Em 6 jogadores qualquer um pode pedir truco.</p>
      {back}</main>);
  if (screen === 'settings') return (
    <main className="screen panel"><h2>Configurações de áudio</h2>{SoundBtn}
      {([['effects', 'Efeitos (cartas, mesa)'], ['voices', 'Berros automáticos'], ['ambient', 'Ambiente do boteco'], ['clips', 'Áudios da galera']] as const).map(([k2, label]) =>
        <label key={k2} className="slider">{label}<input type="range" min={0} max={1} step={0.05} value={as[k2]} onChange={(e) => upd({ [k2]: Number(e.target.value) })} /></label>)}
      <label className="check"><input type="checkbox" checked={as.muteAll} onChange={(e) => upd({ muteAll: e.target.checked })} /> Silenciar tudo</label>
      <label className="check"><input type="checkbox" checked={as.privacy} onChange={(e) => upd({ privacy: e.target.checked })} /> Modo privacidade (sem berros, zoeira, áudios e ambiente)</label>
      <button className="btn" onClick={() => { audio.unlock(); audio.cardSlap(); setTimeout(() => audio.stinger('truco'), 250); }}>🔊 Testar som</button>
      <button className="btn" onClick={() => setScreen('berros')}>🎙️ Gravar meus berros</button>
      <p className="notice">O jogo funciona 100% com tudo mudo.</p>{back}</main>);
  if (screen === 'join') return (
    <main className="screen panel"><h2>Entrar por código</h2>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="CÓDIGO DA MESA" aria-label="código da mesa" />
      {joinErr && <p className="error" role="alert">{joinErr}</p>}
      <button className="btn primary" disabled={code.length < 4} onClick={() => join('player')}>Sentar na mesa</button>
      <button className={`btn${canWatch ? ' primary' : ''}`} disabled={code.length < 4} onClick={() => join('spectator')}>👀 Assistir</button>{back}</main>);
  if (screen === 'create') return (<main className="screen panel"><h2>Criar mesa</h2><CreateRoom nick={nick} onCreated={() => setScreen('room')} />{back}</main>);
  if (screen === 'room') {
    if (!st) return (<main className="screen panel"><p className="notice">{connected ? 'Carregando mesa…' : 'Conectando ao servidor…'}</p>{back}</main>);
    return (<main className={`screen ${st.view ? 'game' : 'panel'}`}>
      {!connected && <p className="error" role="alert">Conexão caiu — tentando voltar… (seu lugar fica guardado)</p>}
      {st.view ? <OnlineTable st={st} onLeave={leaveRoom} /> : <><h2>Mesa {st.room.code}</h2><Lobby st={st} onLeave={leaveRoom} /></>}
    </main>);
  }
  if (screen === 'table') return (
    <main className="screen game">
      <div className="seg">{[2, 4, 6].map((k) => <button key={k} className={`btn small${k === seatCount ? ' primary' : ''}`} onClick={() => setSeatCount(k)}>{k} jogadores</button>)}</div>
      <DemoTable nick={nick} n={seatCount as 2 | 4 | 6} demo={params.get('demo')} />{back}</main>);
  if (screen === 'berros') return (<main className="screen panel"><h2>Gravar meus berros</h2><MeusBerros />{back}</main>);
  return (
    <main className="screen menu">
      <h1 className="logo small"><span>TRUCO</span><small>DA</small><span>QUEBRADA</span></h1>
      <p className="hello">E aí, <b>{nick}</b>! Bora?</p>
      <nav className="menu-list">
        <button className="btn primary" onClick={() => setScreen('create')}>Criar mesa</button>
        <button className="btn" onClick={() => setScreen('join')}>Entrar por código</button>
        <button className="btn" onClick={() => setScreen('create')}>Jogar com amigos</button>
        <button className="btn" onClick={() => setScreen('table')}>Treino local</button>
        <button className="btn" disabled>Contra bots (em breve)</button>
        <button className="btn" onClick={() => setScreen('rules')}>Regras</button>
        <button className="btn" onClick={() => setScreen('settings')}>Configurações</button>
      </nav>
      <button className="btn ghost" onClick={() => setScreen('entry')}>Trocar apelido</button>
    </main>);
}
