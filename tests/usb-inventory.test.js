import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
test('USB inventory parses decimal/hex IDs, escapes, and empty inventories without leaking unrelated properties', () => {
  const source = String.raw`
import json, sys
sys.path.insert(0, 'scripts')
from usb_inventory import parse_ioreg_usb, read_usb_inventory
from unittest.mock import patch
from types import SimpleNamespace
raw = '''+-o CDC Device@00120000  <class IOUSBHostDevice, id 0x123>
      "idProduct" = 17923
      "USB Product Name" = "CDC Device"
      "idVendor" = 11912
      "USB Serial Number" = "PRIVATE-SERIAL"
+-o Escaped@00130000  <class IOUSBHostDevice, id 0x124>
      "idVendor" = 0x0c72
      "idProduct" = 0xc
      "USB Product Name" = "CAN \\\"adapter\\\""
+-o Incomplete@00140000  <class IOUSBHostDevice, id 0x125>
      "idVendor" = 1452
'''
with patch('usb_inventory.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout='', stderr='')):
    assert read_usb_inventory() == []
with patch('usb_inventory.subprocess.run', return_value=SimpleNamespace(returncode=1, stdout='', stderr="ioreg: error: can't open file.")):
    try: read_usb_inventory()
    except RuntimeError as error: assert "can't open file" in str(error)
    else: raise AssertionError('command failure was hidden')
with patch('usb_inventory.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout='unrecognized output', stderr='')):
    try: read_usb_inventory()
    except RuntimeError: pass
    else: raise AssertionError('parse failure was hidden')
print(json.dumps(parse_ioreg_usb(raw)))
`;
  const parsed = JSON.parse(execFileSync(process.env.MOTORBRIDGE_PYTHON || 'python3', ['-c', source], { cwd: root, encoding: 'utf8' }));
  assert.deepEqual(parsed, [
    { name: 'CDC Device', vendorId: '2e88', productId: '4603' },
    { name: 'CAN "adapter"', vendorId: '0c72', productId: '000c' },
  ]);
  assert.equal(JSON.stringify(parsed).includes('PRIVATE-SERIAL'), false);
});
