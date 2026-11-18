#!/usr/bin/env python3
"""Bubbles local server (Python standard library only).

Run from this folder:   python3 serve.py        then open http://localhost:8000/?p=<name>
Each tracker is one file: projects/<name>.json

Safety:
- Saves are atomic (temp file + rename).
- The previous file is copied to projects/.backups/<name>/ before every save (last 200 kept).
- A save based on an outdated version is refused (HTTP 409); the refused copy is
  still kept as projects/.backups/<name>/rejected-<time>.json.
"""
import hashlib, json, os, re, sys, tempfile, time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS = os.path.join(ROOT, "projects")
BACKUPS = os.path.join(PROJECTS, ".backups")
KEEP = 200
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$")
lock = Lock()


def path_of(name):
    if not name or not NAME_RE.match(name) or ".." in name:
        return None
    return os.path.join(PROJECTS, name + ".json")


def version_of(raw):
    return hashlib.sha256(raw).hexdigest()[:16]


def stamp():
    return datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def write_atomic(path, raw):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def backup(name, raw, prefix=""):
    d = os.path.join(BACKUPS, name)
    os.makedirs(d, exist_ok=True)
    write_atomic(os.path.join(d, f"{prefix}{stamp()}.json"), raw)
    olds = sorted(f for f in os.listdir(d) if f[0].isdigit())   # rotate plain backups only
    for f in olds[:-KEEP]:
        try:
            os.unlink(os.path.join(d, f))
        except OSError:
            pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if "/api/version" not in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def send_json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/projects":
            names = sorted(f[:-5] for f in os.listdir(PROJECTS)
                           if f.endswith(".json") and not f.startswith("."))
            return self.send_json(200, {"projects": names})
        if u.path in ("/api/project", "/api/version"):
            name = (q.get("p") or [""])[0]
            p = path_of(name)
            if not p or not os.path.exists(p):
                return self.send_json(404, {"error": f"no project '{name}'"})
            with open(p, "rb") as f:
                raw = f.read()
            if u.path == "/api/version":
                return self.send_json(200, {"version": version_of(raw)})
            try:
                data = json.loads(raw)
            except ValueError as e:
                return self.send_json(500, {"error": f"projects/{name}.json is not valid JSON: {e}"})
            return self.send_json(200, {"data": data, "version": version_of(raw)})
        if u.path.startswith("/projects/"):             # data goes through the API only
            return self.send_json(404, {"error": "not found"})
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/api/save":
            return self.send_json(404, {"error": "not found"})
        name = (parse_qs(u.query).get("p") or [""])[0]
        p = path_of(name)
        if not p or not os.path.exists(p):
            return self.send_json(404, {"error": f"no project '{name}'"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            data = body["data"]
            if not isinstance(data, dict):
                raise ValueError("data must be an object")
        except Exception as e:
            return self.send_json(400, {"error": f"bad request: {e}"})
        new = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()
        with lock:
            with open(p, "rb") as f:
                cur = f.read()
            if body.get("version") != version_of(cur):
                backup(name, new, prefix="rejected-")
                return self.send_json(409, {"error": "changed elsewhere", "version": version_of(cur)})
            backup(name, cur)
            write_atomic(p, new)
        return self.send_json(200, {"version": version_of(new)})


if __name__ == "__main__":
    os.makedirs(PROJECTS, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    names = sorted(f[:-5] for f in os.listdir(PROJECTS) if f.endswith(".json") and not f.startswith("."))
    print(f"Bubbles running: http://localhost:{PORT}/" + (f"?p={names[0]}" if names else ""))
    print("Stop with Ctrl+C.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
