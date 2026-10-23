import { describe, it, expect } from 'vitest';
import {
  createGame, applyAction, getPlayerView, legalActions, buildDeck, shuffle, cardStrength, manilhaRankFromVira,
  resolveHand, makeRules, teamOf, trucoLadder, DECK_PRESETS, GameState, Action, Card,
} from '../src/index';

const ok = (s: GameState, a: Action) => { const r = applyAction(s, a); if (!r.ok) throw new Error(r.error); return r.state; };
const playFirst = (s: GameState) => ok(s, { type: 'play', seat: s.turn, cardIndex: 0 });
const set = (s: GameState, hands: Card[][], extra: Partial<GameState> = {}) => Object.assign(structuredClone(s), { hands }, extra);
const c = (rank: any, suit: any): Card => ({ rank, suit });

describe('baralho e embaralhamento', () => {
  it('presets: sujo 40, limpo 24, editáveis e pendentes de confirmação', () => {
    expect(buildDeck(DECK_PRESETS.sujo.ranks)).toHaveLength(40);
    expect(buildDeck(DECK_PRESETS.limpo.ranks)).toHaveLength(24);
    expect(DECK_PRESETS.limpo.ranks).not.toContain('4');
    expect(DECK_PRESETS.sujo.confirmedByUser).toBe(true);
    expect(DECK_PRESETS.limpo.confirmedByUser).toBe(true);
    expect(makeRules().variant).toBe('paulista');
    expect(makeRules({ deckPreset: 'custom', deckRanks: ['A', '2', '3', 'K', 'J', 'Q', '7'] }).deckRanks).toHaveLength(7);
  });
  it('rejeita regras inválidas', () => {
    expect(() => makeRules({ playersCount: 3 as any })).toThrow();
    expect(() => makeRules({ deckRanks: ['A', 'A'] as any })).toThrow();
    expect(() => makeRules({ playersCount: 6, deckRanks: ['A'] })).toThrow();
  });
  it('com semente é determinístico; preserva as cartas', () => {
    const d = buildDeck(DECK_PRESETS.sujo.ranks);
    const a = shuffle(d, 42), b = shuffle(d, 42), x = shuffle(d, 43);
    expect(a.result).toEqual(b.result);
    expect(a.result).not.toEqual(x.result);
    expect([...a.result].sort((p, q) => (p.rank + p.suit).localeCompare(q.rank + q.suit))).toEqual([...d].sort((p, q) => (p.rank + p.suit).localeCompare(q.rank + q.suit)));
  });
  it('sem semente usa crypto e varia', () => {
    const d = buildDeck(DECK_PRESETS.sujo.ranks);
    const r = shuffle(d);
    expect(r.seed).toBeUndefined();
    expect(r.result).toHaveLength(40);
    expect(JSON.stringify(shuffle(d).result)).not.toBe(JSON.stringify(shuffle(d).result));
  });
});

describe('força das cartas', () => {
  it('ordem comum 3>2>A>K>J>Q>7>6>5>4', () => {
    const order = ['3', '2', 'A', 'K', 'J', 'Q', '7', '6', '5', '4'];
    for (let i = 0; i < order.length - 1; i++)
      expect(cardStrength(c(order[i], 'ouros'), 'paulista')).toBeGreaterThan(cardStrength(c(order[i + 1], 'paus'), 'paulista'));
  });
  it('paulista: manilha é a próxima após a vira (cíclica, respeita baralho)', () => {
    const sujo = DECK_PRESETS.sujo.ranks, limpo = DECK_PRESETS.limpo.ranks;
    expect(manilhaRankFromVira('4', sujo)).toBe('5');
    expect(manilhaRankFromVira('7', sujo)).toBe('Q');
    expect(manilhaRankFromVira('K', sujo)).toBe('A');
    expect(manilhaRankFromVira('3', sujo)).toBe('4');
    expect(manilhaRankFromVira('3', limpo)).toBe('Q');
  });
  it('paulista: naipes paus>copas>espadas>ouros e manilha vence o 3', () => {
    const m = '5';
    const s = (suit: any) => cardStrength(c(m, suit), 'paulista', m);
    expect(s('paus')).toBeGreaterThan(s('copas'));
    expect(s('copas')).toBeGreaterThan(s('espadas'));
    expect(s('espadas')).toBeGreaterThan(s('ouros'));
    expect(s('ouros')).toBeGreaterThan(cardStrength(c('3', 'paus'), 'paulista', m));
  });
  it('mineiro: 4♣ > 7♥ > A♠ > 7♦ > 3', () => {
    const f = (r: any, su: any) => cardStrength(c(r, su), 'mineiro');
    expect(f('4', 'paus')).toBeGreaterThan(f('7', 'copas'));
    expect(f('7', 'copas')).toBeGreaterThan(f('A', 'espadas'));
    expect(f('A', 'espadas')).toBeGreaterThan(f('7', 'ouros'));
    expect(f('7', 'ouros')).toBeGreaterThan(f('3', 'paus'));
    expect(f('4', 'copas')).toBe(f('4', 'ouros'));
  });
});

describe('distribuição e times', () => {
  for (const n of [2, 4, 6] as const) {
    it(`${n} jogadores: 3 cartas cada, sem repetição, vira fora das mãos`, () => {
      const g = createGame({ playersCount: n }, { seed: 7 });
      expect(g.hands).toHaveLength(n);
      g.hands.forEach((h) => expect(h).toHaveLength(3));
      const all = [...g.hands.flat(), g.vira!].map((x) => x.rank + x.suit);
      expect(new Set(all).size).toBe(n * 3 + 1);
      expect(g.turn).toBe(1);
    });
  }
  it('times: 2v2 opostos, 3v3 alternados', () => {
    expect([0, 1, 2, 3].map(teamOf)).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2, 3, 4, 5].map(teamOf)).toEqual([0, 1, 0, 1, 0, 1]);
  });
  it('mineiro não tem vira', () => {
    const g = createGame({ variant: 'mineiro' }, { seed: 1 });
    expect(g.vira).toBeUndefined();
    expect(g.value).toBe(2);
  });
});

describe('validação de jogadas', () => {
  it('rejeita vez errada, carta fora da mão, assento inválido', () => {
    const g = createGame({ playersCount: 4 }, { seed: 3 });
    const r1 = applyAction(g, { type: 'play', seat: 2, card: g.hands[2][0] });
    expect(r1.ok).toBe(false);
    const r2 = applyAction(g, { type: 'play', seat: 1, card: g.hands[2][0] });
    expect(r2).toEqual({ ok: false, error: 'Carta não está na sua mão' });
    expect(applyAction(g, { type: 'play', seat: 9, cardIndex: 0 }).ok).toBe(false);
    expect(applyAction(g, { type: 'play', seat: 1, cardIndex: 5 }).ok).toBe(false);
  });
  it('estado original é imutável', () => {
    const g = createGame({}, { seed: 3 });
    const snap = JSON.stringify(g);
    playFirst(g);
    expect(JSON.stringify(g)).toBe(snap);
  });
  it('turno avança em ordem e carta sai da mão', () => {
    let g = createGame({ playersCount: 6 }, { seed: 5 });
    const card = g.hands[1][0];
    g = ok(g, { type: 'play', seat: 1, card });
    expect(g.hands[1]).toHaveLength(2);
    expect(g.turn).toBe(2);
    expect(g.currentPlays[0].card).toEqual(card);
  });
});

describe('rodadas e empates', () => {
  it('resolveHand cobre todos os casos', () => {
    expect(resolveHand([0], 0, 'nobody')).toBeUndefined();
    expect(resolveHand([0, 0], 0, 'nobody')).toBe(0);
    expect(resolveHand([0, 1], 0, 'nobody')).toBeUndefined();
    expect(resolveHand([null, 1], 0, 'nobody')).toBe(1);
    expect(resolveHand([1, null], 0, 'nobody')).toBe(1);
    expect(resolveHand([null, null], 0, 'nobody')).toBeUndefined();
    expect(resolveHand([0, 1, 1], 0, 'nobody')).toBe(1);
    expect(resolveHand([0, 1, null], 0, 'nobody')).toBe(0);
    expect(resolveHand([null, null, 1], 0, 'nobody')).toBe(1);
    expect(resolveHand([null, null, null], 0, 'nobody')).toBeNull();
    expect(resolveHand([null, null, null], 1, 'maoTeam')).toBe(1);
  });
  it('mão completa 2j: time vence 2 rodadas e marca 1', () => {
    let g = createGame({ playersCount: 2 }, { seed: 1 });
    g = set(g, [[c('4', 'ouros'), c('4', 'copas'), c('5', 'ouros')], [c('3', 'ouros'), c('3', 'copas'), c('6', 'ouros')]], { vira: c('K', 'paus'), manilhaRank: 'A' });
    g = ok(g, { type: 'play', seat: 1, card: c('3', 'ouros') });
    g = ok(g, { type: 'play', seat: 0, card: c('4', 'ouros') });
    expect(g.rounds[0].winnerTeam).toBe(1);
    expect(g.turn).toBe(1);
    g = ok(g, { type: 'play', seat: 1, card: c('3', 'copas') });
    g = ok(g, { type: 'play', seat: 0, card: c('4', 'copas') });
    expect(g.score).toEqual([0, 1]);
    expect(g.handNumber).toBe(2);
    expect(g.dealer).toBe(1);
    expect(g.turn).toBe(0);
  });
  it('empate entre parceiros não é empate (4j)', () => {
    let g = createGame({ playersCount: 4 }, { seed: 1 });
    g = set(g, [[c('3', 'ouros'), c('4', 'paus'), c('4', 'ouros')], [c('4', 'copas'), c('5', 'copas'), c('5', 'ouros')], [c('3', 'copas'), c('6', 'paus'), c('6', 'ouros')], [c('5', 'paus'), c('6', 'copas'), c('7', 'ouros')]], { manilhaRank: 'K' });
    for (const [seat, card] of [[1, c('4', 'copas')], [2, c('3', 'copas')], [3, c('5', 'paus')], [0, c('3', 'ouros')]] as const) g = ok(g, { type: 'play', seat, card });
    expect(g.rounds[0].winnerTeam).toBe(0);
    expect(g.turn).toBe(2);
  });
  it('1ª empatada: 2ª decide', () => {
    let g = createGame({ playersCount: 2 }, { seed: 1 });
    g = set(g, [[c('3', 'ouros'), c('2', 'copas'), c('5', 'ouros')], [c('3', 'copas'), c('4', 'copas'), c('6', 'ouros')]], { manilhaRank: 'K' });
    g = ok(g, { type: 'play', seat: 1, card: c('3', 'copas') });
    g = ok(g, { type: 'play', seat: 0, card: c('3', 'ouros') });
    expect(g.rounds[0].winnerTeam).toBeNull();
    g = ok(g, { type: 'play', seat: 1, card: c('4', 'copas') });
    g = ok(g, { type: 'play', seat: 0, card: c('2', 'copas') });
    expect(g.score).toEqual([1, 0]);
  });
  it('tudo empatado: ninguém pontua', () => {
    let g = createGame({ playersCount: 2 }, { seed: 1 });
    g = set(g, [[c('3', 'ouros'), c('2', 'ouros'), c('5', 'ouros')], [c('3', 'copas'), c('2', 'copas'), c('5', 'copas')]], { manilhaRank: 'K' });
    for (const r of ['3', '2', '5']) { g = ok(g, { type: 'play', seat: g.turn, card: c(r, g.turn === 1 ? 'copas' : 'ouros') }); g = ok(g, { type: 'play', seat: g.turn, card: c(r, g.turn === 1 ? 'copas' : 'ouros') }); }
    expect(g.score).toEqual([0, 0]);
    expect(g.lastHand?.winnerTeam).toBeNull();
    expect(g.handNumber).toBe(2);
  });
});

describe('truco', () => {
  it('escadas', () => {
    expect(trucoLadder('paulista')).toEqual([1, 3, 6, 9, 12]);
    expect(trucoLadder('mineiro')).toEqual([2, 4, 6, 8, 10, 12]);
  });
  it('paulista: 1->3->6->9->12 com aumentos alternados e trava no 12', () => {
    let g = createGame({ playersCount: 4 }, { seed: 2 });
    g = ok(g, { type: 'truco', seat: 1 });
    expect(g.pending?.proposed).toBe(3);
    expect(applyAction(g, { type: 'accept', seat: 3 }).ok).toBe(false); // parceiro do chamador
    expect(applyAction(g, { type: 'raise', seat: 3 }).ok).toBe(false);
    expect(applyAction(g, { type: 'play', seat: 1, cardIndex: 0 }).ok).toBe(false); // jogo travado
    g = ok(g, { type: 'raise', seat: 2 });
    expect(g.value).toBe(3); expect(g.pending?.proposed).toBe(6);
    g = ok(g, { type: 'raise', seat: 1 });
    g = ok(g, { type: 'raise', seat: 0 });
    expect(g.value).toBe(9); expect(g.pending?.proposed).toBe(12);
    expect(legalActions(g, 1)).toEqual(['accept', 'run']);
    expect(applyAction(g, { type: 'raise', seat: 1 }).ok).toBe(false);
    g = ok(g, { type: 'accept', seat: 3 });
    expect(g.value).toBe(12);
    expect(applyAction(g, { type: 'truco', seat: 1 }).ok).toBe(false);
  });
  it('time não pode aumentar a própria chamada; outro time pode na sua vez', () => {
    let g = createGame({ playersCount: 2 }, { seed: 2 });
    g = ok(g, { type: 'truco', seat: 1 });
    g = ok(g, { type: 'accept', seat: 0 });
    expect(g.value).toBe(3);
    expect((applyAction(g, { type: 'truco', seat: 1 }) as any).error).toMatch(/própria/);
    g = playFirst(g); // seat 1 joga, vez do 0
    expect(applyAction(g, { type: 'truco', seat: 1 }).ok).toBe(false);
    g = ok(g, { type: 'truco', seat: 0 });
    expect(g.pending?.proposed).toBe(6);
  });
  it('correr dá o valor atual ao time que chamou', () => {
    let g = createGame({ playersCount: 2 }, { seed: 2 });
    g = ok(g, { type: 'truco', seat: 1 });
    g = ok(g, { type: 'run', seat: 0 });
    expect(g.score).toEqual([0, 1]);
    let h = createGame({ playersCount: 2 }, { seed: 2 });
    h = ok(h, { type: 'truco', seat: 1 });
    h = ok(h, { type: 'raise', seat: 0 }); // vale 3, pede 6
    h = ok(h, { type: 'run', seat: 1 });
    expect(h.score).toEqual([3, 0]);
  });
  it('mineiro: 2->4->6...12, correr do primeiro dá 2', () => {
    let g = createGame({ variant: 'mineiro', playersCount: 2 }, { seed: 2 });
    g = ok(g, { type: 'truco', seat: 1 });
    expect(g.pending?.proposed).toBe(4);
    g = ok(g, { type: 'run', seat: 0 });
    expect(g.score).toEqual([0, 2]);
    let h = createGame({ variant: 'mineiro', playersCount: 2 }, { seed: 2 });
    h = ok(h, { type: 'truco', seat: 1 });
    for (const seat of [0, 1, 0, 1]) h = ok(h, { type: 'raise', seat });
    expect(h.pending?.proposed).toBe(12);
    h = ok(h, { type: 'accept', seat: 0 });
    expect(h.value).toBe(12);
  });
  it('2/4 jogadores: truco só na sua vez', () => {
    const g = createGame({ playersCount: 4 }, { seed: 2 });
    expect(applyAction(g, { type: 'truco', seat: 2 }).ok).toBe(false);
  });
  it('6 jogadores: qualquer jogador pode pedir truco (exceto o time que já aumentou)', () => {
    let g = createGame({ playersCount: 6 }, { seed: 2 });
    expect(g.turn).toBe(1);
    expect(legalActions(g, 4)).toEqual(['truco']);
    g = ok(g, { type: 'truco', seat: 4 });
    expect(g.pending).toMatchObject({ callerTeam: 0, proposed: 3 });
    g = ok(g, { type: 'accept', seat: 5 });
    expect(applyAction(g, { type: 'truco', seat: 2 }).ok).toBe(false);
    g = ok(g, { type: 'truco', seat: 3 });
    g = ok(g, { type: 'run', seat: 0 });
    expect(g.score).toEqual([0, 3]);
  });
});

describe('mão de onze e mão de ferro', () => {
  const at = (score: [number, number], n: 2 | 4 | 6 = 4) => {
    const g = createGame({ playersCount: n }, { seed: 9 });
    const s = structuredClone(g); s.score = score; s.handNumber = 0;
    // força nova mão com o placar
    s.phase = 'playing'; s.hands = s.hands.map((h) => h);
    return { s };
  };
  const nextHandWith = (score: [number, number], n: 2 | 4 | 6 = 4) => {
    // termina uma mão por corrida para cair no placar desejado
    let g = createGame({ playersCount: n }, { seed: 11 });
    g = structuredClone(g); g.score = [score[0], score[1] - 1 >= 0 ? score[1] - 1 : score[1]];
    const bump = score[1] > 0;
    if (bump) { g = ok(g, { type: 'truco', seat: 1 }); g = ok(g, { type: 'run', seat: 0 }); }
    return g;
  };
  void at;
  it('time com 11 decide; vê parceiro; sem truco; jogar vale 3', () => {
    let g = nextHandWith([5, 11]);
    expect(g.score).toEqual([5, 11]);
    expect(g.mode).toBe('onze');
    expect(g.phase).toBe('onze_decision');
    expect(g.onzeTeam).toBe(1);
    expect(applyAction(g, { type: 'onze_play', seat: 0 }).ok).toBe(false);
    expect(applyAction(g, { type: 'play', seat: g.turn, cardIndex: 0 }).ok).toBe(false);
    const v1 = getPlayerView(g, 1), v0 = getPlayerView(g, 0);
    expect(v1.seats[3].cards).toEqual(g.hands[3]);
    expect(v1.seats[0].cards).toBeNull();
    expect(v0.seats[2].cards).toBeNull();
    g = ok(g, { type: 'onze_play', seat: 3 });
    expect(g.value).toBe(3);
    expect(applyAction(g, { type: 'truco', seat: g.turn }).ok).toBe(false);
  });
  it('correr da mão de onze dá 1 ao adversário', () => {
    let g = nextHandWith([5, 11]);
    g = ok(g, { type: 'onze_run', seat: 1 });
    expect(g.score).toEqual([6, 11]);
  });
  it('mão de ferro: 11x11, às cegas, sem truco, jogo por índice', () => {
    let g = nextHandWith([11, 11], 2);
    expect(g.mode).toBe('ferro');
    expect(g.value).toBe(3);
    
    expect(g.phase).toBe('playing');
    const v = getPlayerView(g, g.turn);
    expect(v.seats[g.turn].cards).toEqual([null, null, null]);
    expect(applyAction(g, { type: 'truco', seat: g.turn }).ok).toBe(false);
    g = ok(g, { type: 'play', seat: g.turn, cardIndex: 1 });
    expect(g.currentPlays).toHaveLength(1);
    g = ok(g, { type: 'play', seat: g.turn, cardIndex: 0 });
    // termina a mão: vale 3
    while (g.mode === 'ferro' && g.phase === 'playing') g = ok(g, { type: 'play', seat: g.turn, cardIndex: 0 });
    expect(g.lastHand!.winnerTeam === null || g.lastHand!.points === 3).toBe(true);
  });
});

describe('visão por jogador', () => {
  for (const n of [2, 4, 6] as const) {
    it(`${n}j: só mostra as próprias cartas e não vaza a semente`, () => {
      const g = createGame({ playersCount: n }, { seed: 123 });
      for (let seat = 0; seat < n; seat++) {
        const v = getPlayerView(g, seat);
        expect((v as any).seed).toBeUndefined();
        expect((v as any).hands).toBeUndefined();
        v.seats.forEach((sv) => {
          expect(sv.cardCount).toBe(3);
          if (sv.seat === seat) expect(sv.cards).toEqual(g.hands[seat]);
          else expect(sv.cards).toBeNull();
        });
        const json = JSON.stringify(v);
        for (let o = 0; o < n; o++) if (o !== seat) for (const card of g.hands[o]) {
          const mine = g.hands[seat].some((m) => m.rank === card.rank && m.suit === card.suit);
          if (!mine) expect(json.includes(JSON.stringify(card)) && !JSON.stringify(v.vira ?? {}).includes(JSON.stringify(card))).toBe(false);
        }
      }
    });
  }
});

// ---------- partidas simuladas completas ----------
function randomPlayer(seed: number) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
}
function simulate(rules: Parameters<typeof createGame>[0], seed: number) {
  let g = createGame(rules, { seed });
  const rnd = randomPlayer(seed);
  let steps = 0;
  while (g.phase !== 'match_over' && steps++ < 20000) {
    const n = g.rules.playersCount;
    const seats = Array.from({ length: n }, (_, i) => i).filter((i) => legalActions(g, i).length);
    expect(seats.length).toBeGreaterThan(0);
    const seat = seats[Math.floor(rnd() * seats.length)];
    const acts = legalActions(g, seat);
    const t = acts[Math.floor(rnd() * acts.length)];
    const pick = t === 'truco' && rnd() < 0.7 && seat === g.turn ? 'play' : t;
    const a: Action = pick === 'play' ? { type: 'play', seat, cardIndex: Math.floor(rnd() * g.hands[seat].length) } : ({ type: pick, seat } as Action);
    const r = applyAction(g, a);
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    if (r.ok) {
      const total = r.state.hands.flat().length + r.state.currentPlays.length;
      expect(total).toBeLessThanOrEqual(n * 3);
      g = r.state;
    }
  }
  return g;
}
describe('partidas completas simuladas', () => {
  for (const variant of ['paulista', 'mineiro'] as const)
    for (const n of [2, 4, 6] as const)
      for (const deckPreset of ['sujo', 'limpo'] as const)
        it(`${variant} ${n}j ${deckPreset}: chega ao fim com vencedor`, () => {
          for (let seed = 1; seed <= 15; seed++) {
            const g = simulate({ variant, playersCount: n, deckPreset }, seed * 31 + n);
            expect(g.phase).toBe('match_over');
            expect(g.score[g.winner!]).toBe(12);
            expect(g.score[1 - g.winner!]).toBeLessThan(12);
            expect(g.history.at(-1)!.type).toBe('match_end');
            expect(g.history.filter((h) => h.type === 'hand_start').length).toBe(g.handNumber);
            expect(applyAction(g, { type: 'play', seat: 0, cardIndex: 0 }).ok).toBe(false);
          }
        });
  it('targetScore configurável e dealer gira', () => {
    const g = simulate({ playersCount: 4, targetScore: 6 }, 77);
    expect(g.score[g.winner!]).toBe(6);
    const dealers = g.history.filter((h) => h.type === 'hand_start').map((h) => h.seat);
    dealers.slice(1).forEach((d, i) => expect(d).toBe(((dealers[i] as number) + 1) % 4));
  });
});

import { getSpectatorView } from '../src/index';
describe('visão de espectador', () => {
  for (const n of [2, 4, 6] as const)
    it(`${n}j: espectador não vê nenhuma carta em mão nem a semente`, () => {
      let g = createGame({ playersCount: n }, { seed: 99 });
      g = playFirst(g);
      const v = getSpectatorView(g);
      expect(v.spectator).toBe(true);
      expect((v as any).seed).toBeUndefined();
      expect((v as any).hands).toBeUndefined();
      v.seats.forEach((s, i) => { expect(s.cards).toBeNull(); expect(s.cardCount).toBe(g.hands[i].length); });
      const json = JSON.stringify({ ...v, history: [], currentPlays: [], rounds: [] });
      for (const card of g.hands.flat()) expect(json).not.toContain(JSON.stringify(card));
    });
  it('mão de onze: espectador continua sem ver cartas', () => {
    let g = createGame({ playersCount: 4 }, { seed: 11 });
    g = structuredClone(g); g.score = [5, 10];
    g = ok(g, { type: 'truco', seat: 1 }); g = ok(g, { type: 'run', seat: 0 });
    expect(g.mode).toBe('onze');
    getSpectatorView(g).seats.forEach((s) => expect(s.cards).toBeNull());
  });
});
