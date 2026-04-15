import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
buildApp().listen(PORT, () => console.log(`ucp-server listening on :${PORT}`));
