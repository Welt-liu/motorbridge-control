"""Passive interface inventory: no CAN initialization or motor commands."""
import ctypes
import glob
import json
import os
import sys
from usb_inventory import read_usb_inventory

result = {"devices": [], "usb": [], "warnings": []}
for port in sorted(glob.glob('/dev/cu.*')):
    if 'usb' in port.lower() or 'wch' in port.lower() or 'slab' in port.lower():
        result['devices'].append({'id': port, 'name': port, 'transport': 'dm-serial', 'serial_port': port, 'verified': True})
try:
    result['usb'] = read_usb_inventory()
except Exception as error:
    result['warnings'].append(f'USB 信息读取失败：{type(error).__name__}: {str(error)[:200]}；可以手动填写接口')
try:
    lib = ctypes.CDLL(sys.argv[1])
    class Info(ctypes.Structure):
        _fields_ = [('handle', ctypes.c_uint16), ('device_type', ctypes.c_uint8), ('controller', ctypes.c_uint8), ('features', ctypes.c_uint32), ('name', ctypes.c_char * 33), ('device_id', ctypes.c_uint32), ('condition', ctypes.c_uint32)]
    get = lib.CAN_GetValue
    get.argtypes = [ctypes.c_uint16, ctypes.c_uint8, ctypes.c_void_p, ctypes.c_uint32]
    get.restype = ctypes.c_uint32
    count = ctypes.c_uint32()
    if get(0, 0x2a, ctypes.byref(count), ctypes.sizeof(count)) == 0 and count.value:
        entries = (Info * min(count.value, 64))()
        if get(0, 0x2b, entries, ctypes.sizeof(entries)) == 0:
            for info in entries:
                # MotorBridge maps can0 to PCAN_USBBUS1 (0x51).
                if 0x51 <= info.handle <= 0x58:
                    channel = f'can{info.handle - 0x51}@1000000'
                    result['devices'].append({'id': f'pcan:{info.handle}', 'name': f"{info.name.decode(errors='replace')} · {channel}", 'transport': 'socketcan', 'channel': channel, 'verified': True, 'occupied': bool(info.condition & 2)})
except Exception:
    result['warnings'].append('PEAK / PCBUSB 运行时不可用；检查适配器驱动')
try:
    lib = ctypes.CDLL(sys.argv[2])
    lib.dmcan_context_create.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
    lib.dmcan_context_create.restype = None
    lib.dmcan_context_destroy.argtypes = [ctypes.c_void_p]
    lib.dmcan_context_destroy.restype = None
    lib.dmcan_find_devices_with_type.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.dmcan_find_devices_with_type.restype = ctypes.c_int
    ctx = ctypes.c_void_p()
    # SDK diagnostics must not contaminate the JSON result.
    saved = os.dup(1)
    os.dup2(2, 1)
    try:
        lib.dmcan_context_create(ctypes.byref(ctx))
        if not ctx: raise RuntimeError('SDK context unavailable')
        for enum, name in enumerate(['usb2canfd', 'usb2canfd-dual', 'linkx4c']):
            count = lib.dmcan_find_devices_with_type(ctx, enum)
            if count > 0:
                result['devices'].append({'id': f'dm:{name}', 'name': f'达妙 {name.upper()} · {count} 台', 'transport': 'dm-device', 'dm_device_type': name, 'verified': True})
                if count > 1: result['warnings'].append(f'{name} 检测到多台；MotorBridge 当前使用同型号的首台设备')
    finally:
        if ctx: lib.dmcan_context_destroy(ctx)
        ctypes.CDLL(None).fflush(None)
        os.dup2(saved, 1)
        os.close(saved)
except Exception:
    result['warnings'].append('达妙 DM_Device 运行时不可用；检查适配器驱动')
print(json.dumps(result, ensure_ascii=False))
