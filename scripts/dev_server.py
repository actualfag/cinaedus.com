#!/usr/bin/env python3
"""Local dev server: serves the site and lets the editor save content.

    python3 scripts/dev_server.py [port]

Homepage: http://localhost:8000/   Editor: http://localhost:8000/dev/
"""
import http.server
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "inscription.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/__ping":
            return self.reply(200, {"ok": True})
        super().do_GET()

    def do_PUT(self):
        if self.path != "/__save":
            return self.reply(404, {"error": "not found"})
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.reply(415, {"error": "expected application/json"})
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            data = json.loads(raw)
            if not isinstance(data.get("rows"), list):
                raise ValueError("config needs a rows array")
        except (ValueError, AttributeError) as err:
            return self.reply(400, {"error": str(err)})
        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        fd, tmp = tempfile.mkstemp(dir=CONTENT.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, CONTENT)
        self.reply(200, {"ok": True, "path": str(CONTENT.relative_to(ROOT))})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Homepage http://localhost:{port}/   Editor http://localhost:{port}/dev/")
    server.serve_forever()
