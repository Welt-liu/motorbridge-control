import { WebSocketServer } from 'ws';
const bind = process.argv[process.argv.indexOf('--bind') + 1];
const port = Number(bind.split(':').pop());
if (process.argv.includes('--fail')) { console.error('fixture startup failure'); process.exit(2); }
const server = new WebSocketServer({ port, host: '127.0.0.1' });
server.on('listening', () => console.log(`ws_gateway listening on ws://${bind}`));
server.on('connection', socket => socket.on('message', raw => {
  const req = JSON.parse(raw);
  socket.send(JSON.stringify({ ok: true, req_id: req.req_id, data: { api_version: 'v1', gateway_version: 'fixture' } }));
}));
process.on('SIGTERM', () => { for (const socket of server.clients) socket.terminate(); server.close(() => process.exit(0)); });
