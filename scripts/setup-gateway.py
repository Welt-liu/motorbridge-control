"""Install pinned official macOS arm64 binaries inside this project only."""
import hashlib
import io
import json
import pathlib
import platform
import shutil
import sys
import tarfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent


def download(url, expected):
    print(f'Downloading {url}', flush=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    verify(data, expected)
    return data


def verify(data, expected):
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('SHA256 verification failed')


def main():
    if sys.platform != 'darwin' or platform.machine().lower() not in ('arm64', 'aarch64'):
        print('Auto-install is available on macOS arm64. On this platform set MOTORBRIDGE_WS_GATEWAY_BIN to the official ws_gateway binary and install its platform runtimes.')
        return
    wheel = json.loads((ROOT / 'vendor/motorbridge/SOURCE.json').read_text())
    with zipfile.ZipFile(io.BytesIO(download(wheel['url'], wheel['sha256']))) as archive:
        binary = ROOT / 'vendor/motorbridge/motorbridge/bin/ws_gateway'
        binary.parent.mkdir(parents=True, exist_ok=True)
        binary.write_bytes(archive.read('motorbridge/bin/ws_gateway'))
        binary.chmod(0o755)
    runtime = ROOT / 'vendor/runtime'
    manifest = json.loads((runtime / 'SOURCE.json').read_text())
    base = f"https://raw.githubusercontent.com/motorbridge/motorbridge/{manifest['sourceCommit']}/"
    pcbusb = manifest['archive']
    archive_data = download(base + pcbusb['source'], pcbusb['sha256'])
    # Retain the complete original distribution, copyright notices and EULA.
    (runtime / 'pcbusb.tar.gz').write_bytes(archive_data)
    with tarfile.open(fileobj=io.BytesIO(archive_data), mode='r:gz') as archive:
        for member in archive.getmembers():
            relative = pathlib.PurePosixPath(member.name)
            if member.isfile() and not relative.is_absolute() and '..' not in relative.parts:
                target = runtime / 'pcbusb' / pathlib.Path(*relative.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open('wb') as destination:
                    shutil.copyfileobj(source, destination)
    pcbusb_data = (runtime / 'pcbusb/PCBUSB/libPCBUSB.0.13.dylib').read_bytes()
    verify(pcbusb_data, manifest['files']['libPCBUSB.dylib']['sha256'])
    (runtime / 'libPCBUSB.dylib').write_bytes(pcbusb_data)
    dm = manifest['files']['libdm_device.dylib']
    (runtime / 'libdm_device.dylib').write_bytes(download(base + dm['source'], dm['sha256']))
    print('MotorBridge gateway and USB/CAN runtimes installed in vendor/. No system directories were modified.')


if __name__ == '__main__':
    main()
