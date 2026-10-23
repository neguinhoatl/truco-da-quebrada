import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, applyAction, getPlayerView, legalActions, deriveEvents, ZoeiraDirector, CALL_LABEL, GameState, Action, ZoeiraEvent, teamOf } from '@truco/engine';
import { Table, TableSeat } from './Table';
import { TrucoMoment, MomentKind } from './TrucoMoment';
import { ClipButton } from './ClipButton';
import { audio } from '../audio/AudioManager';

const NAMES = ['Você', 'Tião', 'Parça', 'Baixinho', 'Seu Zé', 'Nega'];
/** Mesa de treino local (Fase 1): motor real no navegador, você controla quem está na vez. Fase 2 = servidor autoritativo. */
export function DemoTable({ nick, n, demo }: { nick: string; n: 2 | 4 | 6; demo?: string | null }) {
  const [g, setG] = useState<GameState>(() => createGame({ playersCount: n }));
  const [moment, setMoment] = useState<{ text: string; sub?: string; kind: MomentKind; seat: number | null } | null>(null);
  const [bubbles, setBubbles] = useState<{ seat: number | null; text: string; key: number }[]>([]);
  const [err, setErr] = useState('');
  const director = useRef(new ZoeiraDirector()); const k = useRef(0);
  const names = NAMES.map((x, i) => (i === 0 ? nick || x : x));
  useEffect(() => { setG(createGame({ playersCount: n })); }, [n]);

  const bubble = (seat: number | null, text: string) => { const key = ++k.current; setBubbles((b) => [...b.slice(-4), { seat, text, key }]); setTimeout(() => setBubbles((b) => b.filter((x) => x.key !== key)), 2200); };
  const react = useCallback((events: ZoeiraEvent[], next: GameState) => {
    const now = performance.now();
    for (const e of events) {
      if (e.type === 'truco_call') setMoment({ text: CALL_LABEL(e.value, next.rules.variant), sub: `${names[e.seat]} pediu! Vale ${e.value}`, kind: 'call', seat: e.seat });
      if (e.type === 'run') setMoment({ text: 'CORREU!', sub: `${names[e.seat]} amarelou`, kind: 'run', seat: e.seat });
      if (e.type === 'hand_win' && !events.some((x) => x.type === 'run')) setMoment({ text: e.team === 0 ? 'É NOSSA!' : 'FOI DELES…', sub: `+${e.points} ${e.team === 0 ? 'pra nós' : 'pra eles'}`, kind: 'win', seat: null });
      if (e.type === 'match_win') setMoment({ text: e.team === 0 ? 'GANHAMO, RAPAZIADA!' : 'PERDEMO…', kind: 'win', seat: null });
      if (e.type === 'mao_de_ferro') setMoment({ text: 'MÃO DE FERRO!', sub: 'Todo mundo às cegas', kind: 'special', seat: null });
      const shout = director.current.react(e, now);
      if (shout) {
        // quem grita: o chamador; na corrida/vitória, alguém do time que se deu bem
        const winTeam = e.type === 'run' ? e.callerTeam : e.type === 'hand_win' || e.type === 'match_win' ? e.team : null;
        const seat = shout.seat ?? (winTeam !== null ? [...Array(n).keys()].find((s) => teamOf(s) === winTeam)! : null);
        bubble(seat, shout.berro.text);
        audio.berro(shout.berro, { mine: seat === 0 });
      }
    }
  }, [n, nick]); // eslint-disable-line

  const act = (a: Action) => {
    audio.unlock();
    const r = applyAction(g, a);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); if (a.type === 'play') audio.cardSlap();
    react(deriveEvents(g, r.state), r.state); setG(r.state);
    if (r.state.pending && a.type !== 'accept') setTimeout(() => { const s = director.current.react({ type: 'pending', seat: r.state.pending!.callerSeat, value: r.state.pending!.proposed }, performance.now()); if (s) bubble(r.state.pending!.callerSeat, s.berro.text); }, 1300);
  };
  useEffect(() => { if (demo === 'truco') { const t = setTimeout(() => act({ type: 'truco', seat: g.turn }), 300); return () => clearTimeout(t); } }, []); // eslint-disable-line

  const v = getPlayerView(g, 0);
  const responder = g.pending ? [...Array(n).keys()].find((s) => teamOf(s) !== g.pending!.callerTeam)! : null;
  const actor = g.phase === 'onze_decision' ? [...Array(n).keys()].find((s) => teamOf(s) === g.onzeTeam)! : responder ?? g.turn;
  const legal = legalActions(g, actor);
  const seats: TableSeat[] = v.seats.map((s) => ({ nickname: names[s.seat], team: s.team, cardCount: s.cardCount, isTurn: s.seat === actor, connected: true }));
  const center = g.currentPlays.length ? g.currentPlays : (g.rounds.at(-1)?.plays ?? []);
  const myCards = actor === 0 ? (v.seats[0].cards ?? []).filter(Boolean) as any : [];
  return (<>
    <div className={moment?.kind === 'call' ? 'shake-wrap' : ''}>
      <Table seats={seats} spectators={['Dona Cida', 'Juninho', 'Cabeça', 'Lú']} myCards={myCards} center={center} vira={g.vira} score={g.score} value={g.value}
        bubbles={bubbles} highlightSeat={moment?.seat ?? null} shake={moment?.kind === 'call'} onPlay={(i) => act({ type: 'play', seat: 0, cardIndex: i })} />
    </div>
    {moment && <TrucoMoment key={moment.text + g.history.length} text={moment.text} sub={moment.sub} kind={moment.kind} onDone={() => setMoment(null)} />}
    <p className="notice">Vez de: <b>{names[actor]}</b> · treino local (você joga por todos)</p>
    <div className="actions">
      {legal.includes('truco') && <button className="btn truco" onClick={() => act({ type: 'truco', seat: actor })}>{CALL_LABEL(({ 1: 3, 3: 6, 6: 9, 9: 12, 2: 4, 4: 6, 8: 10, 10: 12 } as any)[g.value] ?? 12, g.rules.variant)}</button>}
      {legal.includes('accept') && <button className="btn primary" onClick={() => act({ type: 'accept', seat: actor })}>ACEITA</button>}
      {legal.includes('raise') && <button className="btn truco" onClick={() => act({ type: 'raise', seat: actor })}>AUMENTA ({CALL_LABEL(({ 3: 6, 6: 9, 9: 12, 4: 6 } as any)[g.pending!.proposed] ?? 12, g.rules.variant)})</button>}
      {legal.includes('run') && <button className="btn ghost" onClick={() => act({ type: 'run', seat: actor })}>CORRE</button>}
      {legal.includes('onze_play') && <><button className="btn primary" onClick={() => act({ type: 'onze_play', seat: actor })}>Jogar a mão de onze</button><button className="btn ghost" onClick={() => act({ type: 'onze_run', seat: actor })}>Correr</button></>}
      {legal.includes('play') && actor !== 0 && <button className="btn" onClick={() => act({ type: 'play', seat: actor, cardIndex: 0 })}>{names[actor]} joga</button>}
      {g.phase === 'match_over' && <button className="btn primary" onClick={() => setG(createGame({ playersCount: n }))}>Jogar outra</button>}
    </div>
    {err && <p className="error" role="alert">{err}</p>}
    <ClipButton autoStartDemo={demo === 'rec'} onSend={async () => 'Na Fase 2 o áudio vai pra mesa pelo servidor (clip:send). Por ora fica só aqui.'} />
  </>);
}
