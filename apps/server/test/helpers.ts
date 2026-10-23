import { io as client, Socket } from 'socket.io-client';
export interface C { s: Socket; token: string; playerId: string; state: any; states: any[]; events: any[]; clips: any[]; emit: (ev: string, p?: any) => Promise<any>; close: () => void }
export async function connect(url: string, token?: string): Promise<C> {
  const s = client(url, { auth: token ? { token } : {}, forceNew: true, transports: ['websocket'] });
  const c: C = { s, token: '', playerId: '', state: null, states: [], events: [], clips: [], emit: (ev, p = {}) => new Promise((r) => s.emit(ev, p, r)), close: () => s.close() };
  s.on('room:state', (st) => { c.state = st; c.states.push(st); c.events.push(...st.events); });
  s.on('clip:receive', (m) => c.clips.push(m));
  await new Promise<void>((r) => s.once('session', (x) => { c.token = x.token; c.playerId = x.playerId; r(); }));
  return c;
}
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function until(fn: () => boolean, ms = 3000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await wait(5); } }
/** Monta uma mesa com N jogadores, todos sentados, e começa. */
export async function table(url: string, n: 2 | 4 | 6, rules: any = {}) {
  const cs: C[] = [];
  for (let i = 0; i < n; i++) cs.push(await connect(url));
  const cr = await cs[0].emit('room:create', { nickname: 'Jog0', rules: { playersCount: n, ...rules } });
  if (!cr.ok) throw new Error(cr.error);
  for (let i = 1; i < n; i++) { const r = await cs[i].emit('room:join', { nickname: `Jog${i}`, code: cr.code }); if (!r.ok) throw new Error(r.error); }
  return { cs, code: cr.code as string };
}
/** Joga a partida inteira pela rede. policy decide a ação de quem tem ações legais. */
export async function playMatch(cs: C[], rnd: () => number, opts: { trucoRate?: number; runRate?: number; onStep?: (i: number) => Promise<void> | void } = {}) {
  let steps = 0;
  const seen = new Set<string>(); let calls = 0;
  while (true) {
    await until(() => cs.every((c) => c.state?.view));
    const st = cs[0].state;
    if (st.view.phase === 'match_over') return { steps, seen, final: st };
    const actor = cs.find((c) => c.state.legal.length > 0);
    if (!actor) throw new Error('ninguém pode agir');
    const legal: string[] = actor.state.legal;
    seen.add(actor.state.view.mode); legal.forEach((l) => seen.add(l));
    let type = legal[0];
    if (legal.includes('accept')) { calls++; type = calls % 3 === 1 ? 'accept' : calls % 3 === 2 ? 'run' : legal.includes('raise') && rnd() < 0.5 ? 'raise' : rnd() < (opts.runRate ?? 0.25) ? 'run' : 'accept'; }
    else if (legal.includes('onze_play')) type = rnd() < 0.8 ? 'onze_play' : 'onze_run';
    else if (legal.includes('truco') && legal.includes('play') && rnd() < (opts.trucoRate ?? 0.1)) type = 'truco';
    else if (legal.includes('play')) type = 'play';
    const n0 = actor.states.length;
    const others = cs.map((c) => c.states.length);
    const r = await actor.emit('game:action', type === 'play' ? { type, cardIndex: Math.floor(rnd() * actor.state.view.seats[actor.state.you.seat].cardCount) } : { type });
    if (!r.ok) throw new Error(`ação rejeitada ${type}: ${r.error}`);
    seen.add('did_' + type);
    await until(() => actor.states.length > n0 && cs.every((c, i) => c.states.length > others[i]));
    if (opts.onStep) await opts.onStep(steps);
    if (++steps > 5000) throw new Error('partida infinita');
  }
}
export const lcg = (seed: number) => { let x = seed; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };
