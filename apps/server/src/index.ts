import { buildServer } from './app';
const port = Number(process.env.PORT ?? 3001);
buildServer().http.listen(port, () => console.log(`Truco da Quebrada server em http://localhost:${port}`));
