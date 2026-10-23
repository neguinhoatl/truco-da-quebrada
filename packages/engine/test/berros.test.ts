import { describe, it, expect } from 'vitest';
import { createGame, applyAction, GameState, Action, Card, deriveEvents, ZoeiraDirector, isZap, BERROS, CALL_LABEL } from '../src/index';
const ok = (s: GameState, a: Action) => { const r = applyAction(s, a); if (!r.ok) throw new Error(r.error); return r.state; };
const c = (rank: any, suit: any): Card => ({ rank, suit });

describe('eventos de zoeira derivados do motor', () => {
  it('truco, aumento e corrida', () => {
    const g0 = createGame({ playersCount: 2 }, { seed: 4 });
    const g1 = ok(g0, { type: 'truco', seat: 1 });
    expect(deriveEvents(g0, g1)).toEqual([{ type: 'truco_call', seat: 1, value: 3 }]);
    const g2 = ok(g1, { type: 'raise', seat: 0 });
    expect(deriveEvents(g1, g2)).toEqual([{ type: 'truco_call', seat: 0, value: 6 }]);
    const g3 = ok(g2, { type: 'run', seat: 1 });
    const ev = deriveEvents(g2, g3).map((e) => e.type);
    expect(ev).toEqual(['run', 'hand_win']);
  });
  it('zap (4♣ manilha) vence rodada -> evento zap', () => {
    let g = createGame({ playersCount: 2 }, { seed: 4 });
    g = Object.assign(structuredClone(g), { manilhaRank: '4', vira: c('3', 'ouros'), hands: [[c('4', 'paus'), c('5', 'ouros'), c('6', 'ouros')], [c('3', 'copas'), c('K', 'copas'), c('Q', 'copas')]] });
    const a = ok(g, { type: 'play', seat: 1, card: c('3', 'copas') });
    const b = ok(a, { type: 'play', seat: 0, card: c('4', 'paus') });
    const ev = deriveEvents(a, b);
    expect(ev).toContainEqual({ type: 'round_win', seat: 0, card: c('4', 'paus'), zap: true, manilha: true });
    expect(isZap(c('4', 'paus'), { rules: g.rules, manilhaRank: '4' })).toBe(true);
    expect(isZap(c('4', 'copas'), { rules: g.rules, manilhaRank: '4' })).toBe(false);
    expect(isZap(c('4', 'paus'), { rules: { ...g.rules, variant: 'mineiro' }, manilhaRank: undefined })).toBe(true);
  });
  it('mão de ferro e fim de partida geram eventos', () => {
    let g = createGame({ playersCount: 2 }, { seed: 4 }); g = structuredClone(g); g.score = [11, 10];
    const a = ok(g, { type: 'truco', seat: 1 }); const b = ok(a, { type: 'run', seat: 0 });
    expect(deriveEvents(a, b).map((e) => e.type)).toContain('mao_de_ferro');
    let m = createGame({ playersCount: 2 }, { seed: 4 }); m = structuredClone(m); m.score = [0, 10];
    const m1 = ok(m, { type: 'truco', seat: 1 }); const m2 = ok(m1, { type: 'raise', seat: 0 }); const m3 = ok(m2, { type: 'run', seat: 1 });
    void m3;
    const x = ok(ok(m, { type: 'truco', seat: 1 }), { type: 'accept', seat: 0 });
    let y = x; while (y.phase !== 'match_over' && y.handNumber === 1) y = ok(y, { type: 'play', seat: y.turn, cardIndex: 0 });
    if (y.phase === 'match_over') expect(deriveEvents(x, y).map((e) => e.type)).toContain('match_win');
  });
  it('labels das chamadas', () => {
    expect(CALL_LABEL(3, 'paulista')).toBe('TRUCO!'); expect(CALL_LABEL(6, 'paulista')).toBe('SEIS!');
    expect(CALL_LABEL(9, 'paulista')).toBe('NOVE!'); expect(CALL_LABEL(12, 'paulista')).toBe('DOZE!'); expect(CALL_LABEL(4, 'mineiro')).toBe('TRUCO!');
  });
});

describe('diretor de zoeira (anti-spam)', () => {
  it('chamada de truco sempre sai, mesmo em sequência', () => {
    const d = new ZoeiraDirector({ rng: () => 0 });
    expect(d.react({ type: 'truco_call', seat: 1, value: 3 }, 0)?.berro.text).toBe('TRUCO, SEU LADRÃO!');
    expect(d.react({ type: 'truco_call', seat: 0, value: 6 }, 100)?.berro.text).toBe('SEIS!');
    expect(d.react({ type: 'truco_call', seat: 1, value: 9 }, 200)?.berro.text).toBe('NOVE!');
    expect(d.react({ type: 'truco_call', seat: 0, value: 12 }, 300)?.berro.text).toBe('DOZE!');
  });
  it('respeita intervalo global e cooldown de categoria', () => {
    const d = new ZoeiraDirector({ rng: () => 0 });
    expect(d.react({ type: 'run', seat: 0, callerTeam: 1 }, 0)?.berro.id).toBe('pato');
    expect(d.react({ type: 'run', seat: 0, callerTeam: 1 }, 1000)).toBeNull(); // gap global
    expect(d.react({ type: 'run', seat: 0, callerTeam: 1 }, 5000)).toBeNull(); // cooldown provocações 8s
    expect(d.react({ type: 'run', seat: 0, callerTeam: 1 }, 9000)?.berro.id).toBe('correu'); // não repete 'pato'
  });
  it('rodada comum não gera berro; zap gera', () => {
    const d = new ZoeiraDirector();
    expect(d.react({ type: 'round_win', seat: 0, card: c('3', 'copas'), zap: false, manilha: false }, 0)).toBeNull();
    expect(d.react({ type: 'round_win', seat: 0, card: c('4', 'paus'), zap: true, manilha: true }, 10000)?.berro.text).toBe('TOMA ESSE ZAP NA CARA!');
  });
  it('não repete o mesmo berro dentro da janela', () => {
    const d = new ZoeiraDirector({ rng: () => 0, globalGapMs: 0, categoryCooldownMs: { comemoracoes: 0 } });
    const ids = [0, 1, 2].map((i) => d.react({ type: 'hand_win', team: 0, points: 3 }, i * 10)?.berro.id);
    expect(new Set(ids).size).toBe(3);
  });
  it('simulação de partida: no máximo 1 berro não-essencial a cada 2,5s', () => {
    const d = new ZoeiraDirector();
    let t = 0, lastNon = -Infinity;
    let g = createGame({ playersCount: 4 }, { seed: 8 });
    let x = 12345; const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    while (g.phase !== 'match_over') {
      const prev = g;
      const r = applyAction(g, g.phase === 'onze_decision' ? { type: 'onze_play', seat: g.onzeTeam! } : g.pending ? { type: 'accept', seat: (g.pending.callerSeat + 1) % 4 } : rnd() < 0.15 ? { type: 'truco', seat: g.turn } : { type: 'play', seat: g.turn, cardIndex: 0 });
      g = r.ok ? r.state : ok(g, { type: 'play', seat: g.turn, cardIndex: 0 });
      t += 700;
      for (const e of deriveEvents(prev, g)) {
        const s = d.react(e, t);
        if (s && !['truco_call', 'match_win', 'mao_de_ferro'].includes(e.type)) { expect(t - lastNon).toBeGreaterThanOrEqual(2500); lastNon = t; }
      }
    }
  });
  it('toda fala tem slot de áudio por categoria', () => {
    for (const b of BERROS) expect(b.audio).toBe(`/audio/${b.category}/${b.id}.mp3`);
  });
});
