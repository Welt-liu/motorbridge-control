import { readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const run = promisify(execFile);
export async function discoverInterfaces(root) {
  let result = { devices: [], usb: [], warnings: [] };
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await run(process.env.MOTORBRIDGE_PYTHON || '/usr/bin/python3', [path.join(root, 'scripts/discover-macos.py'), path.join(root, 'vendor/runtime/libPCBUSB.dylib'), path.join(root, 'vendor/runtime/libdm_device.dylib')], { timeout: 7000, maxBuffer: 256 * 1024 });
      result = JSON.parse(stdout);
    } catch { result.warnings.push('本机接口检索失败；可以手动填写接口'); }
  } else if (process.platform === 'linux') {
    for (const name of await readdir('/sys/class/net')) {
      const dir = `/sys/class/net/${name}`;
      if ((await readFile(`${dir}/type`, 'utf8')).trim() === '280') result.devices.push({ id: name, name, transport: 'socketcan', channel: name, verified: true, state: (await readFile(`${dir}/operstate`, 'utf8')).trim() });
    }
    for (const name of await readdir('/dev')) if (/^tty(USB|ACM)\d+$/.test(name)) result.devices.push({ id: `/dev/${name}`, name: `/dev/${name}`, transport: 'dm-serial', serial_port: `/dev/${name}`, verified: true });
  } else result.warnings.push('当前系统暂不支持自动接口枚举，请手动选择与填写');
  return { ...result, platform: process.platform, scannedAt: new Date().toISOString() };
}
