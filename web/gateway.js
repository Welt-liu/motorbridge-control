export class Gateway {
  constructor(onStatus = () => {}, onProgress = () => {}) {
    this.socket = null; this.pending = new Map(); this.sequence = 0;
    this.onStatus = onStatus; this.connected = false;
    this.onProgress = onProgress;
  }
  async connect(url, token = '') {
    this.disconnect();
    const parsed = new URL(url);
    if (!['ws:', 'wss:'].includes(parsed.protocol)) throw new Error('地址必须以 ws:// 或 wss:// 开头');
    if (parsed.username || parsed.password) throw new Error('请使用独立的网关访问令牌输入框');
    if (token) parsed.searchParams.set('motorbridge_ws_token', token);
    const socket = new WebSocket(parsed);
    this.socket = socket; this.onStatus('connecting');
    socket.addEventListener('message', event => {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.type === 'scan_progress') { this.onProgress(frame.data); return; }
      if (typeof frame.ok !== 'boolean') return;
      const pending = this.pending.get(frame.req_id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(frame.req_id);
      frame.ok ? pending.resolve(frame.data) : pending.reject(new Error(frame.error || '网关返回错误'));
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.connected = false; this.rejectAll('网关连接已断开'); this.onStatus('disconnected');
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.close(); reject(new Error('连接超时，请检查网关地址和进程')); }, 4000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('无法连接网关，请确认 ws_gateway 已启动')); }, { once: true });
        socket.addEventListener('close', () => { clearTimeout(timer); reject(new Error('网关在连接期间关闭')); }, { once: true });
      });
      if (this.socket !== socket) throw new Error('连接已取消');
      this.connected = true;
      const capabilities = await this.request('capabilities', {}, 3000);
      this.onStatus('connected'); return capabilities;
    } catch (error) { if (this.socket === socket) this.disconnect(); throw error; }
  }
  request(op, payload = {}, timeout = 3000) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('请先连接网关'));
    const req_id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(req_id); reject(new Error(`等待 ${op} 响应超时`)); }, timeout);
      this.pending.set(req_id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ ...payload, op, req_id })); }
      catch (error) { clearTimeout(timer); this.pending.delete(req_id); reject(error); }
    });
  }
  rejectAll(message) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }
  disconnect() {
    const socket = this.socket; this.socket = null; this.connected = false;
    this.rejectAll('连接已取消'); socket?.close(); this.onStatus('disconnected');
  }
}

export function parseID(text, max = 255, min = 0) {
  const raw = String(text).trim();
  if (!/^(0x[0-9a-f]+|[0-9]+)$/i.test(raw)) throw new Error('ID 请输入十进制或 0x 开头的十六进制整数');
  const id = Number(raw);
  if (!Number.isInteger(id) || id < min || id > max) throw new Error(`ID 范围为 ${min}～${max}`);
  return id;
}
export async function pingMotor(gateway, target, timeout = 300) {
  if (!['robstride', 'damiao'].includes(target.vendor)) throw new Error('首版支持 RobStride 和达妙电机');
  const max = target.vendor === 'robstride' ? 255 : 2047;
  const motor_id = parseID(target.motor_id, max, 1), feedback_id = parseID(target.feedback_id, max);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 3000) throw new Error('超时范围为 100～3000 ms');
  if (!target.channel.trim() || !target.model.trim()) throw new Error('请填写通道和电机型号');
  const selected = { ...connectionPayload(target), vendor: target.vendor, model: target.model.trim(), channel: target.channel.trim(), motor_id, feedback_id };
  await gateway.request('set_target', selected, 3000);
  const started = performance.now();
  const op = target.vendor === 'robstride' ? 'ping' : 'verify';
  const data = await gateway.request(op, { ...selected, timeout_ms: timeout }, timeout * 12 + 3000);
  if (target.vendor === 'robstride') {
    if (data?.pong !== true || data?.vendor !== 'robstride' || data?.device_id !== motor_id) throw new Error('响应未确认目标电机身份，不能判定在线');
  } else if (data?.ok !== true || data?.esc_id !== motor_id || data?.mst_id !== feedback_id) {
    throw new Error('达妙寄存器返回的电机 ID 或反馈 ID 不匹配');
  }
  return { target: selected, op, elapsed: Math.round(performance.now() - started), data };
}
export function connectionPayload(target) {
  const transport = target.transport || 'auto';
  if (!['auto', 'socketcan', 'socketcanfd', 'dm-device', 'dm-serial'].includes(transport)) throw new Error('连接方式不正确');
  if (['dm-device', 'dm-serial'].includes(transport) && target.vendor !== 'damiao') throw new Error('达妙 USB2CAN / 串口桥仅支持达妙电机');
  const payload = { transport, channel: target.channel };
  if (transport === 'dm-serial') {
    if (!target.serial_port?.trim()) throw new Error('请选择或填写串口');
    payload.serial_port = target.serial_port.trim(); payload.serial_baud = Number(target.serial_baud);
  }
  if (transport === 'dm-device') { payload.dm_device_type = target.dm_device_type; payload.dm_channel = String(target.dm_channel); }
  return payload;
}
export async function scanMotors(gateway, target, start, end, timeout = 120) {
  const max = target.vendor === 'robstride' ? 255 : 2047;
  const start_id = parseID(start, max, 1), end_id = parseID(end, max, 1);
  if (end_id < start_id || end_id - start_id >= 64) throw new Error('每次扫描最多 64 个 ID，结束 ID 不能小于开始 ID');
  if (!['robstride', 'damiao'].includes(target.vendor)) throw new Error('请选择支持的厂商');
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 3000) throw new Error('超时范围为 100～3000 ms');
  const feedback_id = parseID(target.feedback_id, max);
  const payload = { ...connectionPayload(target), vendor: target.vendor, model: target.model.trim(), start_id, end_id, timeout_ms: timeout };
  if (target.vendor === 'robstride') Object.assign(payload, { feedback_ids: [feedback_id], read_param_fallback: false, strict_timeout: true });
  else payload.feedback_base = feedback_id;
  // Damiao scan may try several feedback IDs/models before its fallback query.
  const data = await gateway.request('scan', payload, target.vendor === 'robstride' ? (end_id - start_id + 1) * timeout * 3 + 5000 : (end_id - start_id + 1) * 30000 + 10000);
  if (!Array.isArray(data?.hits)) throw new Error('网关没有返回有效的电机列表');
  return data;
}
