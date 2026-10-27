"""Run with: python3 test_presets.py. Uses only temporary preset files."""
import copy
import json
import tempfile
from pathlib import Path
from preset_store import save_store, read_store, Conflict, read_mapping, save_mapping

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
    # Version 3 adds saved cloud looks; a look needs a cloud form and finite numbers.
    looks = copy.deepcopy(value)
    looks.update(version=3, clouds=[{'id': 'c1', 'name': 'Wisps', 'look': {'cloudForm': 'broken', 'cloudWarp': 2}}])
    path.unlink()
    revision3 = save_store(directory, looks, 'empty')
    assert read_store(directory) == (looks, revision3)
    for look in ({'cloudWarp': 2}, {'cloudForm': 'broken', 'cloudWarp': float('nan')}, None):
        broken = copy.deepcopy(looks)
        broken['clouds'][0]['look'] = look
        try:
            save_store(directory, broken, revision3)
            assert False, 'Invalid cloud looks must be refused'
        except ValueError:
            pass
    assert read_store(directory) == (looks, revision3)
# Projection mapping lives in its own file beside the presets: off until saved, previous copy kept, bad corners refused.
with tempfile.TemporaryDirectory() as directory:
    assert read_mapping(directory) == {'version': 1, 'corners': None}
    corners = [[0.1, 0.05], [0.92, 0.12], [0.85, 0.9], [0.05, 0.8]]
    save_mapping(directory, {'version': 1, 'corners': corners})
    assert read_mapping(directory) == {'version': 1, 'corners': corners}
    save_mapping(directory, {'version': 1, 'corners': None})
    assert read_mapping(directory)['corners'] is None
    assert json.loads((Path(directory) / 'mapping.previous.json').read_text())['corners'] == corners
    for bad in ({'version': 2, 'corners': None}, {'version': 1, 'corners': corners[:3]}, {'version': 1, 'corners': [[0, 0], [1, 0], [1, 1], [0, 9]]}, {'version': 1, 'corners': [[0, 0], [1, 0], [1, True], [0, 1]]}, None):
        try:
            save_mapping(directory, bad)
            assert False, 'Invalid mapping must be refused'
        except ValueError:
            pass
    assert read_mapping(directory)['corners'] is None
print('PASS: atomic local persistence, previous backup, restart reads, stale-write conflicts, malformed/future schema protection, projection mapping file.')
