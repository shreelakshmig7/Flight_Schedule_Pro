'use strict';

/**
 * Finds an available port in the given range and runs `next dev -p <port>`.
 * Used so the web app can start even when 3002 is already in use (e.g. stale process).
 */

const { createServer } = require('net');
const { spawn } = require('child_process');
const path = require('path');

const WEB_PORT_DEFAULT = 3002;
/** Disjoint from API (3000, 3003–3009) and worker (3001, 3010–3016) so parallel dev never collides. */
const WEB_PORT_CANDIDATES = [3002, 3017, 3018, 3019, 3020, 3021, 3022, 3023];

function findAvailablePort(candidates) {
  return new Promise((resolve, reject) => {
    let index = 0;
    function tryNext() {
      if (index >= candidates.length) {
        reject(new Error(`No available port among [${candidates.join(', ')}]`));
        return;
      }
      const port = candidates[index++];
      const server = createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          tryNext();
        } else {
          reject(err);
        }
      });
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '0.0.0.0');
    }
    tryNext();
  });
}

async function main() {
  const port = await findAvailablePort(WEB_PORT_CANDIDATES);
  if (port !== WEB_PORT_CANDIDATES[0]) {
    console.warn(
      `Port ${WEB_PORT_CANDIDATES[0]} was in use; Next.js will listen on port ${port}. Set PORT to avoid fallback.`,
    );
  }

  const next = spawn('npx', ['next', 'dev', '-p', String(port)], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port) },
  });
  next.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
