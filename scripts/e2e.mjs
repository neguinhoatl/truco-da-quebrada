import { chromium } from 'playwright-core';
const out = '/workspace/truco-da-quebrada/', U = 'http://localhost:3001';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const names = ['Zé', 'Tião', 'Parça', 'Baixinho'];
const pages = [];
for (let i = 0; i < 4; i++) { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', i, e.message)); p.on('dialog', (d) => d.accept()); pages.push(p); }
const [h] = pages;
await h.goto(U); await h.fill('#nick', names[0]); await h.click('text=ENTRAR NA RESENHA');
await h.getByRole('button', { name: 'Criar mesa', exact: true }).click(); await h.getByRole('button', { name: 'CRIAR MESA', exact: true }).click();
const code = (await h.locator('.code').innerText()).trim(); console.log('code', code);
for (let i = 1; i < 4; i++) { const p = pages[i]; await p.goto(`${U}/?sala=${code}`); await p.fill('#nick', names[i]); await p.click('text=ENTRAR NA RESENHA'); await p.locator('.code').waitFor(); }
const spec = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await spec.goto(`${U}/?sala=${code}`); await spec.fill('#nick', 'DonaCida'); await spec.click('text=ENTRAR NA RESENHA');
await spec.getByText('👀 Assistir').click(); await spec.locator('.code').waitFor();
await h.waitForTimeout(300); await h.screenshot({ path: out + 'docs-p2-lobby.png', fullPage: true });
await h.getByRole('button', { name: 'COMEÇAR PARTIDA' }).click();
for (const p of pages) await p.locator('.boteco').waitFor();
const score = async () => (await h.locator('.chalk b').allInnerTexts()).map(Number);
let trucoDone = false, shots = 0, steps = 0;
while ((await score()).reduce((a, c) => a + c, 0) === 0 && steps++ < 60) {
  for (const [i, p] of pages.entries()) {
    await p.locator('.moment').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    if (await p.getByRole('button', { name: 'ACEITA' }).isVisible()) { await p.getByRole('button', { name: 'ACEITA' }).click(); console.log(names[i], 'aceita'); break; }
    if (await p.getByRole('button', { name: /JOGAR \(vale 3\)/ }).isVisible()) { await p.getByRole('button', { name: /JOGAR \(vale 3\)/ }).click(); break; }
    const status = await p.locator('.status').innerText();
    if (status.startsWith('Sua vez')) {
      if (!trucoDone && await p.locator('.btn.truco').isVisible()) {
        await p.locator('.btn.truco').click(); trucoDone = true; console.log(names[i], 'truco');
        await p.waitForTimeout(250); await p.screenshot({ path: out + 'docs-p2-truco-caller.png' }); break;
      }
      if (shots === 0 && i !== 0) { await p.screenshot({ path: out + `docs-p2-ingame-${names[i]}.png`, fullPage: true }); await h.screenshot({ path: out + 'docs-p2-ingame-Ze.png', fullPage: true }); shots++; }
      await p.locator('.hand-card:not([disabled])').first().click(); console.log(names[i], 'jogou'); break;
    }
  }
  await h.waitForTimeout(250);
}
console.log('placar', await score(), 'steps', steps);
await h.waitForTimeout(1300);
await spec.screenshot({ path: out + 'docs-p2-spectator.png', fullPage: true });
await pages[2].screenshot({ path: out + 'docs-p2-after-hand-Parca.png', fullPage: true });
// reconexão via refresh
await pages[1].reload(); await pages[1].fill('#nick', 'Tião').catch(() => {});
console.log('cards spectator sees:', await spec.locator('.hand-card').count());
await b.close();
