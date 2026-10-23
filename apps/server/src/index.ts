import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { buildServer } from './app';
const port = Number(process.env.PORT ?? 3001);
const dist = fileURLToPath(new URL('../../web/dist', import.meta.url));
buildServer({ graceMs: Number(process.env.GRACE_MS ?? 120_000), webDist: existsSync(dist) ? dist : undefined })
  .http.listen(port, () => console.log(`Truco da Quebrada em http://localhost:${port}${existsSync(dist) ? ' (servindo o site)' : ''}`));
