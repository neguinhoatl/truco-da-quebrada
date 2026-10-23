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
  it('clip:send: valida membro, mime, tamanho, duração, rate limit e retransmite (espectador ouve)', async () => {
    const url = `http://localhost:${port}`;
    const a = client(url), b = client(url), spec = client(url), outsider = client(url);
    const audio = Buffer.alloc(2000, 7);
    expect((await emit(outsider, 'clip:send', { mime: 'audio/webm', data: audio, durationMs: 1000 })).ok).toBe(false);
    const cr = await emit(a, 'room:create', { nickname: 'Zé', rules: { playersCount: 2 } });
    await emit(b, 'room:join', { nickname: 'Tião', code: cr.code });
    await emit(spec, 'room:join', { nickname: 'Galera', code: cr.code, role: 'spectator' });
    const got: any[] = [], gotSpec: any[] = [], gotSelf: any[] = [];
    b.on('clip:receive', (m: any) => got.push(m)); spec.on('clip:receive', (m: any) => gotSpec.push(m)); a.on('clip:receive', (m: any) => gotSelf.push(m));
    expect((await emit(a, 'clip:send', { mime: 'audio/wav', data: audio, durationMs: 1000 })).error).toMatch(/Formato/);
    expect((await emit(a, 'clip:send', { mime: 'audio/webm', data: Buffer.alloc(301 * 1024), durationMs: 1000 })).error).toMatch(/grande/);
    expect((await emit(a, 'clip:send', { mime: 'audio/webm', data: 'xx', durationMs: 1000 })).ok).toBe(false);
    expect((await emit(a, 'clip:send', { mime: 'audio/webm', data: audio, durationMs: 15000 })).ok).toBe(false);
    expect((await emit(a, 'clip:send', { mime: 'audio/webm;codecs=opus', data: audio, durationMs: 1200 })).ok).toBe(true);
    expect((await emit(a, 'clip:send', { mime: 'audio/mp4', data: audio, durationMs: 1200 })).error).toMatch(/Calma/);
    expect((await emit(spec, 'clip:send', { mime: 'audio/mp4', data: audio, durationMs: 800 })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(got).toHaveLength(2); expect(gotSpec).toHaveLength(1); expect(gotSelf).toHaveLength(1);
    expect(got[0]).toMatchObject({ nickname: 'Zé', seat: 0, mime: 'audio/webm', durationMs: 1200 });
    expect(Buffer.from(got[0].data).equals(audio)).toBe(true);
    expect(got[1]).toMatchObject({ nickname: 'Galera', role: 'spectator', seat: null });
    [a, b, spec, outsider].forEach((s) => s.close());
  });
});
