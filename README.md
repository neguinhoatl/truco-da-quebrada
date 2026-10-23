# Truco da Quebrada
Monorepo npm: `packages/engine` (regras), `apps/server` (Socket.IO autoritativo), `apps/web` (React/Vite).
- `npm install` · `npm test` · `npm run build`
- Local (1 porta): `npm run build && PORT=3001 npx tsx apps/server/src/index.ts` → http://localhost:3001 (servidor também serve o site)
- Dev: `npm run dev:server` + `npm run dev:web` (http://localhost:5173, proxy /socket.io → 3001)
- Na rede local (celulares): rode o servidor e abra http://<IP-do-PC>:3001. Microfone exige HTTPS fora de localhost.
- Variáveis: `PORT`, `GRACE_MS` (prazo de reconexão, padrão 120000), `WEB_ORIGIN` (CORS do dev).
- E2E: `scripts/e2e.mjs` (playwright-core + Chrome; servidor rodando em 3001).
