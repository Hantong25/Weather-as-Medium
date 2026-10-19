"""Run with: python3 test_presets.py. Uses only temporary preset files."""
import copy
import json
import tempfile
from pathlib import Path
from preset_store import save_store, read_store, Conflict

value = {'version': 2, 'scenes': [], 'colours': [{'id': 'blue', 'name': 'Blue', 'colors': ['#668899'] * 6}], 'defaultId': None}
with tempfile.TemporaryDirectory() as directory:
    assert read_store(directory) == (None, 'empty')
    revision = save_store(directory, value, 'empty')
    loaded, found = read_store(directory)
    assert loaded == value and found == revision
    try:
        save_store(directory, value, 'empty')
        assert False, 'Stale write must fail'
    except Conflict:
        pass
    newer = copy.deepcopy(value)
    newer['colours'][0]['name'] = 'Rain'
    revision2 = save_store(directory, newer, revision)
    assert revision2 != revision
    assert json.loads((Path(directory) / 'presets.previous.json').read_text()) == value
    # A fresh server / app version reads the same independent file.
    assert read_store(Path(directory))[0] == newer
    path = Path(directory) / 'presets.json'
    for raw in ('{broken', '{"version":999}', '{"version":2,"scenes":[],"colours":[],"defaultId":NaN}'):
        path.write_text(raw)
        try:
            save_store(directory, value, revision2)
            assert False, 'Corrupt / future files must not be overwritten'
        except ValueError:
            pass
        assert path.read_text() == raw
    bad = copy.deepcopy(value)
    bad['scenes'] = [{'id': 'x', 'name': 'Invalid', 'data': {}}]
    try:
        save_store(directory, bad, 'empty')
        assert False
    except ValueError:
        pass
print('PASS: atomic local persistence, previous backup, restart reads, stale-write conflicts, malformed/future schema protection.')
