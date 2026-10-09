// Local UI fixture only. This process has no CAN or motor access.
import { WebSocketServer } from 'ws';
const server = new WebSocketServer({ host: '127.0.0.1', port: 19002 });
server.on('connection', socket => {
  let target = {};
  socket.on('message', raw => {
    const r = JSON.parse(raw); let data = {};
    if (r.op === 'capabilities') data = { api_version: 'v1', gateway_version: 'TEST-FIXTURE', test_fixture: true };
    else if (r.op === 'set_target') { target = r; data = r; }
    else if (r.op === 'scan') {
      socket.send(JSON.stringify({ type: 'scan_progress', op: 'scan', data: { phase: 'hit', probe: 1 } }));
      data = { count: 1, hits: [{ device_id: 1, feedback_id: 253, via: 'ping' }] };
    }
    else if (r.op === 'ping' && target.motor_id === 1) data = { pong: true, vendor: 'robstride', device_id: 1, responder_id: 253 };
    else { socket.send(JSON.stringify({ ok: false, op: r.op, req_id: r.req_id, error: 'TEST FIXTURE: motor response timed out' })); return; }
    setTimeout(() => socket.send(JSON.stringify({ ok: true, op: r.op, req_id: r.req_id, data })), 60);
  });
});
console.log('TEST FIXTURE ONLY → ws://127.0.0.1:19002');
process.once('SIGTERM', () => { for (const client of server.clients) client.terminate(); server.close(); });
