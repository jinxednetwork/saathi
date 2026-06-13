#!/usr/bin/env python3
"""
transcribe-server.py — Saathi's optional, on-device voice transcription helper.

A tiny standard-library HTTP server that runs LOCAL OpenAI Whisper. The browser
records a short clip and POSTs the raw audio bytes to /transcribe; we run Whisper
on this machine and return the text. The audio never leaves the device — the
same privacy promise as the local Ollama used for chat.

This is OPTIONAL. If it isn't running, Saathi simply hides the mic button and
everything else keeps working (you just type). No third-party services, no API
keys, no cloud.

Run:
    python3 transcribe-server.py              # default model "base"
    WHISPER_MODEL=small python3 transcribe-server.py
Requires: openai-whisper (`pip install openai-whisper`) and ffmpeg.
"""

import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("WHISPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("WHISPER_PORT", "5005"))
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")

# Only allow the local dev origins the app is served from. Whisper is for local
# use only; we never accept cross-machine traffic.
ALLOWED_ORIGINS = {
    "http://localhost:8753",
    "http://127.0.0.1:8753",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB cap — a journal clip is far smaller

_model = None


def get_model():
    """Lazy-load the Whisper model once, on first transcription."""
    global _model
    if _model is None:
        import whisper  # imported lazily so /health works before the model loads
        print(f"[saathi] loading Whisper model '{MODEL_NAME}'…", flush=True)
        _model = whisper.load_model(MODEL_NAME)
        print("[saathi] model ready.", flush=True)
    return _model


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "model": MODEL_NAME})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/transcribe":
            return self._json(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return self._json(400, {"error": "empty body"})
        if length > MAX_BYTES:
            return self._json(413, {"error": "audio too large"})

        audio = self.rfile.read(length)
        suffix = ".webm"
        ctype = self.headers.get("Content-Type", "")
        if "ogg" in ctype:
            suffix = ".ogg"
        elif "mp4" in ctype or "m4a" in ctype:
            suffix = ".mp4"

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(audio)
                tmp_path = tmp.name
            result = get_model().transcribe(tmp_path, fp16=False)
            text = (result.get("text") or "").strip()
            self._json(200, {"text": text})
        except Exception as exc:  # noqa: BLE001 — surface a clean error to the client
            self._json(500, {"error": f"transcription failed: {exc}"})
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

    def log_message(self, *args):  # quieter console
        pass


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[saathi] voice transcription on http://{HOST}:{PORT} (model: {MODEL_NAME})", flush=True)
    print("[saathi] audio is transcribed locally and never leaves this device.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[saathi] shutting down.", flush=True)
        server.shutdown()


if __name__ == "__main__":
    sys.exit(main())
