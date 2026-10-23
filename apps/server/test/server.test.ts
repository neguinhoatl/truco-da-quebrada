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
});
