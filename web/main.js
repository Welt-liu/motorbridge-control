import './style.css';
import { Gateway, pingMotor, scanMotors } from './gateway.js';

const icons = {
  bolt: '<path d="m13 2-8 12h6l-1 8 9-12h-6z"/>',
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plug: '<path d="M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-12 0zm6 10v4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.pulse}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
document.querySelector('#app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="/">${icon('bolt')}<span>motorbridge<span class="brand-sub">CONTROL WORKSPACE</span></span></a>
    <div class="workspace-label">工作空间 <span>LOCAL</span></div>
    <nav aria-label="主导航"><button class="nav-item active" id="nav-ping">${icon('pulse')}<span>连接检查</span><span class="nav-dot"></span></button><button class="nav-item" id="nav-apps">${icon('grid')}<span>应用</span><span class="nav-count" id="app-count">0</span></button></nav>
    <div class="sidebar-bottom"><div class="runtime-dot"></div><div>本地工作空间<small id="runtime-label">Web UI · 首版</small></div><span class="version">0.1</span></div>
  </aside>
  <main>
    <header><span id="breadcrumb">工作空间 <span class="slash">/</span> 连接检查</span><div class="header-end"><span class="local-tag">本地运行</span><span class="avatar">MB</span></div></header>
    <section id="ping-page" class="page">
      <div class="page-title"><div><div class="eyebrow">DEVICE CONNECTION</div><h1>先建立连接。</h1><p>从一次 Ping 开始，确认网关与电机之间的通信。</p></div><span class="stage-tag">01 <span>连接检查</span></span></div>
      <section class="card adapter-card"><div class="card-head"><h2>连接方式与接口</h2><button id="discover" class="text-button">重新检索接口</button></div>
        <div class="adapter-fields"><div><label for="transport">连接方式</label><select id="transport"><option value="auto">自动 · 标准 CAN</option><option value="socketcan">USB2CAN · PEAK / SocketCAN</option><option value="dm-device">USB2CAN · 达妙 SDK</option><option value="dm-serial">串口 · 达妙桥接</option></select></div><div><label for="interface">检索到的接口</label><select id="interface"><option value="">手动填写接口</option></select></div></div>
        <div id="dm-settings" class="adapter-fields" hidden><div><label for="dm-type">USB2CAN 型号</label><select id="dm-type"><option value="usb2canfd-dual">USB2CANFD DUAL</option><option value="usb2canfd">USB2CANFD</option><option value="linkx4c">LINKX4C</option></select></div><div><label for="dm-channel">SDK 通道</label><select id="dm-channel"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div></div>
        <div id="serial-settings" class="adapter-fields" hidden><div><label for="serial-port">串口路径</label><input id="serial-port" placeholder="/dev/cu.usbmodem…" spellcheck="false"></div><div><label for="serial-baud">串口波特率</label><select id="serial-baud"><option>921600</option><option>115200</option><option>460800</option><option>1000000</option></select></div></div>
        <p id="interface-note" class="helper">正在检索本机接口…</p><details id="usb-details" class="token-details" hidden><summary>USB 设备信息</summary><div id="usb-list"></div></details>
      </section>
      <div class="workspace-grid">
        <section class="card connection-card"><div class="card-head"><div class="section-icon">${icon('plug')}</div><h2>网关连接</h2><span id="gateway-badge" class="badge">未连接</span></div>
          <label class="field-label" for="ws-url">WebSocket 地址</label><div class="input-wrap"><input id="ws-url" type="url" value="ws://127.0.0.1:9002" spellcheck="false" aria-label="WebSocket 地址"></div>
          <details class="token-details"><summary>网关访问令牌 <span>可选</span></summary><input id="ws-token" type="password" autocomplete="off" placeholder="Token"></details>
          <div class="gateway-actions"><button id="connect" class="button primary">${icon('plug')}启动并连接</button><button id="connect-only" class="text-button">仅连接</button><button id="disconnect" class="text-button" disabled>断开</button></div><p id="gateway-note" class="helper">由 Cordis 启动本机网关，无需另开终端。</p>
          <div class="process-line"><span id="process-badge" class="badge">网关未启动</span><button id="stop-gateway" class="text-button" disabled>停止网关</button></div><details class="token-details"><summary>网关启动日志</summary><pre id="gateway-logs" class="gateway-logs">暂无日志</pre></details>
          <div class="divider"></div>
          <div class="small-heading"><h2>目标电机</h2><span>单电机检查</span></div>
          <fieldset id="target-fields"><div class="field-row"><div><label for="vendor">厂商</label><select id="vendor"><option value="robstride">RobStride</option><option value="damiao">达妙 · Damiao</option></select></div><div><label for="model">型号</label><input id="model" value="rs-00" spellcheck="false"></div></div>
          <label for="channel">CAN 通道</label><input id="channel" value="can0" spellcheck="false">
          <div class="field-row"><div><label for="motor-id">电机 ID</label><input id="motor-id" value="1" spellcheck="false"></div><div><label for="feedback-id">Host / 反馈 ID</label><input id="feedback-id" value="0xFD" spellcheck="false"></div></div>
          <label for="timeout">设备等待时间</label><div class="timeout-input"><input id="timeout" type="number" min="100" max="3000" step="100" value="300"><span>ms / 尝试</span></div></fieldset>
          <p id="protocol-note" class="protocol-note">RobStride 使用设备 Ping，等待电机身份回复。</p><button id="ping" class="button primary" disabled>${icon('pulse')}<span>Ping 电机</span>${icon('arrow')}</button>
        </section>
        <section class="card result-card"><div class="card-head"><h2>通信结果</h2><span class="muted">最近一次检查</span></div>
          <div id="result" class="result-body"><div class="motor-art"><svg viewBox="0 0 210 190" fill="none" aria-hidden="true"><ellipse cx="105" cy="153" rx="76" ry="15" fill="#dce5dd" opacity=".55"/><path d="m54 65 49-27 53 28v62l-50 27-52-29z" fill="#e1e8df" stroke="#5d7466" stroke-width="1.5"/><path d="m54 65 52 28 50-27M106 93v62" stroke="#5d7466" stroke-width="1.5"/><ellipse cx="80" cy="108" rx="17" ry="24" transform="rotate(-29 80 108)" fill="#f7faf5" stroke="#5d7466" stroke-width="1.5"/><path d="m70 105-20-11c-6-3-11 7-5 11l20 11" fill="#adbfae" stroke="#5d7466" stroke-width="1.5"/><path d="m117 65 14 7m-28-14 9 5M135 107v18" stroke="#5d7466" stroke-width="2"/><circle cx="119" cy="51" r="3" fill="#5d7466"/></svg><span class="art-orbit"></span></div><span class="result-kicker">READY WHEN YOU ARE</span><h3>等待你的第一次 Ping</h3><p>连接网关，选择目标电机，<br>收到设备回复后，结果会显示在这里。</p><div class="result-hint"><span class="status-dot"></span>尚未检查电机</div></div>
          <div class="result-footer"><span>检查流程</span><div><span>网关连接</span>${icon('arrow')}<span>指定电机</span>${icon('arrow')}<span>设备回复</span></div></div>
        </section>
      </div>
      <section class="card scan-card"><div class="card-head"><h2>扫描电机</h2><span class="muted">通过所选接口发现设备</span></div><div class="scan-controls"><div><label for="scan-start">开始 ID</label><input id="scan-start" value="1"></div><div><label for="scan-end">结束 ID</label><input id="scan-end" value="8"></div><button id="scan" class="button secondary" disabled>扫描电机</button></div><p id="scan-note" class="helper">先连接网关，再扫描所选厂商；RobStride 使用上方 Host ID。达妙扫描可能尝试多个反馈 ID，耗时更长。</p><div id="scan-results" class="scan-results"></div></section>
      <section class="card history-card"><div class="card-head"><h2>检查记录 <span id="history-count" class="count">0</span></h2><button id="clear-history" class="text-button" disabled>清空记录</button></div><div class="table-scroll"><table><thead><tr><th>检查时间</th><th>目标电机</th><th>电机 ID</th><th>结果</th><th>响应耗时</th><th>检查方式</th></tr></thead><tbody id="history"><tr><td colspan="6" class="empty-history">检查记录将在这里显示，仅保留本次会话的最近 20 条。</td></tr></tbody></table></div></section>
      <footer class="page-footer"><span>MotorBridge Connect</span><span>网关已连接 ≠ 电机已响应</span></footer>
    </section>
    <section id="apps-page" class="page" hidden><div class="page-title"><div><div class="eyebrow">APPLICATIONS</div><h1>你的应用。</h1><p>在本地工作空间中加载和运行插件。</p></div></div><div id="apps-content" class="card apps-placeholder">应用入口正在准备中。</div></section>
    <section id="studio-page" hidden><div class="studio-top"><div><strong>MotorBridge Studio</strong><span>电机与机械臂工作台</span></div><button id="close-studio" class="text-button">返回应用</button></div><div id="studio-frame"></div></section>
  </main>`;
const $ = id => document.getElementById(id);
let status = 'disconnected', busy = false, history = [], hostState = null, processState = null, processBusy = false, interfaces = [];
const gateway = new Gateway(next => {
  status = next;
  $('gateway-badge').textContent = ({ disconnected: '未连接', connecting: '连接中', connected: '已连接' })[next];
  $('gateway-badge').classList.toggle('success', next === 'connected'); syncButtons();
}, progress => { $('scan-note').textContent = progress.phase === 'hit' ? '发现电机，继续扫描…' : `正在扫描 · ${progress.probe ?? progress.phase ?? '准备中'}`; });
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('visible'), 5000); }
function syncButtons() {
  $('connect').disabled = status !== 'disconnected' || busy || processBusy || processState?.available === false;
  $('connect-only').disabled = status !== 'disconnected' || busy || processBusy;
  $('stop-gateway').disabled = !processState?.pid || processBusy;
  $('scan').disabled = status !== 'connected' || busy || processBusy;
  $('discover').disabled = processBusy || busy;
  for (const id of ['transport', 'interface', 'dm-type', 'dm-channel', 'serial-port', 'serial-baud', 'scan-start', 'scan-end']) $(id).disabled = busy || processBusy;
  $('disconnect').disabled = status === 'disconnected';
  $('ping').disabled = status !== 'connected' || busy;
  $('target-fields').disabled = busy;
  $('ws-url').disabled = status !== 'disconnected'; $('ws-token').disabled = status !== 'disconnected';
  $('ping').querySelector('span').textContent = busy ? '等待网关回复…' : 'Ping 电机';
}
function saveGatewayAddress() {
  try {
    const url = new URL($('ws-url').value.trim());
    url.searchParams.delete('motorbridge_ws_token');
    if (['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password) localStorage.setItem('motorbridge-connect-url', url.toString());
  } catch { /* Invalid addresses remain editable; connect reports the error. */ }
}
function renderHistory() {
  $('history-count').textContent = history.length; $('clear-history').disabled = !history.length;
  $('history').innerHTML = history.length ? history.map(r => `<tr><td>${escape(r.time)}</td><td>${escape(r.vendor)} · ${escape(r.model)}</td><td class="mono">${escape(r.motor_id)}</td><td><span class="badge ${r.ok ? 'success' : 'failure'}">${r.ok ? '已响应' : '检查失败'}</span></td><td class="mono">${r.ok ? `${r.elapsed} ms` : '—'}</td><td>${escape(r.op)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-history">检查记录将在这里显示，仅保留本次会话的最近 20 条。</td></tr>';
}
function renderResult(result, error, target) {
  $('result').className = `result-body ${error ? 'error-result' : 'success-result'}`;
  $('result').innerHTML = `<div class="result-symbol ${error ? 'failed' : ''}">${icon(error ? 'x' : 'check')}</div><span class="result-kicker">${error ? 'CHECK FAILED' : 'MOTOR RESPONDED'}</span><h3>${error ? '尚未确认电机在线' : '收到了电机回复'}</h3><p>${error ? escape(error.message) : `${escape(target.model)} · 电机 ${escape(target.motor_id)} 已完成身份确认。`}</p><div class="result-metrics"><div><span>电机 ID</span><strong>${escape(target.motor_id)}</strong></div><div><span>响应耗时</span><strong>${result ? `${result.elapsed}<small> ms</small>` : '—'}</strong></div><div><span>检查方式</span><strong>${target.vendor === 'robstride' ? 'Ping' : 'Verify'}</strong></div></div>${result ? `<details class="raw-response"><summary>查看网关原始回复</summary><pre>${escape(JSON.stringify(result.data, null, 2))}</pre></details>` : '<div class="result-hint">检查地址、通道、ID 和电机供电后重试。</div>'}`;
}
async function connectGateway() {
  saveGatewayAddress();
  try {
    const caps = await gateway.connect($('ws-url').value.trim(), $('ws-token').value.trim());
    $('gateway-note').textContent = `网关已连接 · ${caps.gateway_version ? `v${caps.gateway_version}` : caps.api_version || 'V1'}`;
    if (!caps.test_fixture) saveGatewayAddress();
  } catch (error) { $('gateway-note').textContent = error.message; toast(error.message); }
}
$('connect-only').onclick = connectGateway;
$('connect').onclick = async () => {
  processBusy = true; syncButtons(); $('gateway-note').textContent = '正在启动 MotorBridge 网关…';
  try {
    const data = await processAction('start', { url: $('ws-url').value.trim(), token: $('ws-token').value.trim(), connection: readTarget() });
    $('ws-url').value = data.url; await connectGateway();
  } catch (error) { $('gateway-note').textContent = error.message; toast(error.message); }
  finally { processBusy = false; syncButtons(); }
};
$('stop-gateway').onclick = async () => {
  processBusy = true; gateway.disconnect(); syncButtons();
  try { await processAction('stop'); $('gateway-note').textContent = '网关已停止，可重新选择接口并启动。'; }
  catch (error) { toast(error.message); }
  finally { processBusy = false; syncButtons(); }
};
$('ws-url').onchange = saveGatewayAddress;
$('disconnect').onclick = () => { gateway.disconnect(); $('gateway-note').textContent = '网关已断开，可以修改连接地址。'; };
$('vendor').onchange = () => {
  const rs = $('vendor').value === 'robstride'; $('model').value = rs ? 'rs-00' : '4310'; $('feedback-id').value = rs ? '0xFD' : '0x11';
  $('protocol-note').textContent = rs ? 'RobStride 使用设备 Ping，等待电机身份回复。' : '达妙使用 Verify 读取 ID 寄存器，确认真实设备响应。';
};
$('ping').onclick = async () => {
  const target = readTarget();
  busy = true; syncButtons();
  $('result').className = 'result-body'; $('result').innerHTML = '<div class="waiting-ring"></div><span class="result-kicker">WAITING FOR RESPONSE</span><h3>正在检查目标电机</h3><p>等待 MotorBridge 返回设备身份。</p>';
  let result, error;
  try { result = await pingMotor(gateway, target, Number($('timeout').value)); }
  catch (e) { error = e; }
  finally { busy = false; syncButtons(); }
  renderResult(result, error, target);
  history.unshift({ ...target, ok: !error, elapsed: result?.elapsed, op: target.vendor === 'robstride' ? 'Ping' : 'Verify', time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }); history = history.slice(0, 20); renderHistory();
};
$('clear-history').onclick = () => { history = []; renderHistory(); };
function readTarget() {
  return { vendor: $('vendor').value, model: $('model').value, channel: $('channel').value, motor_id: $('motor-id').value, feedback_id: $('feedback-id').value, transport: $('transport').value, serial_port: $('serial-port').value, serial_baud: Number($('serial-baud').value), dm_device_type: $('dm-type').value, dm_channel: $('dm-channel').value };
}
function renderProcess(data) {
  processState = data;
  $('process-badge').textContent = ({ stopped: '网关未启动', starting: '网关启动中', running: `网关运行中 · PID ${data.pid}`, stopping: '网关停止中', failed: '网关进程异常' })[data.status];
  $('process-badge').className = `badge ${data.status === 'running' ? 'success' : data.status === 'failed' ? 'failure' : ''}`;
  $('gateway-logs').textContent = data.logs?.join('\n') || '暂无日志';
  if (data.status === 'failed') { $('gateway-note').textContent = data.error; if (status !== 'disconnected' && $('ws-url').value.replace(/\/$/, '') === data.url) gateway.disconnect(); }
  if (!data.available) $('gateway-note').textContent = '未找到本机网关程序；可配置网关路径，或使用“仅连接”。';
  syncButtons();
}
async function processAction(action, body = {}) {
  const response = await fetch(`/api/gateway/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) { if (data.state) renderProcess(data.state); throw new Error(data.error); }
  renderProcess(data); return data;
}
function updateTransport() {
  const transport = $('transport').value;
  $('dm-settings').hidden = transport !== 'dm-device'; $('serial-settings').hidden = transport !== 'dm-serial';
  if (['dm-device', 'dm-serial'].includes(transport) && $('vendor').value !== 'damiao') { $('vendor').value = 'damiao'; $('vendor').onchange(); }
  $('channel').disabled = busy || ['dm-device', 'dm-serial'].includes(transport);
  const count = { usb2canfd: 1, 'usb2canfd-dual': 2, linkx4c: 4 }[$('dm-type').value];
  for (const option of $('dm-channel').options) option.disabled = Number(option.value) >= count;
  if (Number($('dm-channel').value) >= count) $('dm-channel').value = '0';
}
$('transport').onchange = updateTransport;
$('dm-type').onchange = updateTransport;
$('interface').onchange = () => {
  const selected = interfaces.find(d => d.id === $('interface').value); if (!selected) return;
  $('transport').value = selected.transport;
  if (selected.channel) $('channel').value = selected.channel;
  if (selected.serial_port) $('serial-port').value = selected.serial_port;
  if (selected.dm_device_type) $('dm-type').value = selected.dm_device_type;
  updateTransport();
};
async function discover() {
  $('discover').disabled = true; $('interface-note').textContent = '正在检索 USB / CAN / 串口接口…';
  try {
    const response = await fetch('/api/interfaces'); if (!response.ok) throw new Error('接口检索失败'); const data = await response.json();
    const previous = $('interface').value; interfaces = data.devices;
    $('interface').innerHTML = '<option value="">手动填写接口</option>' + interfaces.map(d => `<option value="${escape(d.id)}">${escape(d.name)}${d.occupied ? ' · 已占用' : ''}</option>`).join('');
    if (interfaces.some(d => d.id === previous)) $('interface').value = previous;
    $('interface-note').textContent = `${interfaces.length ? `找到 ${interfaces.length} 个可选接口。` : '未检索到支持的适配器，请插入 USB2CAN 后重新检索；也可手动填写。'} ${data.warnings.join('；')} 接口检索不向电机发送指令。`;
    $('usb-details').hidden = !data.usb.length;
    $('usb-list').innerHTML = data.usb.map(d => `<p>${escape(d.name)} · VID ${escape(d.vendorId)} / PID ${escape(d.productId)}</p>`).join('');
  } catch (error) { $('interface-note').textContent = error.message; }
  finally { syncButtons(); }
}
$('discover').onclick = discover;
$('scan').onclick = async () => {
  busy = true; syncButtons(); const target = readTarget(); $('scan-note').textContent = '正在扫描电机…'; $('scan-results').replaceChildren();
  try {
    const data = await scanMotors(gateway, target, $('scan-start').value, $('scan-end').value, Number($('timeout').value));
    $('scan-note').textContent = data.hits.length ? `发现 ${data.hits.length} 个电机，点击条目填入目标，再执行 Ping 确认。` : '扫描完成，未发现电机。请检查接口、供电、厂商与 ID 范围。';
    $('scan-results').innerHTML = data.hits.map((hit, index) => `<button class="motor-hit" data-hit="${index}"><strong>电机 ${escape(hit.device_id ?? hit.esc_id ?? hit.probe)}</strong><span>Host / 反馈 ID ${escape(hit.feedback_id ?? hit.mst_id ?? hit.probe_feedback_id ?? target.feedback_id)}</span><span>选择 →</span></button>`).join('');
    $('scan-results').querySelectorAll('button').forEach(button => { button.onclick = () => {
      const hit = data.hits[Number(button.dataset.hit)]; $('motor-id').value = hit.device_id ?? hit.esc_id ?? hit.probe;
      $('feedback-id').value = hit.feedback_id ?? hit.mst_id ?? hit.probe_feedback_id ?? target.feedback_id;
      if (hit.dm_channel !== undefined) $('dm-channel').value = String(hit.dm_channel);
      toast('已选择目标电机，可点击 Ping 确认');
    }; });
  } catch (error) { $('scan-note').textContent = error.message; }
  finally { busy = false; syncButtons(); updateTransport(); }
};
fetch('/api/gateway').then(r => r.json()).then(renderProcess).catch(() => {});
const gatewayEvents = new EventSource('/api/gateway/events');
gatewayEvents.onmessage = event => renderProcess(JSON.parse(event.data));
window.addEventListener('pagehide', () => gatewayEvents.close(), { once: true });
discover();
function showPage(page) {
  $('ping-page').hidden = page !== 'ping'; $('apps-page').hidden = page !== 'apps'; $('studio-page').hidden = page !== 'studio';
  $('nav-ping').classList.toggle('active', page === 'ping'); $('nav-apps').classList.toggle('active', page !== 'ping');
  $('breadcrumb').innerHTML = `工作空间 <span class="slash">/</span> ${page === 'ping' ? '连接检查' : page === 'apps' ? '应用' : 'MotorBridge Studio'}`;
}
function leaveStudio(page) { $('studio-frame').replaceChildren(); showPage(page); }
$('nav-ping').onclick = () => leaveStudio('ping');
$('nav-apps').onclick = () => leaveStudio('apps');
$('close-studio').onclick = () => leaveStudio('apps');
try { const cached = localStorage.getItem('motorbridge-connect-url'); if (cached) $('ws-url').value = cached; } catch { /* Browser storage can be disabled. */ }
window.addEventListener('pagehide', () => gateway.disconnect());
syncButtons();

// Studio is mounted and disposed by the Cordis host.
async function hostAction(action) {
  const response = await fetch(`/api/studio/${action}`, { method: 'POST' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error);
  hostState = data; renderApps();
}
function renderApps() {
  if (!hostState) return;
  $('runtime-label').textContent = 'Cordis · 插件运行时'; $('app-count').textContent = '1';
  $('apps-content').className = 'app-card card';
  $('apps-content').innerHTML = `<div class="app-illustration">${icon('grid')}<span>STUDIO</span></div><div class="app-description"><div class="app-title"><h2>MotorBridge Studio</h2><span class="badge ${hostState.enabled ? 'success' : ''}">${hostState.enabled ? '已加载' : '已停用'}</span></div><p>原版电机与机械臂工作台，连接 MotorBridge 网关。</p><div class="app-tags"><span>电机调试</span><span>reBot 机械臂</span><span>本地插件</span></div><small>Studio ${escape(hostState.version)} · Cordis 插件管理</small></div><div class="app-buttons"><button id="open-app" class="button primary" ${hostState.enabled ? '' : 'disabled'}>打开工作台 ${icon('arrow')}</button><button id="toggle-app" class="button secondary">${hostState.enabled ? '停用插件' : '加载插件'}</button></div>`;
  $('open-app').onclick = () => {
    try { const url = new URL($('ws-url').value); url.searchParams.delete('motorbridge_ws_token'); localStorage.setItem('motorbridge_studio_ws_url_v1', JSON.stringify(url.toString())); } catch { /* Studio retains its own editable address. */ }
    gateway.disconnect();
    if (!$('studio-frame').firstChild) $('studio-frame').innerHTML = '<iframe title="MotorBridge Studio" src="/studio/zh/?page=robot_arm"></iframe>';
    showPage('studio');
  };
  $('toggle-app').onclick = async () => {
    $('toggle-app').disabled = true;
    try { await hostAction(hostState.enabled ? 'disable' : 'enable'); if (!hostState.enabled) $('studio-frame').replaceChildren(); }
    catch (error) { toast(error.message); renderApps(); }
  };
}
fetch('/api/studio').then(r => r.ok ? r.json() : null).then(data => {
  if (data?.id !== 'motorbridge-studio') return;
  hostState = data; renderApps();
  const events = new EventSource('/api/studio/events');
  events.onmessage = event => {
    hostState = JSON.parse(event.data); renderApps();
    if (!hostState.enabled) {
      $('studio-frame').replaceChildren();
      if (!$('studio-page').hidden) showPage('apps');
    }
  };
  window.addEventListener('pagehide', () => events.close(), { once: true });
}).catch(() => {});
