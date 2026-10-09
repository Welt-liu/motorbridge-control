import http from 'node:http';
import path from 'node:path';
import { Context } from 'cordis';
import { studioPlugin } from './plugins/studio.js';
import { staticHandler } from './static.js';
import { gatewayProcessPlugin } from './plugins/gateway-process.js';
import { discoverInterfaces } from './discovery.js';

const httpPlugin = { name: 'http', apply(ctx) { ctx.provide('http', { mounts: new Map() }); } };
export async function createHost({ root, production = false, autoload = true, gatewayConfig = {} }) {
  const ctx = new Context();
  const httpFiber = await ctx.plugin(httpPlugin);
  let studioFiber = null, transition = Promise.resolve();
  const clients = new Set();
  const gatewayClients = new Set();
  const gatewayFiber = await ctx.plugin(gatewayProcessPlugin, { ...gatewayConfig, root, onChange: state => { for (const client of gatewayClients) client.write(`data: ${JSON.stringify(state)}\n\n`); } });
  const studioConfig = { dist: path.join(root, 'plugins/motorbridge-studio/ui/dist') };
  const state = () => ({ id: 'motorbridge-studio', enabled: Boolean(studioFiber), version: '1.1.9', runtime: 'cordis', sourceCommit: '23b6e62ab8173faee3928c827cca3b7f42ba2128' });
  async function enable() { if (!studioFiber) studioFiber = await ctx.plugin(studioPlugin, studioConfig); }
  async function disable() { const fiber = studioFiber; studioFiber = null; if (fiber) await fiber.dispose(); }
  if (autoload) await enable();
  const vite = production ? null : await (await import('vite')).createServer({
    configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true, hmr: false }, appType: 'spa',
  });
  const shell = staticHandler(path.join(root, 'dist'));
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  function broadcast() { for (const client of clients) client.write(`data: ${JSON.stringify(state())}\n\n`); }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/gateway' && req.method === 'GET') return json(res, 200, ctx.gatewayProcess.snapshot());
      if (url.pathname === '/api/interfaces' && req.method === 'GET') return json(res, 200, await discoverInterfaces(root));
      if (url.pathname === '/api/gateway/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(ctx.gatewayProcess.snapshot())}\n\n`); gatewayClients.add(res);
        req.on('close', () => gatewayClients.delete(res)); return;
      }
      if (['/api/gateway/start', '/api/gateway/stop'].includes(url.pathname) && req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: '请从当前工作空间管理网关' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: '需要 JSON 请求' });
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8192) return json(res, 413, { error: '请求内容过长' }); }
        try {
          const input = JSON.parse(body || '{}');
          return json(res, 200, await (url.pathname.endsWith('/start') ? ctx.gatewayProcess.start(input) : ctx.gatewayProcess.stop()));
        } catch (error) { return json(res, 400, { error: error.message, state: ctx.gatewayProcess.snapshot() }); }
      }
      if (url.pathname === '/api/studio' && req.method === 'GET') return json(res, 200, state());
      if (url.pathname === '/api/studio/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(state())}\n\n`); clients.add(res);
        req.on('close', () => clients.delete(res)); return;
      }
      if (['/api/studio/enable', '/api/studio/disable'].includes(url.pathname) && req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: '请从当前工作空间管理插件' });
        const next = transition.then(() => url.pathname.endsWith('/enable') ? enable() : disable());
        transition = next.catch(() => {}); await next; broadcast(); return json(res, 200, state());
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: '接口不存在' });
      if (url.pathname === '/studio') { res.writeHead(302, { Location: '/studio/' }); res.end(); return; }
      if (url.pathname.startsWith('/studio/')) {
        const handler = ctx.http.mounts.get('/studio');
        if (!handler) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('MotorBridge Studio 插件未加载'); return; }
        return await handler(req, res);
      }
      if (vite) vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
      else await shell(req, res);
    } catch (error) { if (!res.headersSent) json(res, 500, { error: error.message }); else res.end(); }
  });
  return { server, ctx, state,
    async close() {
      await transition; await disable(); broadcast();
      for (const client of clients) client.end(); clients.clear();
      await gatewayFiber.dispose();
      for (const client of gatewayClients) client.end(); gatewayClients.clear();
      await vite?.close(); await httpFiber.dispose();
      server.closeAllConnections();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
  };
}
