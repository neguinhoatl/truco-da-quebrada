import { useEffect, useRef, useState } from 'react';
import { ZoeiraDirector, CALL_LABEL, ZoeiraEvent, trucoLadder } from '@truco/engine';
import { Table, TableSeat } from './Table';
import { TrucoMoment, MomentKind } from './TrucoMoment';
import { ClipButton } from './ClipButton';
import { audio } from '../audio/AudioManager';
import { RoomState, call, socket } from '../net';

export function OnlineTable({ st, onLeave }: { st: RoomState; onLeave: () => void }) {
  const { room, you, view, legal } = st;
  const n = room.seats.length; const me = you.seat ?? 0;
  const [moment, setMoment] = useState<{ text: string; sub?: string; kind: MomentKind; seat: number | null } | null>(null);
  const [bubbles, setBubbles] = useState<{ seat: number | null; text: string; key: number }[]>([]);
  const [err, setErr] = useState(''); const [muted, setMuted] = useState<string[]>([...audio.mutedPlayers]);
  const director = useRef(new ZoeiraDirector()); const k = useRef(0);
  const disp = (seat: number) => (seat - me + n) % n; // você sempre embaixo
  const name = (seat: number) => room.seats[seat]?.nickname ?? `Lugar ${seat + 1}`;
  const bubble = (seat: number | null, text: string) => { const key = ++k.current; setBubbles((b) => [...b.slice(-4), { seat: seat === null ? null : disp(seat), text, key }]); setTimeout(() => setBubbles((b) => b.filter((x) => x.key !== key)), 2200); };

  // eventos do servidor -> animações e berros
  useEffect(() => {
    const now = performance.now();
    for (const e of st.events as (ZoeiraEvent | { type: string; seat?: number })[]) {
      if (e.type === 'card_played') audio.cardSlap();
      const z = e as ZoeiraEvent;
      if (z.type === 'truco_call') setMoment({ text: CALL_LABEL(z.value, room.rules.variant), sub: `${name(z.seat)} pediu! Vale ${z.value}`, kind: 'call', seat: disp(z.seat) });
      if (z.type === 'run') setMoment({ text: 'CORREU!', sub: `${name(z.seat)} correu`, kind: 'run', seat: disp(z.seat) });
      if (z.type === 'hand_win' && !st.events.some((x) => x.type === 'run' || x.type === 'match_win')) setMoment({ text: you.role === 'player' && z.team === view.yourTeam ? 'É NOSSA!' : `TIME ${z.team === 0 ? 'A' : 'B'}!`, sub: `+${z.points}`, kind: 'win', seat: null });
      if (z.type === 'match_win') setMoment({ text: you.role === 'player' ? (z.team === view.yourTeam ? 'GANHAMO, RAPAZIADA!' : 'PERDEMO…') : `TIME ${z.team === 0 ? 'A' : 'B'} VENCEU!`, kind: 'win', seat: null });
      if (z.type === 'mao_de_ferro') setMoment({ text: 'MÃO DE FERRO!', sub: 'Todo mundo às cegas', kind: 'special', seat: null });
      if (!['truco_call', 'run', 'round_win', 'hand_win', 'match_win', 'mao_de_ferro', 'mao_de_onze'].includes(z.type)) continue;
      const shout = director.current.react(z, now);
      if (shout) {
        const winTeam = z.type === 'run' ? z.callerTeam : z.type === 'hand_win' || z.type === 'match_win' ? z.team : null;
        const seat = shout.seat ?? (winTeam !== null ? room.seats.find((s: any) => s.team === winTeam)?.seat ?? null : null);
        bubble(seat, shout.berro.text); audio.berro(shout.berro, { mine: seat === you.seat });
      }
    }
  }, [st]); // eslint-disable-line

  // áudios de zoeira dos outros
  useEffect(() => {
    const s = socket();
    const onClip = async (m: any) => {
      const played = await audio.clip(m.fromId, new Blob([m.data], { type: m.mime }));
      if (played) bubble(m.seat, `🎙️ ${m.nickname}`);
    };
    s.on('clip:receive', onClip); return () => { s.off('clip:receive', onClip); };
  }, [me]); // eslint-disable-line

  const act = async (p: any) => { audio.unlock(); const r = await call('game:action', p); setErr(r.ok ? '' : r.error); };
  const host = async (ev: string, msg: string) => { if (!confirm(msg)) return; const r = await call(ev, { confirm: true }); if (!r.ok) setErr(r.error); };
  const sendClip = async (blob: Blob, durationMs: number) => { const r = await call('clip:send', { mime: blob.type, data: await blob.arrayBuffer(), durationMs }); return r.ok ? null : r.error; };

  const order = Array.from({ length: n }, (_, i) => (me + i) % n);
  const actorSeat = view.pending ? null : view.phase === 'onze_decision' ? null : view.turn;
  const seats: TableSeat[] = order.map((seat) => { const sv = view.seats[seat]; const rs = room.seats[seat];
    return { nickname: rs.nickname ?? 'vago', team: sv.team, cardCount: sv.cardCount, connected: rs.connected, isTurn: actorSeat === seat, look: seat }; });
  const myCards = you.role === 'player' ? view.seats[me].cards ?? [] : [];
  const center = view.currentPlays.length ? view.currentPlays : (view.rounds.at(-1)?.plays ?? []);
  const ladder = trucoLadder(room.rules.variant); const nextVal = (v: number) => ladder[ladder.indexOf(v) + 1] ?? 12;
  const myScore = you.role === 'player' ? view.yourTeam : 0;
  const score: [number, number] = myScore === 0 ? view.score : [view.score[1], view.score[0]];
  const partners = view.mode === 'onze' && view.onzeTeam === view.yourTeam ? view.seats.filter((s: any) => s.seat !== me && s.cards) : [];
  const status = view.phase === 'match_over' ? 'Fim de jogo!' : view.pending ? `${name(view.pending.callerSeat)} pediu ${view.pending.proposed}. ${legal.includes('accept') ? 'Aceita ou corre?' : 'Esperando resposta…'}`
    : view.phase === 'onze_decision' ? (legal.includes('onze_play') ? 'MÃO DE ONZE: veja as cartas do parceiro e decida.' : 'Adversário decidindo a mão de onze…')
    : view.turn === me && you.role === 'player' ? 'Sua vez! Escolhe a carta.' : `Vez de ${name(view.turn)}`;

  return (<>
    <Table labels={you.role === 'spectator' ? ['TIME A', 'TIME B'] : ['NÓS', 'ELES']} seats={seats} spectators={room.spectators.map((x: any) => x.nickname)} myCards={myCards} center={center} vira={view.vira} score={score} value={view.value}
      bubbles={bubbles} highlightSeat={moment?.seat ?? null} shake={moment?.kind === 'call'} onPlay={legal.includes('play') ? (i) => act({ type: 'play', cardIndex: i }) : undefined} />
    {moment && <TrucoMoment key={moment.text + view.history.length} text={moment.text} sub={moment.sub} kind={moment.kind} onDone={() => setMoment(null)} />}
    <p className="status" role="status">{status}{view.mode === 'ferro' && ' · MÃO DE FERRO (às cegas)'}</p>
    {partners.length > 0 && <div className="partners">Cartas do parceiro: {partners.map((p: any) => <span key={p.seat}>{name(p.seat)}: {p.cards.map((c: any) => `${c.rank}${{ paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' }[c.suit as 'paus']}`).join(' ')}</span>)}</div>}
    <div className="actions">
      {legal.includes('truco') && <button className="btn truco" onClick={() => act({ type: 'truco' })}>{CALL_LABEL(nextVal(view.value), room.rules.variant)}</button>}
      {legal.includes('accept') && <button className="btn primary" onClick={() => act({ type: 'accept' })}>ACEITA</button>}
      {legal.includes('raise') && <button className="btn truco" onClick={() => act({ type: 'raise' })}>AUMENTA ({CALL_LABEL(nextVal(view.pending.proposed), room.rules.variant)})</button>}
      {legal.includes('run') && <button className="btn ghost" onClick={() => act({ type: 'run' })}>CORRE</button>}
      {legal.includes('onze_play') && <><button className="btn primary" onClick={() => act({ type: 'onze_play' })}>JOGAR (vale 3)</button><button className="btn ghost" onClick={() => act({ type: 'onze_run' })}>CORRER (dá 1)</button></>}
    </div>
    {err && <p className="error" role="alert">{err}</p>}
    {view.phase === 'match_over' && (you.isHost ? <button className="btn primary" onClick={() => call('room:restart')}>JOGAR OUTRA (mesma galera)</button> : <p className="notice">Esperando o dono chamar outra…</p>)}
    <ClipButton onSend={sendClip} />
    <details className="mutes"><summary>🔇 Silenciar áudios de alguém</summary>
      {[...room.seats.filter((s: any) => s.playerId && s.playerId !== you.playerId), ...room.spectators.filter((x: any) => x.playerId !== you.playerId)].map((p: any) =>
        <label key={p.playerId} className="check"><input type="checkbox" checked={muted.includes(p.playerId)} onChange={() => { audio.toggleMutePlayer(p.playerId); setMuted([...audio.mutedPlayers]); }} /> {p.nickname}</label>)}
    </details>
    <p className="notice">Mesa <b>{room.code}</b> · {you.role === 'spectator' ? 'você está assistindo 👀' : `você é o Time ${view.yourTeam === 0 ? 'A' : 'B'}`}</p>
    {you.isHost && view.phase !== 'match_over' && <div className="seg"><button className="btn small ghost" onClick={() => host('room:restart', 'Reiniciar a partida pra todo mundo?')}>↺ Reiniciar</button><button className="btn small ghost" onClick={() => host('room:end', 'Encerrar a partida pra todo mundo?')}>■ Encerrar</button></div>}
    <button className="btn ghost" onClick={async () => { if (you.role === 'player' && view.phase !== 'match_over' && !confirm('Sair da partida? Seu lugar fica guardado por um tempo.')) return; await call('room:leave'); onLeave(); }}>Sair</button>
  </>);
}
