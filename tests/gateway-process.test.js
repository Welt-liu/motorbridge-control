import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import WebSocket from 'ws';
import { Context } from 'cordis';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { gatewayProcessPlugin, connectionArgs, localGatewayAddress } from '../src/plugins/gateway-process.js';
import { createHost } from '../src/host.js';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
async function fixture(t, extra = []) {
  const ctx = new Context();
  const fiber = await ctx.plugin(gatewayProcessPlugin, { root, executable: process.execPath, args: [path.join(root, 'tests/process-fixture.js'), ...extra] });
  t.after(() => fiber.dispose());
  return { ctx, fiber };
}
async function port(t, hold = false) {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  if (hold) t.after(() => new Promise(resolve => server.close(resolve))); else await new Promise(resolve => server.close(resolve));
  return value;
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
test('concurrent starts share one process; Cordis disposal kills it; stop permits restart', async t => {
  const { ctx, fiber } = await fixture(t); const url = `ws://127.0.0.1:${await port(t)}`;
  const [a, b] = await Promise.all([ctx.gatewayProcess.start({ url }), ctx.gatewayProcess.start({ url })]);
  assert.equal(a.status, 'running'); assert.equal(a.pid, b.pid); assert.ok(alive(a.pid));
  await ctx.gatewayProcess.stop(); assert.equal(alive(a.pid), false);
  const restarted = await ctx.gatewayProcess.start({ url }); assert.notEqual(restarted.pid, a.pid);
  await fiber.dispose(); assert.equal(alive(restarted.pid), false);
});
test('occupied ports leave foreign listeners intact', async t => {
  const { ctx } = await fixture(t); const reserved = await port(t, true);
  await assert.rejects(ctx.gatewayProcess.start({ url: `ws://127.0.0.1:${reserved}` }), /占用/);
  assert.equal(ctx.gatewayProcess.snapshot().pid, null);
  const socket = net.connect(reserved, '127.0.0.1'); await new Promise(resolve => socket.once('connect', resolve)); socket.destroy();
});
test('failed startup reports logs and releases process ownership', async t => {
  const { ctx } = await fixture(t, ['--fail']);
  await assert.rejects(ctx.gatewayProcess.start({ url: `ws://127.0.0.1:${await port(t)}` }), /退出|failure/);
  const state = ctx.gatewayProcess.snapshot(); assert.equal(state.status, 'failed'); assert.equal(state.pid, null); assert.match(state.logs.join('\n'), /startup failure/);
});
test('unexpected exit is reflected in the service state', async t => {
  const { ctx } = await fixture(t); const state = await ctx.gatewayProcess.start({ url: `ws://127.0.0.1:${await port(t)}` });
  process.kill(state.pid, 'SIGKILL');
  for (let i = 0; i < 30 && ctx.gatewayProcess.snapshot().pid; i++) await delay(10);
  assert.equal(ctx.gatewayProcess.snapshot().status, 'failed');
});
test('launch input cannot choose remote bind, arbitrary executable, or invalid transport', () => {
  for (const url of ['ws://0.0.0.0:9002', 'wss://localhost:9002', 'ws://localhost:9002/?token=x', 'ws://localhost:80']) assert.throws(() => localGatewayAddress(url));
  assert.throws(() => connectionArgs({ vendor: 'robstride', transport: 'dm-device' }), /仅支持/);
  assert.throws(() => connectionArgs({ channel: 'can0; touch /tmp/x' }));
  assert.throws(() => connectionArgs({ vendor: 'damiao', transport: 'dm-device', dm_device_type: 'usb2canfd', dm_channel: 1 }));
  assert.deepEqual(connectionArgs({ vendor: 'damiao', transport: 'dm-serial', serial_port: '/dev/cu.usbmodem1', serial_baud: 921600 }).slice(-4), ['--serial-port', '/dev/cu.usbmodem1', '--serial-baud', '921600']);
});
test('host protects gateway mutation and shuts down its owned process', async t => {
  const host = await createHost({ root, production: true, gatewayConfig: { executable: process.execPath, args: [path.join(root, 'tests/process-fixture.js')] } });
  t.after(() => host.close()); await new Promise(resolve => host.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${host.server.address().port}`;
  const headers = { 'Content-Type': 'application/json', origin: 'https://untrusted.example' };
  assert.equal((await fetch(base + '/api/gateway/start', { method: 'POST', headers, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/gateway/start', { method: 'POST', body: '{}' })).status, 415);
  const response = await fetch(base + '/api/gateway/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `ws://127.0.0.1:${await port(t)}` }) });
  const state = await response.json(); assert.equal(state.status, 'running');
  await host.close(); assert.equal(alive(state.pid), false);
});
test('bundled Rust gateway starts with optional token and never opens a motor bus', async t => {
  const binary = path.join(root, 'vendor/motorbridge/motorbridge/bin/ws_gateway');
  if (process.platform !== 'darwin' || process.arch !== 'arm64') { t.skip('bundled binary is macOS arm64'); return; }
  await access(binary, constants.X_OK);
  const ctx = new Context(); const fiber = await ctx.plugin(gatewayProcessPlugin, { root }); t.after(() => fiber.dispose());
  const url = `ws://127.0.0.1:${await port(t)}`;
  const state = await ctx.gatewayProcess.start({ url, token: 'local-test-token' });
  assert.equal(state.version, '0.5.6'); assert.match(state.logs[0], /standby/);
  const socket = new WebSocket(url + '?motorbridge_ws_token=local-test-token');
  const caps = await new Promise((resolve, reject) => {
    socket.on('error', reject); socket.on('open', () => socket.send(JSON.stringify({ op: 'capabilities', req_id: 42 })));
    socket.on('message', raw => { const frame = JSON.parse(raw); if (frame.req_id === 42) resolve(frame.data); });
  });
  assert.equal(caps.default_target.vendor, 'robstride'); socket.terminate();
  assert.equal(JSON.stringify(ctx.gatewayProcess.snapshot()).includes('local-test-token'), false);
});
