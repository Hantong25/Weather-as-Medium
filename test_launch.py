"""Launcher checks without opening browsers or binding ports."""
import contextlib
import errno
import io
import json
from unittest.mock import patch, MagicMock
import launch

identity = {'app': 'ephemeral', 'root': str(launch.ROOT), 'apiVersion': 2, 'release': launch.RELEASE, 'dataDir': str(launch.DEFAULT_DATA_DIR.resolve())}
outputs = []
for tick in (100, 200):
    result = io.StringIO()
    with patch('sys.argv', ['launch.py', '--no-browser']), patch.object(launch.time, 'time_ns', return_value=tick), patch.object(launch.http.server, 'ThreadingHTTPServer', side_effect=OSError(errno.EADDRINUSE, 'occupied')), patch.object(launch.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(identity).encode())), contextlib.redirect_stdout(result):
        launch.main()
    outputs.append(result.getvalue())
assert outputs[0] != outputs[1]
assert all(f'?release={launch.RELEASE}&view=scene&launch=' in output for output in outputs)
old = {k: v for k, v in identity.items() if k != 'release'}
server = MagicMock(server_port=9876)
with patch('sys.argv', ['launch.py', '--no-browser']), patch.object(launch.http.server, 'ThreadingHTTPServer', side_effect=[OSError(errno.EADDRINUSE, 'occupied'), server]) as constructor, patch.object(launch.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(old).encode())), contextlib.redirect_stdout(io.StringIO()):
    launch.main()
assert constructor.call_count == 2
assert server.serve_forever.call_count == 1
for name in ('index.html', 'en.html'):
    html = (launch.ROOT / name).read_text()
    assert f'CONCEPT 3D · {launch.RELEASE}' in html
    assert f'sketch.js?v={launch.RELEASE}' in html
handler = object.__new__(launch.Handler)
handler.path = '/index.html'; handler.request_version = 'HTTP/1.1'; handler.wfile = io.BytesIO()
handler.end_headers()
assert b'Cache-Control: no-store' in handler.wfile.getvalue()
print('PASS: fresh launch URLs, 3D entry, old-server isolation, visible release ID and uncached application responses.')
