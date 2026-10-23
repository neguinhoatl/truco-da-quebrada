// TRUCO DA QUEBRADA — motor de regras puro (sem dependências)
export type Suit = 'paus' | 'copas' | 'espadas' | 'ouros';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K';
export interface Card { rank: Rank; suit: Suit }
export type Variant = 'paulista' | 'mineiro';
export type Team = 0 | 1;

export const SUITS: Suit[] = ['paus', 'copas', 'espadas', 'ouros'];
/** Força das cartas comuns, da mais fraca para a mais forte: 4<5<6<7<Q<J<K<A<2<3 */
export const RANK_ORDER: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
/** Ordem de naipes das manilhas (Paulista): paus > copas > espadas > ouros */
export const MANILHA_SUIT_STRENGTH: Record<Suit, number> = { paus: 4, copas: 3, espadas: 2, ouros: 1 };

/** Presets EDITÁVEIS — "limpo"/"sujo" variam entre grupos; confirmados pelo usuário em 23/10/2026. */
export const DECK_PRESETS = {
  sujo: { ranks: ['A', '2', '3', '4', '5', '6', '7', 'Q', 'J', 'K'] as Rank[], label: 'Baralho sujo (40 cartas)', confirmedByUser: true },
  limpo: { ranks: ['A', '2', '3', 'Q', 'J', 'K'] as Rank[], label: 'Baralho limpo (sem 4, 5, 6, 7 — 24 cartas)', confirmedByUser: true },
} as const;

export interface Rules {
  variant: Variant;
  deckRanks: Rank[];
  deckPreset: 'sujo' | 'limpo' | 'custom';
  playersCount: 2 | 4 | 6;
  targetScore: number;
  /** Se as 3 rodadas empatarem: ninguém pontua (padrão) ou o time de quem é "mão" leva. */
  allTiedResult: 'nobody' | 'maoTeam';
  maoDeOnzeValue: number;
  maoDeFerroValue: number;
  /** Qualquer jogador pode pedir truco fora da sua vez (padrão: true em 6 jogadores). */
  trucoAnySeat: boolean;
}

export function makeRules(p: Partial<Rules> = {}): Rules {
  const preset = p.deckPreset ?? 'sujo';
  const r: Rules = {
    variant: p.variant ?? 'paulista',
    deckPreset: preset,
    deckRanks: p.deckRanks ?? [...(preset === 'limpo' ? DECK_PRESETS.limpo.ranks : DECK_PRESETS.sujo.ranks)],
    playersCount: p.playersCount ?? 4,
    targetScore: p.targetScore ?? 12,
    allTiedResult: p.allTiedResult ?? 'nobody',
    maoDeOnzeValue: p.maoDeOnzeValue ?? 3,
    maoDeFerroValue: p.maoDeFerroValue ?? 3,
    trucoAnySeat: p.trucoAnySeat ?? (p.playersCount ?? 4) === 6,
  };
  if (![2, 4, 6].includes(r.playersCount)) throw new Error('playersCount deve ser 2, 4 ou 6');
  if (new Set(r.deckRanks).size !== r.deckRanks.length || r.deckRanks.some((x) => !RANK_ORDER.includes(x))) throw new Error('deckRanks inválido');
  if (r.deckRanks.length * 4 < r.playersCount * 3 + 1) throw new Error('Baralho pequeno demais para essa quantidade de jogadores');
  if (r.targetScore < 2) throw new Error('targetScore inválido');
  return r;
}

export function buildDeck(ranks: Rank[]): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of ranks) d.push({ rank: r, suit: s });
  return d;
}

// ---------- RNG: crypto por padrão, semente opcional (testes/replay) ----------
function mulberry32(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let x = Math.imul(t ^ (t >>> 15), t | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return [((x ^ (x >>> 14)) >>> 0) / 4294967296, t];
}
function cryptoInt(max: number): number {
  const c = (globalThis as any).crypto;
  if (!c?.getRandomValues) throw new Error('crypto.getRandomValues indisponível');
  const lim = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do c.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % max;
}
/** Fisher-Yates. Com `seed` é determinístico; sem, usa crypto (seguro). Retorna nova semente. */
export function shuffle<T>(arr: T[], seed?: number): { result: T[]; seed?: number } {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    let j: number;
    if (s === undefined) j = cryptoInt(i + 1);
    else { const [f, ns] = mulberry32(s); s = ns; j = Math.floor(f * (i + 1)); }
    [a[i], a[j]] = [a[j], a[i]];
  }
  return { result: a, seed: s };
}

// ---------- Força das cartas ----------
export function manilhaRankFromVira(vira: Rank, deckRanks: Rank[]): Rank {
  const ordered = RANK_ORDER.filter((r) => deckRanks.includes(r));
  return ordered[(ordered.indexOf(vira) + 1) % ordered.length];
}
const MINEIRO_MANILHAS: [Rank, Suit, number][] = [['4', 'paus', 104], ['7', 'copas', 103], ['A', 'espadas', 102], ['7', 'ouros', 101]];
export function cardStrength(card: Card, variant: Variant, manilhaRank?: Rank): number {
  if (variant === 'mineiro') {
    const m = MINEIRO_MANILHAS.find(([r, s]) => r === card.rank && s === card.suit);
    if (m) return m[2];
  } else if (manilhaRank && card.rank === manilhaRank) return 100 + MANILHA_SUIT_STRENGTH[card.suit];
  return RANK_ORDER.indexOf(card.rank) + 1;
}

// ---------- Estado ----------
export const teamOf = (seat: number): Team => (seat % 2) as Team; // 1v1, 2v2 opostos, 3v3 alternados
export function trucoLadder(v: Variant): number[] { return v === 'paulista' ? [1, 3, 6, 9, 12] : [2, 4, 6, 8, 10, 12]; }

export interface Play { seat: number; card: Card }
export interface RoundResult { plays: Play[]; winnerTeam: Team | null; topSeat: number }
export interface PendingTruco { callerSeat: number; callerTeam: Team; proposed: number }
export type HandMode = 'normal' | 'onze' | 'ferro';
export type Phase = 'onze_decision' | 'playing' | 'match_over';
export interface HistoryEntry { n: number; type: string; seat?: number; team?: Team; detail?: string; card?: Card }

export interface GameState {
  rules: Rules;
  seed?: number;
  score: [number, number];
  handNumber: number;
  dealer: number;
  phase: Phase;
  hands: Card[][];
  vira?: Card;
  manilhaRank?: Rank;
  rounds: RoundResult[];
  currentPlays: Play[];
  turn: number;
  roundStarter: number;
  value: number;
  pending: PendingTruco | null;
  lastRaiserTeam: Team | null;
  mode: HandMode;
  onzeTeam: Team | null;
  winner: Team | null;
  lastHand?: { winnerTeam: Team | null; points: number; reason: string };
  history: HistoryEntry[];
}

export type Action =
  | { type: 'play'; seat: number; card?: Card; cardIndex?: number }
  | { type: 'truco'; seat: number }
  | { type: 'accept'; seat: number }
  | { type: 'raise'; seat: number }
  | { type: 'run'; seat: number }
  | { type: 'onze_play'; seat: number }
  | { type: 'onze_run'; seat: number };

export type Result = { ok: true; state: GameState } | { ok: false; error: string };

const log = (s: GameState, e: Omit<HistoryEntry, 'n'>) => s.history.push({ n: s.history.length + 1, ...e });
const cardStr = (c: Card) => `${c.rank}${{ paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' }[c.suit]}`;
export { cardStr };

export function createGame(rulesIn: Partial<Rules> = {}, opts: { seed?: number; dealer?: number } = {}): GameState {
  const rules = makeRules(rulesIn);
  const s: GameState = {
    rules, seed: opts.seed, score: [0, 0], handNumber: 0, dealer: opts.dealer ?? 0, phase: 'playing',
    hands: [], rounds: [], currentPlays: [], turn: 0, roundStarter: 0, value: 1, pending: null,
    lastRaiserTeam: null, mode: 'normal', onzeTeam: null, winner: null, history: [],
  };
  log(s, { type: 'match_start', detail: `${rules.variant} ${rules.playersCount}j ${rules.deckPreset}` });
  startHand(s);
  return s;
}

function startHand(s: GameState) {
  const { rules } = s;
  const n = rules.playersCount;
  s.handNumber++;
  const sh = shuffle(buildDeck(rules.deckRanks), s.seed);
  s.seed = sh.seed;
  const deck = sh.result;
  s.hands = Array.from({ length: n }, () => [] as Card[]);
  for (let k = 0; k < 3; k++) for (let i = 1; i <= n; i++) s.hands[(s.dealer + i) % n].push(deck.pop()!);
  if (rules.variant === 'paulista') { s.vira = deck.pop()!; s.manilhaRank = manilhaRankFromVira(s.vira.rank, rules.deckRanks); }
  else { s.vira = undefined; s.manilhaRank = undefined; }
  s.rounds = []; s.currentPlays = []; s.pending = null; s.lastRaiserTeam = null;
  s.turn = s.roundStarter = (s.dealer + 1) % n;
  s.value = trucoLadder(rules.variant)[0];
  const onze = rules.targetScore - 1;
  const at = [s.score[0] === onze, s.score[1] === onze];
  s.onzeTeam = null;
  if (at[0] && at[1]) { s.mode = 'ferro'; s.phase = 'playing'; s.value = rules.maoDeFerroValue; }
  else if (at[0] || at[1]) { s.mode = 'onze'; s.onzeTeam = at[0] ? 0 : 1; s.phase = 'onze_decision'; }
  else { s.mode = 'normal'; s.phase = 'playing'; }
  log(s, { type: 'hand_start', seat: s.dealer, detail: `mão ${s.handNumber}, dealer ${s.dealer}${s.vira ? `, vira ${cardStr(s.vira)}, manilha ${s.manilhaRank}` : ''}, modo ${s.mode}` });
}

function award(s: GameState, team: Team | null, points: number, reason: string) {
  if (team !== null) s.score[team] = Math.min(s.rules.targetScore, s.score[team] + points);
  s.lastHand = { winnerTeam: team, points: team === null ? 0 : points, reason };
  log(s, { type: 'hand_end', team: team ?? undefined, detail: `${reason}: ${team === null ? 'ninguém pontua' : `+${points} time ${team}`} (placar ${s.score[0]}x${s.score[1]})` });
  if (team !== null && s.score[team] >= s.rules.targetScore) {
    s.winner = team; s.phase = 'match_over';
    log(s, { type: 'match_end', team, detail: `time ${team} venceu ${s.score[0]}x${s.score[1]}` });
    return;
  }
  s.dealer = (s.dealer + 1) % s.rules.playersCount;
  startHand(s);
}

/** Decide o vencedor da mão (ou undefined se ainda não decidido). */
export function resolveHand(rounds: (Team | null)[], maoTeam: Team, allTied: Rules['allTiedResult']): Team | null | undefined {
  const [r0, r1, r2] = rounds;
  if (rounds.length < 2) return undefined;
  if (rounds.length === 2) {
    if (r0 !== null && r0 === r1) return r0;
    if (r0 === null && r1 !== null) return r1; // 1ª empatou: 2ª decide
    if (r0 !== null && r1 === null) return r0; // empate após vitória: vence quem fez a 1ª
    return undefined;
  }
  // chegou à 3ª: (A,B) ou (empate,empate)
  if (r2 !== null) return r2;
  if (r0 !== null) return r0; // empate na 3ª após vitórias divididas: vence quem fez a 1ª
  return allTied === 'maoTeam' ? maoTeam : null;
}

const err = (error: string): Result => ({ ok: false, error });

export function applyAction(state: GameState, action: Action): Result {
  if (state.phase === 'match_over') return err('Partida encerrada');
  const n = state.rules.playersCount;
  if (!Number.isInteger(action.seat) || action.seat < 0 || action.seat >= n) return err('Assento inválido');
  const s: GameState = structuredClone(state);
  const team = teamOf(action.seat);
  const ladder = trucoLadder(s.rules.variant);

  switch (action.type) {
    case 'onze_play':
    case 'onze_run': {
      if (s.phase !== 'onze_decision') return err('Não há decisão de mão de onze');
      if (team !== s.onzeTeam) return err('Só o time na mão de onze decide');
      if (action.type === 'onze_run') {
        log(s, { type: 'onze_run', seat: action.seat, team });
        award(s, (1 - team) as Team, 1, 'correu da mão de onze');
      } else {
        s.value = s.rules.maoDeOnzeValue; s.phase = 'playing';
        log(s, { type: 'onze_play', seat: action.seat, team, detail: `vale ${s.value}` });
      }
      return { ok: true, state: s };
    }
    case 'play': {
      if (s.phase !== 'playing') return err('Aguardando decisão da mão de onze');
      if (s.pending) return err('Responda o truco antes de jogar');
      if (action.seat !== s.turn) return err('Não é sua vez');
      const c = action.card;
      const idx = c ? s.hands[action.seat].findIndex((h) => h.rank === c.rank && h.suit === c.suit)
        : Number.isInteger(action.cardIndex) && action.cardIndex! >= 0 && action.cardIndex! < s.hands[action.seat].length ? action.cardIndex! : -1;
      if (idx < 0) return err('Carta não está na sua mão');
      const [card] = s.hands[action.seat].splice(idx, 1);
      s.currentPlays.push({ seat: action.seat, card });
      log(s, { type: 'play', seat: action.seat, team, detail: s.mode === 'ferro' ? 'carta às cegas ' + cardStr(card) : cardStr(card) });
      if (s.currentPlays.length < n) { s.turn = (s.turn + 1) % n; return { ok: true, state: s }; }
      // fecha rodada
      let best = -1, topSeat = -1, teams = new Set<Team>();
      for (const p of s.currentPlays) {
        const st = cardStrength(p.card, s.rules.variant, s.manilhaRank);
        if (st > best) { best = st; topSeat = p.seat; teams = new Set([teamOf(p.seat)]); }
        else if (st === best) teams.add(teamOf(p.seat));
      }
      const winnerTeam: Team | null = teams.size === 1 ? [...teams][0] : null;
      s.rounds.push({ plays: s.currentPlays, winnerTeam, topSeat });
      s.currentPlays = [];
      log(s, { type: 'round_end', team: winnerTeam ?? undefined, seat: topSeat, card: s.rounds[s.rounds.length - 1].plays.find((p) => p.seat === topSeat)!.card, detail: `rodada ${s.rounds.length}: ${winnerTeam === null ? 'empate (cangou)' : `time ${winnerTeam}`}` });
      const maoTeam = teamOf((s.dealer + 1) % n);
      const res = resolveHand(s.rounds.map((r) => r.winnerTeam), maoTeam, s.rules.allTiedResult);
      if (res !== undefined) { award(s, res, s.value, 'mão decidida'); return { ok: true, state: s }; }
      s.turn = s.roundStarter = topSeat; // quem fez (ou amarrou primeiro) começa a próxima
      return { ok: true, state: s };
    }
    case 'truco': {
      if (s.phase !== 'playing') return err('Não pode pedir truco agora');
      if (s.mode !== 'normal') return err('Truco não é permitido na mão de onze / mão de ferro');
      if (s.pending) return err('Já existe um pedido pendente');
      if (!s.rules.trucoAnySeat && action.seat !== s.turn) return err('Só pode pedir truco na sua vez');
      if (s.lastRaiserTeam === team) return err('Seu time não pode aumentar a própria chamada');
      const i = ladder.indexOf(s.value);
      if (i >= ladder.length - 1) return err('Aposta já está no máximo');
      s.pending = { callerSeat: action.seat, callerTeam: team, proposed: ladder[i + 1] };
      log(s, { type: 'truco', seat: action.seat, team, detail: `pede ${ladder[i + 1]}` });
      return { ok: true, state: s };
    }
    case 'accept':
    case 'raise':
    case 'run': {
      const p = s.pending;
      if (!p) return err('Não há pedido de truco');
      if (team === p.callerTeam) return err('Seu time não pode responder (nem aumentar) a própria chamada');
      if (action.type === 'run') {
        s.pending = null;
        log(s, { type: 'run', seat: action.seat, team });
        award(s, p.callerTeam, s.value, 'correu do truco');
        return { ok: true, state: s };
      }
      s.value = p.proposed; s.lastRaiserTeam = p.callerTeam; s.pending = null;
      if (action.type === 'accept') { log(s, { type: 'accept', seat: action.seat, team, detail: `vale ${s.value}` }); return { ok: true, state: s }; }
      const i = ladder.indexOf(s.value);
      if (i >= ladder.length - 1) return err('Aposta já está no máximo');
      s.pending = { callerSeat: action.seat, callerTeam: team, proposed: ladder[i + 1] };
      log(s, { type: 'raise', seat: action.seat, team, detail: `aceita ${s.value} e pede ${ladder[i + 1]}` });
      return { ok: true, state: s };
    }
  }
  return err('Ação desconhecida');
}

// ---------- Visão por jogador (nunca vaza cartas alheias nem a semente) ----------
export interface SeatView { seat: number; team: Team; cardCount: number; cards: (Card | null)[] | null }
export interface PlayerView extends Omit<GameState, 'hands' | 'seed'> { you: number; yourTeam: Team; seats: SeatView[] }

export function getPlayerView(s: GameState, seat: number): PlayerView {
  const { hands, seed, ...rest } = structuredClone(s);
  void seed;
  const me = teamOf(seat);
  const seats: SeatView[] = hands.map((h, i) => {
    let visible = false;
    if (s.mode === 'ferro') visible = false; // mão de ferro: todos às cegas
    else if (i === seat) visible = true;
    else if (s.mode === 'onze' && s.onzeTeam === me && teamOf(i) === me) visible = true; // vê parceiros
    return { seat: i, team: teamOf(i), cardCount: h.length, cards: visible ? h : i === seat ? h.map(() => null) : null };
  });
  return { ...rest, you: seat, yourTeam: me, seats };
}

/** Cartas que o jogador pode jogar agora (ordem da mão). */
export function legalActions(s: GameState, seat: number): Action['type'][] {
  const acts: Action['type'][] = [];
  const t = teamOf(seat);
  if (s.phase === 'onze_decision') return t === s.onzeTeam ? ['onze_play', 'onze_run'] : [];
  if (s.phase !== 'playing') return [];
  if (s.pending) return t !== s.pending.callerTeam ? (s.pending.proposed < 12 ? ['accept', 'raise', 'run'] : ['accept', 'run']) : [];
  if (seat === s.turn) acts.push('play');
  if (seat === s.turn || s.rules.trucoAnySeat) {
    if (s.mode === 'normal' && s.lastRaiserTeam !== t && s.value < 12) acts.push('truco');
  }
  return acts;
}

/** Visão de espectador: nenhuma carta em mão, nenhuma semente. Só mesa pública. */
export function getSpectatorView(s: GameState): Omit<PlayerView, 'you' | 'yourTeam'> & { spectator: true } {
  const { hands, seed, ...rest } = structuredClone(s);
  void seed;
  return { ...rest, spectator: true, seats: hands.map((h, i) => ({ seat: i, team: teamOf(i), cardCount: h.length, cards: null })) };
}
export * from './berros';
