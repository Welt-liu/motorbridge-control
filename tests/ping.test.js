import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { Gateway, pingMotor, scanMotors } from '../web/gateway.js';

const target = { vendor: 'robstride', model: 'rs-00', channel: 'can0', motor_id: '0x01', feedback_id: '0xFD' };
async function fixture(t, handler) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(resolve => server.once('listening', resolve));
  const operations = [];
  server.on('connection', socket => socket.on('message', raw => {
    const request = JSON.parse(raw); operations.push(request);
    const data = request.op === 'capabilities' ? { api_version: 'v1' } : handler(request);
    if (data !== undefined) socket.send(JSON.stringify({ ok: true, op: request.op, req_id: request.req_id, data }));
  }));
  const client = new Gateway();
  t.after(async () => { client.disconnect(); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
  await client.connect(`ws://127.0.0.1:${server.address().port}`);
  return { client, operations };
}
test('RobStride Ping confirms device identity and sends no movement operations', async t => {
  const { client, operations } = await fixture(t, r => r.op === 'ping' ? { pong: true, vendor: 'robstride', device_id: 1, responder_id: 253 } : {});
  const result = await pingMotor(client, target);
  assert.equal(result.target.motor_id, 1); assert.equal(result.target.feedback_id, 253);
  assert.deepEqual(operations.map(r => r.op), ['capabilities', 'set_target', 'ping']);
});
test('gateway pong without motor identity is rejected', async t => {
  const { client } = await fixture(t, r => r.op === 'ping' ? { pong: true } : {});
  await assert.rejects(pingMotor(client, target), /未确认目标电机身份/);
});
test('wrong motor identity is rejected', async t => {
  const { client } = await fixture(t, r => r.op === 'ping' ? { pong: true, vendor: 'robstride', device_id: 2 } : {});
  await assert.rejects(pingMotor(client, target), /未确认目标电机身份/);
});
test('Damiao uses actual register verification instead of synthetic gateway ping', async t => {
  const { client, operations } = await fixture(t, r => r.op === 'verify' ? { ok: true, esc_id: 1, mst_id: 17 } : {});
  const result = await pingMotor(client, { ...target, vendor: 'damiao', model: '4310', feedback_id: '0x11' });
  assert.equal(result.op, 'verify'); assert.deepEqual(operations.map(r => r.op), ['capabilities', 'set_target', 'verify']);
});
test('Damiao nested verification failure is rejected even when gateway request succeeds', async t => {
  const { client } = await fixture(t, r => r.op === 'verify' ? { ok: false, esc_id: 1, mst_id: 17 } : {});
  await assert.rejects(pingMotor(client, { ...target, vendor: 'damiao', feedback_id: '0x11' }), /不匹配/);
});
test('invalid IDs never reach the gateway', async t => {
  const { client, operations } = await fixture(t, () => ({}));
  for (const id of ['1.5', '-1', '0x100', 'abc']) await assert.rejects(pingMotor(client, { ...target, motor_id: id }));
  assert.deepEqual(operations.map(r => r.op), ['capabilities']);
});
test('timeout and disconnect reject pending requests and clear timers', async t => {
  const { client } = await fixture(t, () => undefined);
  await assert.rejects(client.request('ping', {}, 25), /超时/);
  const pending = client.request('ping', {}, 1000); client.disconnect();
  await assert.rejects(pending, /取消/); assert.equal(client.pending.size, 0);
});
test('scan carries the chosen connection and only issues discovery commands', async t => {
  const { client, operations } = await fixture(t, () => ({ hits: [{ device_id: 1, feedback_id: 253 }] }));
  const data = await scanMotors(client, { ...target, transport: 'socketcan', channel: 'can1@1000000' }, 1, 8);
  assert.equal(data.hits[0].device_id, 1);
  assert.deepEqual(operations.map(r => r.op), ['capabilities', 'scan']);
  assert.equal(operations[1].channel, 'can1@1000000'); assert.deepEqual(operations[1].feedback_ids, [253]);
  assert.equal(operations[1].read_param_fallback, false);
});
test('Damiao serial and SDK targets survive Ping and scan payloads', async t => {
  const { client, operations } = await fixture(t, r => r.op === 'verify' ? { ok: true, esc_id: 1, mst_id: 17 } : r.op === 'scan' ? { hits: [] } : {});
  const dm = { ...target, vendor: 'damiao', feedback_id: 17, transport: 'dm-serial', serial_port: '/dev/cu.usbmodem1', serial_baud: 921600 };
  await pingMotor(client, dm); assert.equal(operations[2].serial_port, dm.serial_port);
  await scanMotors(client, { ...dm, transport: 'dm-device', dm_device_type: 'usb2canfd-dual', dm_channel: '1' }, 1, 2);
  assert.equal(operations.at(-1).dm_channel, '1'); assert.equal(operations.at(-1).transport, 'dm-device');
});
test('invalid scan ranges and incompatible adapters never reach hardware', async t => {
  const { client, operations } = await fixture(t, () => ({}));
  await assert.rejects(scanMotors(client, target, 1, 100), /最多/);
  await assert.rejects(scanMotors(client, target, 8, 1));
  await assert.rejects(scanMotors(client, { ...target, transport: 'dm-serial', serial_port: '/dev/cu.usbmodem1' }, 1, 2), /仅支持/);
  assert.deepEqual(operations.map(r => r.op), ['capabilities']);
});
