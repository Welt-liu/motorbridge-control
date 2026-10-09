"""Read the shallow ioreg text inventory without plist archive output."""
import json
import re
import subprocess


def parse_ioreg_usb(text):
    devices = []
    current = None

    def append_current():
        if current and 'vendorId' in current and 'productId' in current:
            devices.append(current)

    for line in text.splitlines():
        node = re.match(r'^\s*\+-o (.*?)\s+<class IOUSBHostDevice\b', line)
        if node:
            append_current()
            current = {'name': node.group(1).rsplit('@', 1)[0]}
            continue
        if current is None:
            continue
        field = re.match(r'^\s*"(idVendor|idProduct|USB Product Name)"\s*=\s*(.*?)\s*$', line)
        if not field:
            continue
        name, value = field.groups()
        if name == 'USB Product Name':
            try:
                parsed = json.loads(value)
                if isinstance(parsed, str):
                    current['name'] = parsed
            except (ValueError, TypeError):
                pass
        elif re.fullmatch(r'(0x[0-9a-fA-F]+|[0-9]+)', value):
            number = int(value, 16 if value.startswith('0x') else 10)
            if 0 <= number <= 65535:
                current['vendorId' if name == 'idVendor' else 'productId'] = f'{number:04x}'
    append_current()
    return devices


def read_usb_inventory():
    # -d 1 excludes interface children and large descriptor data. Archive
    # output (-a) fails with "can't open file" in the current host.
    completed = subprocess.run(
        ['/usr/sbin/ioreg', '-r', '-c', 'IOUSBHostDevice', '-l', '-w', '0', '-d', '1'],
        capture_output=True, text=True, timeout=4, check=False,
    )
    if completed.returncode:
        detail = completed.stderr.strip().splitlines()
        raise RuntimeError(detail[0][:200] if detail else f'ioreg exit {completed.returncode}')
    devices = parse_ioreg_usb(completed.stdout)
    if completed.stdout.strip() and not devices:
        raise RuntimeError('ioreg 返回了设备数据，但未找到有效 VID/PID 字段')
    return devices
