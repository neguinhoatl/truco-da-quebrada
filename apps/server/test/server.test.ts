import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/app';
import { connect, table, playMatch, until, wait, lcg, C } from './helpers';

let url = '', srv: ReturnType<typeof buildServer>;
beforeAll(async () => { srv = buildServer({ graceMs: 300, seed: 1000, rateLimit: { max: 200, windowMs: 1000 } }); await new Promise<void>((r) => srv.http.listen(0, r)); url = `http://localhost:${(srv.http.address() as any).port}`; });
afterAll(() => { srv.io.close(); });
const closeAll = (cs: C[]) => cs.forEach((c) => c.close());
const noForeignCards = (c: C) => {
  const v = c.state.view; if (!v) return;
  v.seats.forEach((s: any) => { if (s.seat !== c.state.you.seat && !(v.mode === 'onze' && s.team === v.yourTeam)) expect(s.cards).toBeNull(); });
  expect(v.seed).toBeUndefined(); expect(v.hands).toBeUndefined();
};

describe('básico', () => {
  it('health', async () => { const r = await fetch(`${url}/health`); expect((await r.json()).ok).toBe(true); });
  it('sessão: token aleatório de 43 chars; token reaproveitado = mesmo jogador', async () => {
    const a = await connect(url); expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const b = await connect(url, a.token); expect(b.playerId).toBe(a.playerId);
    const c = await connect(url, 'token-falso'); expect(c.playerId).not.toBe(a.playerId);
    closeAll([a, b, c]);
  });
  it('validações de criação e entrada', async () => {
    const a = await connect(url), b = await connect(url), c = await connect(url), d = await connect(url);
    expect((await a.emit('room:create', { nickname: '' })).ok).toBe(false);
    expect((await a.emit('room:create', { nickname: 'Zé', rules: { playersCount: 5 } })).error).toMatch(/2, 4 ou 6/);
    expect((await a.emit('room:create', { nickname: 'Zé', rules: { targetScore: 1000 } })).ok).toBe(false);
    const cr = await a.emit('room:create', { nickname: 'Zé', rules: { playersCount: 2, deckPreset: 'limpo' } });
    expect(cr.code).toMatch(/^[A-Z2-9]{8}$/); expect(cr.rules.deckRanks).toEqual(['A', '2', '3', 'Q', 'J', 'K']);
    expect((await b.emit('room:join', { nickname: 'Tião', code: 'XXXX' })).error).toMatch(/não encontrada/);
    expect((await a.emit('room:start')).error).toMatch(/Faltam/);
    expect((await b.emit('room:join', { nickname: 'Tião', code: cr.code })).seat).toBe(1);
    expect((await b.emit('room:join', { nickname: 'Tião', code: cr.code })).rejoined).toBe(true); // não ocupa 2 lugares
    expect(b.state.room.seats.filter((s: any) => s.playerId === b.playerId)).toHaveLength(1);
    expect((await c.emit('room:join', { nickname: 'Bia', code: cr.code })).error).toMatch(/Mesa cheia/);
    expect((await b.emit('room:start')).error).toMatch(/dono/);
    expect((await a.emit('room:start')).ok).toBe(true);
    expect((await d.emit('room:join', { nickname: 'Lu', code: cr.code })).error).toMatch(/já começou/);
    expect((await d.emit('room:join', { nickname: 'Lu', code: cr.code, role: 'spectator' })).ok).toBe(true);
    closeAll([a, b, c, d]);
  });
  it('troca de lugar no lobby sem ocupar dois', async () => {
    const { cs } = await table(url, 4); // todos sentados 0..3
    expect((await cs[1].emit('room:seat', { seat: 2 })).error).toMatch(/dono/);
    await cs[3].emit('room:leave');
    await until(() => cs[1].state.room.seats[3].playerId === null);
    expect((await cs[1].emit('room:seat', { seat: 3 })).ok).toBe(true);
    await until(() => cs[0].state.room.seats[3].playerId === cs[1].playerId);
    expect(cs[0].state.room.seats.filter((s: any) => s.playerId === cs[1].playerId)).toHaveLength(1);
    expect(cs[0].state.room.seats[1].playerId).toBeNull();
    closeAll(cs);
  });
});

describe('partidas completas pela rede', () => {
  for (const n of [4, 2, 6] as const)
    it(`${n} jogadores: partida até o fim, truco aceito/corrido, sem vazar cartas`, async () => {
      const { cs } = await table(url, n);
      const spec = await connect(url); await spec.emit('room:join', { nickname: 'Galera', code: cs[0].state.room.code, role: 'spectator' });
      await cs[0].emit('room:start');
      const res = await playMatch([...cs], lcg(n * 7), { trucoRate: 0.25, runRate: 0.3, onStep: () => { cs.forEach(noForeignCards); spec.state.view.seats.forEach((s: any) => expect(s.cards).toBeNull()); } });
      const sc = res.final.view.score;
      expect(Math.max(...sc)).toBe(12);
      expect(res.seen.has('did_truco') && res.seen.has('did_accept') && res.seen.has('did_run')).toBe(true);
      expect(cs.every((c) => c.events.some((e) => e.type === 'match_win'))).toBe(true);
      expect(spec.events.some((e) => e.type === 'card_played')).toBe(true);
      expect(res.final.room.status).toBe('finished');
      // jogar outra com o mesmo grupo
      expect((await cs[1].emit('room:restart')).ok).toBe(false);
      expect((await cs[0].emit('room:restart')).ok).toBe(true);
      await until(() => cs.every((c) => c.state.view?.score[0] === 0 && c.state.view?.score[1] === 0 && c.state.room.matchNumber === 2));
      closeAll([...cs, spec]);
    }, 30000);
  it('mão de onze pela rede: time com 11 vê o parceiro e decide; sem truco', async () => {
    const { cs } = await table(url, 4, { targetScore: 4 }); // onze = 3 pontos
    await cs[0].emit('room:start');
    let onze = false;
    await playMatch(cs, lcg(3), { trucoRate: 0, runRate: 0, onStep: () => {
      const v = cs[0].state.view;
      if (v.phase === 'onze_decision') {
        onze = true;
        const team = v.onzeTeam;
        for (const c of cs) {
          const me = c.state.you.seat, partner = (me + 2) % 4;
          if (c.state.view.yourTeam === team) expect(c.state.view.seats[partner].cards).not.toBeNull();
          else expect(c.state.view.seats[partner].cards).toBeNull();
          expect(c.state.legal.includes('truco')).toBe(false);
          if (c.state.view.yourTeam !== team) expect(c.state.legal).toEqual([]);
        }
      }
    } });
    expect(onze).toBe(true);
    closeAll(cs);
  }, 30000);
});

describe('segurança e ações inválidas', () => {
  it('vez errada, carta fora da mão, aumentar a própria chamada, id forjado, espectador', async () => {
    const { cs } = await table(url, 4);
    const spec = await connect(url); await spec.emit('room:join', { nickname: 'Olho', code: cs[0].state.room.code, role: 'spectator' });
    await cs[0].emit('room:start');
    await until(() => cs.every((c) => c.state?.view));
    const turn = cs[0].state.view.turn; const actor = cs.find((c) => c.state.you.seat === turn)!; const other = cs.find((c) => c.state.you.seat === (turn + 1) % 4)!;
    expect((await other.emit('game:action', { type: 'play', cardIndex: 0 })).error).toBe('Não é sua vez');
    // id/assento forjado: servidor ignora seat/playerId do payload
    expect((await other.emit('game:action', { type: 'play', cardIndex: 0, seat: turn, playerId: actor.playerId })).error).toBe('Não é sua vez');
    const foreign = other.state.view.seats[other.state.you.seat].cards[0];
    expect((await actor.emit('game:action', { type: 'play', card: foreign })).error).toBe('Carta não está na sua mão');
    expect((await actor.emit('game:action', { type: 'play', cardIndex: 7 })).error).toBe('Ação inválida');
    expect((await actor.emit('game:action', { type: 'hackear' })).error).toBe('Ação inválida');
    expect((await spec.emit('game:action', { type: 'truco' })).error).toBe('Espectador não joga');
    expect((await actor.emit('game:action', { type: 'truco' })).ok).toBe(true);
    const partner = cs.find((c) => c.state.you.seat === (turn + 2) % 4)!;
    expect((await partner.emit('game:action', { type: 'raise' })).error).toMatch(/própria chamada/);
    expect((await partner.emit('game:action', { type: 'accept' })).error).toMatch(/própria chamada/);
    expect((await other.emit('game:action', { type: 'accept' })).ok).toBe(true);
    expect((await actor.emit('game:action', { type: 'truco' })).error).toMatch(/própria/);
    spec.state.view.seats.forEach((s: any) => expect(s.cards).toBeNull());
    expect(JSON.stringify(spec.states)).not.toContain(JSON.stringify(cs[1].state.view.seats[cs[1].state.you.seat].cards[0]) + ',"seat"');
    closeAll([...cs, spec]);
  });
  it('limitação de requisições por socket', async () => {
    const s2 = buildServer({ rateLimit: { max: 5, windowMs: 1000 } }); await new Promise<void>((r) => s2.http.listen(0, r));
    const c = await connect(`http://localhost:${(s2.http.address() as any).port}`);
    const rs = await Promise.all(Array.from({ length: 8 }, () => c.emit('session:nick', { nickname: 'Zé' })));
    expect(rs.filter((r) => r.ok)).toHaveLength(5);
    expect(rs.at(-1).error).toMatch(/Muitas ações/);
    c.close(); s2.io.close();
  });
});

describe('reconexão', () => {
  it('cai no meio da mão, volta com o token: mesmo lugar, mesmas cartas, sem ver as dos outros', async () => {
    const { cs } = await table(url, 4);
    await cs[0].emit('room:start');
    await until(() => cs.every((c) => c.state?.view));
    // joga 2 cartas
    for (let k = 0; k < 2; k++) { const t = cs[0].state.view.turn; const a = cs.find((c) => c.state.you.seat === t)!; const n0 = cs[0].states.length; await a.emit('game:action', { type: 'play', cardIndex: 0 }); await until(() => cs[0].states.length > n0); }
    const victim = cs[2]; const seat = victim.state.you.seat; const cards = victim.state.view.seats[seat].cards; const hist = cs[0].state.view.history.length;
    victim.close();
    await until(() => cs[0].state.room.seats[seat].connected === false);
    const back = await connect(url, victim.token);
    await until(() => back.state?.view);
    expect(back.playerId).toBe(victim.playerId);
    expect(back.state.you.seat).toBe(seat);
    expect(back.state.view.seats[seat].cards).toEqual(cards);
    expect(back.state.view.history.length).toBe(hist);
    noForeignCards(back);
    await until(() => cs[0].state.room.seats[seat].connected === true);
    // continua jogável
    cs[2] = back;
    const t = back.state.view.turn; const a = cs.find((c) => c.state.you.seat === t)!;
    expect((await a.emit('game:action', { type: 'play', cardIndex: 0 })).ok).toBe(true);
    closeAll(cs);
  });
  it('dono cai: anfitrião passa para outro; após o prazo assento segue guardado na partida', async () => {
    const { cs } = await table(url, 2);
    await cs[0].emit('room:start'); await until(() => cs[1].state?.view);
    cs[0].close();
    await until(() => cs[1].state.you.isHost === true);
    await wait(400); // passa o prazo (300ms)
    expect(cs[1].state.room.seats[0].playerId).not.toBeNull();
    expect(cs[1].state.room.seats[0].connected).toBe(false);
    const back = await connect(url, cs[0].token); await until(() => back.state?.view);
    expect(back.state.you.seat).toBe(0); expect(back.state.you.isHost).toBe(false);
    expect((await cs[1].emit('room:end', {})).error).toMatch(/Confirme/);
    expect((await cs[1].emit('room:end', { confirm: true })).ok).toBe(true);
    await until(() => back.state.room.status === 'lobby' && back.state.view === null);
    closeAll([cs[1], back]);
  });
  it('no lobby, quem não volta no prazo perde o lugar', async () => {
    const { cs } = await table(url, 2);
    cs[1].close();
    await until(() => cs[0].state.room.seats[1].playerId === null, 2000);
    cs[0].close();
  });
});

describe('áudio de zoeira', () => {
  it('clip:send: valida membro, mime, tamanho, duração, rate limit e entrega (espectador ouve)', async () => {
    const out = await connect(url);
    const audio = Buffer.alloc(2000, 7);
    expect((await out.emit('clip:send', { mime: 'audio/webm', data: audio, durationMs: 1000 })).ok).toBe(false);
    const { cs: [a, b] } = await table(url, 2);
    const spec = await connect(url); await spec.emit('room:join', { nickname: 'Galera', code: a.state.room.code, role: 'spectator' });
    expect((await a.emit('clip:send', { mime: 'audio/wav', data: audio, durationMs: 1000 })).error).toMatch(/Formato/);
    expect((await a.emit('clip:send', { mime: 'audio/webm', data: Buffer.alloc(301 * 1024), durationMs: 1000 })).error).toMatch(/grande/);
    expect((await a.emit('clip:send', { mime: 'audio/webm', data: 'xx', durationMs: 1000 })).ok).toBe(false);
    expect((await a.emit('clip:send', { mime: 'audio/webm', data: audio, durationMs: 15000 })).ok).toBe(false);
    expect((await a.emit('clip:send', { mime: 'audio/webm;codecs=opus', data: audio, durationMs: 1200 })).ok).toBe(true);
    expect((await a.emit('clip:send', { mime: 'audio/mp4', data: audio, durationMs: 1200 })).error).toMatch(/Calma/);
    expect((await spec.emit('clip:send', { mime: 'audio/mp4', data: audio, durationMs: 800 })).ok).toBe(true);
    await wait(100);
    expect(b.clips).toHaveLength(2); expect(spec.clips).toHaveLength(1); expect(a.clips).toHaveLength(1); expect(out.clips).toHaveLength(0);
    expect(b.clips[0]).toMatchObject({ nickname: 'Jog0', seat: 0, mime: 'audio/webm', durationMs: 1200, fromId: a.playerId });
    expect(Buffer.from(b.clips[0].data).equals(audio)).toBe(true);
    expect(b.clips[1]).toMatchObject({ nickname: 'Galera', role: 'spectator', seat: null });
    closeAll([a, b, spec, out]);
  });
  it('espectadores: limite de 10', async () => {
    const { cs } = await table(url, 2);
    const specs: C[] = [];
    for (let i = 0; i < 11; i++) specs.push(await connect(url));
    for (let i = 0; i < 10; i++) expect((await specs[i].emit('room:join', { nickname: `G${i}`, code: cs[0].state.room.code, role: 'spectator' })).ok).toBe(true);
    expect((await specs[10].emit('room:join', { nickname: 'Extra', code: cs[0].state.room.code, role: 'spectator' })).error).toMatch(/lotada/);
    expect((await specs[0].emit('room:join', { nickname: 'G0', code: cs[0].state.room.code })).error).toMatch(/assistindo/);
    closeAll([...cs, ...specs]);
  });
});
