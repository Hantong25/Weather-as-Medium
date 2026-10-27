#!/usr/bin/env python3
"""Start a loopback-only demo server and open it. Standard library only."""
import argparse
import errno
import functools
import http.server
import json
from pathlib import Path
import threading
import time
import urllib.request
import webbrowser
from urllib.parse import urlsplit
from preset_store import DEFAULT_DATA_DIR, MAX_BYTES, Conflict, read_store, save_store, read_mapping, save_mapping

ROOT = Path(__file__).resolve().parent
RELEASE = "2026.10.27.1"

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if Path(urlsplit(self.path).path).suffix in ('.html', '.js', '.mjs', '.css') or urlsplit(self.path).path == '/':
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def api_allowed(self):
        host = self.headers.get('Host', '')
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        origin = self.headers.get('Origin')
        return host in allowed and (origin is None or origin == 'http://' + host) and self.headers.get('Sec-Fetch-Site', 'same-origin') not in ('cross-site',)

    def send_json(self, status, value):
        raw = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ('/api/presets', '/api/mapping'):
            self.send_error(404)
            return
        if not self.api_allowed() or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.send_json(403, {'error': 'Same-origin JSON requests only'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > MAX_BYTES:
                self.send_json(413, {'error': 'Invalid request size'})
                return
            value = json.loads(self.rfile.read(size), parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Invalid number')))
            if path == '/api/mapping':
                save_mapping(self.server.data_dir, value)
                self.send_json(200, {'saved': True})
                return
            revision = save_store(self.server.data_dir, value, self.headers.get('If-Match'))
            self.send_json(200, {'revision': revision})
        except Conflict as error:
            self.send_json(409, {'error': str(error)})
        except (ValueError, OSError) as error:
            self.send_json(422, {'error': str(error)})

    def do_GET(self):
        if urlsplit(self.path).path == '/api/mapping':
            if not self.api_allowed():
                self.send_json(403, {'error': 'Local requests only'})
                return
            try:
                self.send_json(200, {'mapping': read_mapping(self.server.data_dir)})
            except (ValueError, OSError) as error:
                self.send_json(422, {'error': str(error)})
            return
        if urlsplit(self.path).path == '/api/presets':
            if not self.api_allowed():
                self.send_json(403, {'error': 'Local requests only'})
                return
            try:
                value, revision = read_store(self.server.data_dir)
                self.send_json(200, {'store': value, 'revision': revision, 'path': str(self.server.data_dir / 'presets.json')})
            except (ValueError, OSError) as error:
                self.send_json(422, {'error': str(error)})
            return
        if self.path == '/__ephemeral_app__':
            data = json.dumps({'app': 'ephemeral', 'root': str(ROOT), 'apiVersion': 2, 'release': RELEASE, 'dataDir': str(self.server.data_dir)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        if args and str(args[1]) not in ('200', '304'):
            super().log_message(fmt, *args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lang', choices=('zh', 'en'), default='zh')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--data-dir', type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('Port must be between 0 and 65535.')
    entry = ('en.html' if args.lang == 'en' else 'index.html') + f'?release={RELEASE}&view=scene&launch={time.time_ns()}'
    handler = functools.partial(Handler, directory=str(ROOT))
    try:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise
        # Reuse only this folder's launcher, never an unrelated server on the same port.
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{args.port}/__ephemeral_app__', timeout=1) as response:
                identity = json.load(response)
            if identity == {'app': 'ephemeral', 'root': str(ROOT), 'apiVersion': 2, 'release': RELEASE, 'dataDir': str(args.data_dir.expanduser().resolve())}:
                url = f'http://127.0.0.1:{args.port}/{entry}'
                print(f'Already running: {url}', flush=True)
                if not args.no_browser:
                    webbrowser.open(url)
                return
        except (OSError, ValueError):
            pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    server.data_dir = args.data_dir.expanduser().resolve()
    url = f'http://127.0.0.1:{server.server_port}/{entry}'
    print(f'Accumulus is running: {url}\nKeep this window open. Press Control-C to stop.', flush=True)
    if not args.no_browser:
        threading.Timer(.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nDemo stopped.', flush=True)
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
