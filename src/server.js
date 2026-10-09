import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHost } from './host.js';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const host = await createHost({ root, production: process.argv.includes('--production') });
const port = Number(process.env.PORT || 4173);
host.server.listen(port, '127.0.0.1', () => console.log(`MotorBridge Control → http://127.0.0.1:${port} (Cordis + Studio)`));
host.server.on('error', async error => { console.error(error.message); await host.close(); process.exitCode = 1; });
process.once('SIGINT', () => host.close()); process.once('SIGTERM', () => host.close());
