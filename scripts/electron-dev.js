// Starts the Vite dev server, then opens the desktop app pointed at it, so changes under src/
// hot-reload in the window. Changes to electron/main.ts need a restart.
import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';

const server = await createServer();
await server.listen();
server.printUrls();

const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('The Vite dev server did not report a local URL.');

// Tools built on Electron (VS Code among them) set ELECTRON_RUN_AS_NODE for their child
// processes, which would start Electron as plain Node instead of opening a window.
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...env, VITE_DEV_SERVER_URL: url } });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
