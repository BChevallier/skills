#!/usr/bin/env python3
"""Local server for Bubbles trackers. Python standard library only.

    python3 serve.py [--port 8000]

Serves index.html, bubbles.css and bubbles.js from this folder, and one tracker per
file in projects/<name>.json. Open http://localhost:8000/?p=<name>.

API used by bubbles.js:
  GET  /api/projects            -> {"projects": [names]}
  GET  /api/project?p=<name>    -> {"data": {...}, "version": "<hash>"}
  GET  /api/version?p=<name>    -> {"version": "<hash>"}
  POST /api/save?p=<name>       body {"version", "data"} -> 200 {"version"} | 409 if the file changed meanwhile

Data safety:
  - every save is written to a temp file, then renamed over the original (atomic);
  - the previous file is copied to projects/.backups/<name>/ first (newest 200 kept);
  - a save based on an outdated version is refused (409) and kept as rejected-<time>.json.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS = os.path.join(ROOT, "projects")
KEEP_BACKUPS = 200
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,80}$")
LOCK = threading.Lock()  # one save at a time, so the version check and the write cannot interleave
STATIC = {"/": "index.html", "/index.html": "index.html", "/bubbles.css": "bubbles.css", "/bubbles.js": "bubbles.js"}


def path_for(name):
    if not name or not NAME_RE.match(name) or name.startswith("."):
        raise ValueError("bad project name")
    return os.path.join(PROJECTS, name + ".json")


def version_of(raw):
    return hashlib.sha256(raw).hexdigest()[:16]


def stamp():
    return time.strftime("%Y%m%d-%H%M%S") + "-%03d" % (int(time.time() * 1000) % 1000)


def backup_dir(name):
    d = os.path.join(PROJECTS, ".backups", name)
    os.makedirs(d, exist_ok=True)
    return d


def prune(d):
    files = sorted(f for f in os.listdir(d) if f.startswith("save-"))
    for f in files[:-KEEP_BACKUPS]:
        os.remove(os.path.join(d, f))


def atomic_write(path, raw):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send_json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def project(self):
        return path_for(parse_qs(urlparse(self.path).query).get("p", [""])[0])

    def do_GET(self):
        url = urlparse(self.path)
        try:
            if url.path == "/api/projects":
                os.makedirs(PROJECTS, exist_ok=True)
                names = sorted(f[:-5] for f in os.listdir(PROJECTS) if f.endswith(".json") and not f.startswith("."))
                return self.send_json(200, {"projects": names})
            if url.path in ("/api/project", "/api/version"):
                p = self.project()
                if not os.path.exists(p):
                    return self.send_json(404, {"error": "no such project"})
                with open(p, "rb") as f:
                    raw = f.read()
                if url.path == "/api/version":
                    return self.send_json(200, {"version": version_of(raw)})
                return self.send_json(200, {"data": json.loads(raw), "version": version_of(raw)})
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        if url.path in STATIC:
            self.path = "/" + STATIC[url.path]
            return super().do_GET()
        self.send_error(404)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/save":
            return self.send_error(404)
        try:
            p = self.project()
            name = os.path.basename(p)[:-5]
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            data, base = body["data"], body.get("version")
            if not isinstance(data, dict):
                raise ValueError("data must be an object")
        except (ValueError, KeyError) as e:
            return self.send_json(400, {"error": str(e)})
        raw = (json.dumps(data, ensure_ascii=False, indent=1) + "\n").encode()
        with LOCK:
            return self.save(p, name, base, raw)

    def save(self, p, name, base, raw):
        d = backup_dir(name)
        current = None
        if os.path.exists(p):
            with open(p, "rb") as f:
                current = f.read()
        if current is not None and version_of(current) != base:
            atomic_write(os.path.join(d, "rejected-%s.json" % stamp()), raw)
            return self.send_json(409, {"error": "changed elsewhere", "version": version_of(current)})
        if current is not None:
            shutil.copyfile(p, os.path.join(d, "save-%s.json" % stamp()))
            prune(d)
        atomic_write(p, raw)
        self.send_json(200, {"version": version_of(raw)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    port = ap.parse_args().port
    os.makedirs(PROJECTS, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Bubbles on http://localhost:%d/  (projects in %s)" % (port, PROJECTS))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
