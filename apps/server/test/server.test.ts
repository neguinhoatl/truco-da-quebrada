import { describe, it, expect, afterAll } from 'vitest';
import { io as client } from 'socket.io-client';
import { buildServer } from '../src/app';
const { http, io } = buildServer();
await new Promise<void>((r) => http.listen(0, r));
const port = (http.address() as any).port;
afterAll(() => { io.close(); });
const emit = (s: any, ev: string, p: any) => new Promise<any>((r) => s.emit(ev, p, r));
describe('server stub', () => {
  it('health', async () => {
    const r = await fetch(`http://localhost:${port}/health`);
    expect(await r.json()).toEqual({ ok: true, rooms: 0 });
  });
  it('cria e entra na mesa; valida apelido e lotação', async () => {
    const a = client(`http://localhost:${port}`), b = client(`http://localhost:${port}`), c = client(`http://localhost:${port}`);
    expect((await emit(a, 'room:create', { nickname: '' })).ok).toBe(false);
    const cr = await emit(a, 'room:create', { nickname: 'Zé', rules: { playersCount: 2 } });
    expect(cr.ok).toBe(true); expect(cr.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await emit(b, 'room:join', { nickname: 'Tião', code: 'NOPE' })).error).toBe('Mesa não encontrada');
    const jr = await emit(b, 'room:join', { nickname: 'Tião', code: cr.code });
    expect(jr).toMatchObject({ ok: true, seat: 1 });
    expect((await emit(b, 'room:join', { nickname: 'Tião', code: cr.code })).ok).toBe(false);
    expect((await emit(c, 'room:join', { nickname: 'Bia', code: cr.code })).error).toBe('Mesa cheia');
    [a, b, c].forEach((s) => s.close());
  });
  it('espectadores: não ocupam assento, entram com mesa cheia, limite 10', async () => {
    const url = `http://localhost:${port}`;
    const host = client(url), p2 = client(url);
    const cr = await emit(host, 'room:create', { nickname: 'Dono', rules: { playersCount: 2 } });
    const specs = Array.from({ length: 11 }, () => client(url));
    for (let i = 0; i < 10; i++) {
      const r = await emit(specs[i], 'room:join', { nickname: `Galera${i}`, code: cr.code, role: 'spectator' });
      expect(r).toMatchObject({ ok: true, role: 'spectator', seat: null, spectators: i + 1 });
    }
    expect((await emit(p2, 'room:join', { nickname: 'Jogador', code: cr.code })).seat).toBe(1); // assento continua livre
    expect((await emit(specs[10], 'room:join', { nickname: 'Extra', code: cr.code, role: 'spectator' })).ok).toBe(false);
    expect((await emit(specs[0], 'room:join', { nickname: 'Galera0', code: cr.code })).ok).toBe(false); // não vira jogador também
    [host, p2, ...specs].forEach((s) => s.close());
  });
});
