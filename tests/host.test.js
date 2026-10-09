import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHost } from '../src/host.js';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
async function fixture(t) {
  const host = await createHost({ root, production: true });
  await new Promise(resolve => host.server.listen(0, '127.0.0.1', resolve));
  t.after(() => host.close());
  return { host, url: `http://127.0.0.1:${host.server.address().port}` };
}
test('Cordis mounts Studio, removes its HTTP resources on disposal, and reloads it', async t => {
  const { host, url } = await fixture(t);
  assert.equal((await fetch(url + '/studio/zh/')).status, 200);
  assert.equal((await fetch(url + '/studio/seeed-logo.png')).headers.get('content-type'), 'image/png');
  const stopped = await fetch(url + '/api/studio/disable', { method: 'POST' });
  assert.equal((await stopped.json()).enabled, false); assert.equal(host.ctx.http.mounts.size, 0);
  assert.equal((await fetch(url + '/studio/')).status, 503);
  const started = await fetch(url + '/api/studio/enable', { method: 'POST' });
  assert.equal((await started.json()).enabled, true); assert.equal(host.ctx.http.mounts.size, 1);
  assert.equal((await fetch(url + '/studio/')).status, 200);
});
test('cross-origin plugin mutations and missing assets are rejected', async t => {
  const { host, url } = await fixture(t);
  assert.equal((await fetch(url + '/api/studio/disable', { method: 'POST', headers: { origin: 'https://untrusted.example' } })).status, 403);
  assert.equal(host.state().enabled, true);
  assert.equal((await fetch(url + '/studio/assets/missing.js')).status, 404);
});
test('concurrent enable calls do not create duplicate plugin mounts', async t => {
  const { host, url } = await fixture(t);
  await fetch(url + '/api/studio/disable', { method: 'POST' });
  const results = await Promise.all(Array.from({ length: 4 }, () => fetch(url + '/api/studio/enable', { method: 'POST' })));
  assert.ok(results.every(r => r.ok)); assert.equal(host.ctx.http.mounts.size, 1);
});
