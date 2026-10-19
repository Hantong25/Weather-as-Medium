"""Version-independent local JSON storage. No third-party runtime dependencies."""
from contextlib import contextmanager
from pathlib import Path
import hashlib
import json
import math
import os
import tempfile
import fcntl

MAX_BYTES = 8 * 1024 * 1024
DEFAULT_DATA_DIR = Path.home() / 'Documents' / 'Ephemeral User Data'

class Conflict(Exception):
    pass

def validate_store(value):
    if not isinstance(value, dict) or value.get('version') not in (1, 2):
        raise ValueError('Unsupported preset format; existing data was not changed')
    for key in ('scenes', 'colours'):
        items = value.get(key)
        if not isinstance(items, list) or len(items) > 100:
            raise ValueError('Invalid preset collection')
        ids = set()
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not 1 <= len(item['id']) <= 80 or item['id'] in ids:
                raise ValueError('Invalid or duplicate preset ID')
            ids.add(item['id'])
            if not isinstance(item.get('name'), str) or not 1 <= len(item['name'].strip()) <= 60:
                raise ValueError('Invalid preset name')
            if key == 'scenes':
                data = item.get('data')
                if not isinstance(data, dict) or any(not isinstance(data.get(k), dict) for k in ('settings', 'geometry', 'timing', 'navigation')):
                    raise ValueError('Missing scene parameters')
                geometry = data['geometry']
                objects = geometry.get('objects', [])
                if not isinstance(objects, list) or len(objects) > 96:
                    raise ValueError('Invalid building parts')
                object_ids = set()
                for part in objects:
                    if not isinstance(part, dict) or not isinstance(part.get('id'), str) or part['id'] in object_ids or part.get('type') not in ('rock', 'bench', 'boots', 'block', 'column', 'platform', 'canopy', 'pond'):
                        raise ValueError('Invalid building part')
                    object_ids.add(part['id'])
                    for key_name in ('x', 'y', 'z', 'width', 'height', 'depth', 'rx', 'ry', 'rz'):
                        number = part.get(key_name)
                        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or abs(number) > 1000:
                            raise ValueError('Invalid part transform')
                timing = data['timing']
                if any(not isinstance(timing.get(k), list) or len(timing[k]) != 4 or any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or n <= 0 or n > 300 for n in timing[k]) for k in ('stages', 'rates')):
                    raise ValueError('Invalid timing parameters')
            if key == 'colours':
                colors = item.get('colors')
                if not isinstance(colors, list) or len(colors) != 6 or any(not isinstance(c, str) or len(c) != 7 or c[0] != '#' or any(x not in '0123456789abcdefABCDEF' for x in c[1:]) for c in colors):
                    raise ValueError('Invalid colours')
    if value.get('defaultId') is not None and value['defaultId'] not in {p['id'] for p in value['scenes']}:
        raise ValueError('Missing startup preset')
    return value

def encode(value):
    validate_store(value)
    raw = (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
    if len(raw) > MAX_BYTES:
        raise ValueError('Preset collection is too large')
    return raw

def read_store(directory):
    path = Path(directory) / 'presets.json'
    if not path.exists():
        return None, 'empty'
    raw = path.read_bytes()
    if len(raw) > MAX_BYTES:
        raise ValueError('Existing preset file is too large; it was not changed')
    value = json.loads(raw, parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Invalid number')))
    validate_store(value)
    return value, hashlib.sha256(raw).hexdigest()

@contextmanager
def locked(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / '.presets.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)

def atomic_write(path, raw):
    fd, temporary = tempfile.mkstemp(prefix='.preset-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def save_store(directory, value, expected):
    raw = encode(value)
    directory = Path(directory)
    with locked(directory):
        _, revision = read_store(directory)
        if expected != revision:
            raise Conflict('Presets changed in another window. Reload before saving; no file was overwritten.')
        path = directory / 'presets.json'
        if path.exists():
            atomic_write(directory / 'presets.previous.json', path.read_bytes())
        atomic_write(path, raw)
    return hashlib.sha256(raw).hexdigest()
