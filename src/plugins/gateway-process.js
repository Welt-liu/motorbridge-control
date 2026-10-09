import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

export function localGatewayAddress(value) {
  const url = new URL(value || 'ws://127.0.0.1:9002');
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || !['', '/'].includes(url.pathname)) throw new Error('启动网关只支持本机 ws://127.0.0.1:端口；其他网关请使用“仅连接”');
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('网关端口范围为 1024～65535');
  return { port, url: `ws://127.0.0.1:${port}` };
}
export function connectionArgs(input = {}) {
  const vendor = input.vendor || 'robstride', transport = input.transport || 'auto';
  if (!['robstride', 'damiao'].includes(vendor) || !['auto', 'socketcan', 'socketcanfd', 'dm-device', 'dm-serial'].includes(transport)) throw new Error('不支持的厂商或连接方式');
  if (['dm-device', 'dm-serial'].includes(transport) && vendor !== 'damiao') throw new Error('达妙 USB2CAN / 串口桥仅支持达妙电机');
  const channel = input.channel || 'can0';
  if (!/^[a-zA-Z0-9_.:@-]{1,100}$/.test(channel)) throw new Error('CAN 通道格式不正确');
  const args = ['--vendor', vendor, '--transport', transport, '--channel', channel];
  if (transport === 'dm-device') {
    if (!['usb2canfd', 'usb2canfd-dual', 'linkx4c'].includes(input.dm_device_type) || !/^[0-3]$/.test(String(input.dm_channel))) throw new Error('请选择 USB2CAN 型号与有效通道');
    const count = { usb2canfd: 1, 'usb2canfd-dual': 2, linkx4c: 4 }[input.dm_device_type];
    if (Number(input.dm_channel) >= count) throw new Error('所选型号没有这个通道');
    args.push('--dm-device-type', input.dm_device_type, '--dm-channel', String(input.dm_channel));
  }
  if (transport === 'dm-serial') {
    if (typeof input.serial_port !== 'string' || !/^(\/dev\/[a-zA-Z0-9_.-]+|COM\d+)$/.test(input.serial_port)) throw new Error('请填写有效串口路径');
    if (![115200, 460800, 921600, 1000000].includes(Number(input.serial_baud))) throw new Error('请选择支持的串口波特率');
    args.push('--serial-port', input.serial_port, '--serial-baud', String(input.serial_baud));
  }
  return args;
}
async function freePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', () => reject(new Error('端口已被占用；可使用“仅连接”，或更换网关端口'))); server.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => server.close(resolve));
}
function probe(url, token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, token ? { headers: { 'x-motorbridge-token': token } } : {});
    const timer = setTimeout(() => finish(new Error('能力查询超时')), 500);
    function finish(error, data) { clearTimeout(timer); socket.removeAllListeners(); socket.on('error', () => {}); socket.terminate(); error ? reject(error) : resolve(data); }
    socket.on('error', error => finish(error));
    socket.on('close', () => finish(new Error('网关关闭')));
    socket.on('open', () => socket.send(JSON.stringify({ op: 'capabilities', req_id: 'host-ready' })));
    socket.on('message', raw => { let frame; try { frame = JSON.parse(raw); } catch { return; } if (frame.req_id === 'host-ready') frame.ok && frame.data?.api_version ? finish(null, frame.data) : finish(new Error(frame.error || '不支持 MotorBridge 能力查询')); });
  });
}

export const gatewayProcessPlugin = {
  name: 'motorbridge-gateway',
  async apply(ctx, config) {
    const runtime = path.join(config.root, 'vendor/runtime');
    const bundled = process.platform === 'darwin' && process.arch === 'arm64' ? path.join(config.root, 'vendor/motorbridge/motorbridge/bin/ws_gateway') : null;
    const executable = config.executable || process.env.MOTORBRIDGE_WS_GATEWAY_BIN || bundled;
    let available = false;
    if (executable) try { await access(executable, constants.X_OK); available = true; } catch { /* Report in UI. */ }
    let child = null, state = { status: 'stopped', pid: null, url: null, error: null, available, logs: [] };
    let queue = Promise.resolve(), closing = false, activeKey = null;
    const snapshot = () => ({ ...state, logs: [...state.logs] });
    const notify = () => config.onChange?.(snapshot());
    const log = text => { state.logs = [...state.logs, ...String(text).split(/\r?\n/).filter(Boolean).map(s => s.slice(0, 500))].slice(-30); notify(); };
    async function stopChild() {
      const current = child;
      if (current) {
        state.status = 'stopping'; notify();
        await new Promise(resolve => {
          const timer = setTimeout(() => current.kill('SIGKILL'), 2000);
          current.once('close', () => { clearTimeout(timer); resolve(); });
          current.kill('SIGTERM');
        });
        if (child === current) child = null;
      }
      state = { ...state, status: 'stopped', pid: null, error: null }; notify();
      return snapshot();
    }
    async function startChild(input) {
      if (closing) throw new Error('宿主正在关闭');
      const address = localGatewayAddress(input.url);
      const args = connectionArgs(input.connection);
      const key = JSON.stringify([address.url, args, input.token || '']);
      if (child) {
        if (state.status === 'running' && activeKey === key) return snapshot();
        throw new Error('请先停止当前网关，再更换端口、启动连接方式或访问令牌');
      }
      if (!available) throw new Error('未找到网关程序，请在宿主启动时设置 MOTORBRIDGE_WS_GATEWAY_BIN');
      if (typeof input.token !== 'undefined' && (typeof input.token !== 'string' || input.token.length > 512 || /[\r\n]/.test(input.token))) throw new Error('访问令牌格式不正确');
      await freePort(address.port);
      state = { ...state, status: 'starting', url: address.url, error: null, logs: [] }; notify();
      const env = { ...process.env, MOTORBRIDGE_WS_TOKEN: input.token || '', MOTOR_DM_DEVICE_LIB: process.env.MOTOR_DM_DEVICE_LIB || path.join(runtime, 'libdm_device.dylib'), DYLD_LIBRARY_PATH: [runtime, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(path.delimiter) };
      if (!input.token) delete env.MOTORBRIDGE_WS_TOKEN;
      if (process.platform !== 'darwin') {
        delete env.DYLD_LIBRARY_PATH;
        if (!process.env.MOTOR_DM_DEVICE_LIB) delete env.MOTOR_DM_DEVICE_LIB;
      }
      const current = spawn(executable, [...(config.args || []), '--bind', `127.0.0.1:${address.port}`, ...args], { shell: false, cwd: config.root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      child = current; activeKey = key; state.pid = current.pid || null;
      // Readiness must follow this child's successful bind, not a foreign listener.
      let announced = false;
      current.stdout.on('data', data => { if (String(data).includes('ws_gateway listening on')) announced = true; log(data); });
      current.stderr.on('data', data => { if (String(data).includes('ws_gateway listening on')) announced = true; log(data); });
      current.on('error', error => { state.error = error.message; log(error.message); });
      current.once('close', (code, signal) => {
        if (child !== current) return;
        child = null; state.pid = null;
        if (state.status !== 'stopping') { state.status = 'failed'; state.error ||= `网关退出（${signal || code}），请查看启动日志`; }
        notify();
      });
      try {
        for (let i = 0; i < 60; i++) {
          if (child !== current || state.error) throw new Error(state.error || '网关启动失败');
          if (announced) try { const caps = await probe(address.url, input.token); if (child !== current) throw new Error('网关已退出'); state.status = 'running'; state.version = caps.gateway_version; notify(); return snapshot(); } catch { /* Retry until deadline. */ }
          await delay(100);
        }
        throw new Error('网关启动超时，未通过 WebSocket 能力查询');
      } catch (error) {
        await stopChild(); state.status = 'failed'; state.error = error.message; notify(); throw error;
      }
    }
    const serialize = action => { const next = queue.then(action); queue = next.catch(() => {}); return next; };
    ctx.provide('gatewayProcess', { snapshot, start: input => serialize(() => startChild(input)), stop: () => serialize(stopChild) });
    ctx.effect(() => async () => { closing = true; await queue; await stopChild(); });
  },
};
