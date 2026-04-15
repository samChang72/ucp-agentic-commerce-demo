import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const server = buildApp().listen(PORT, () =>
  console.log(`ucp-server listening on :${PORT}`),
);

function shutdown(signal: string) {
  console.log(`[shutdown] received ${signal}, closing server...`);
  server.close((err) => {
    if (err) {
      console.error('[shutdown] server close error', err);
      process.exit(1);
    }
    console.log('[shutdown] closed cleanly');
    process.exit(0);
  });
  // Force exit after 10s if connections linger
  setTimeout(() => {
    console.error('[shutdown] forced exit after 10s');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
