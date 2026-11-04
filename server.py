#!/usr/bin/env python3
"""Serve the dashboard and receive sensor readings from boards on the local network."""

import argparse
import json
import math
import socket
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
MAX_BODY_BYTES = 4096
reading_lock = threading.Lock()
latest_reading = None


def validate_reading(payload):
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")

    moisture = payload.get("moisture")
    if not isinstance(moisture, list) or len(moisture) != 4:
        raise ValueError("moisture must contain exactly four values")

    def numeric_value(value, name):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{name} must be a number")
        converted = float(value)
        if not math.isfinite(converted):
            raise ValueError(f"{name} must be a finite number")
        return converted

    moisture = [numeric_value(value, "moisture") for value in moisture]
    if any(value < 0 or value > 100 for value in moisture):
        raise ValueError("moisture values must be between 0 and 100")

    ph = numeric_value(payload.get("ph"), "ph")
    nutrients = {
        key: numeric_value(payload.get(key), key)
        for key in ("n", "p", "k")
    }
    if not 0 <= ph <= 14:
        raise ValueError("ph must be between 0 and 14")
    if any(value < 0 or value > 100000 for value in nutrients.values()):
        raise ValueError("nutrient values must be between 0 and 100000")

    return {
        "moisture": moisture,
        "ph": ph,
        **nutrients,
    }


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == "/api/latest":
            with reading_lock:
                current = latest_reading
            self.send_json(200, current or {"reading": None, "receivedAt": None})
            return
        if urlsplit(self.path).path.startswith("/api/"):
            self.send_json(404, {"error": "API endpoint not found"})
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/telemetry":
            self.send_json(404, {"error": "API endpoint not found"})
            return

        content_length = self.headers.get("Content-Length")
        try:
            length = int(content_length) if content_length is not None else -1
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY_BYTES:
            self.send_json(413, {"error": "request body must be between 0 and 4096 bytes"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            validated = validate_reading(payload)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error)})
            return

        received_at = int(time.time() * 1000)
        with reading_lock:
            global latest_reading
            latest_reading = {"reading": validated, "receivedAt": received_at}
        self.send_json(200, {"ok": True, "receivedAt": received_at})


def local_addresses():
    addresses = set()
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        route_address = probe.getsockname()[0]
        if not route_address.startswith("127."):
            addresses.add(route_address)
    except OSError:
        pass
    finally:
        probe.close()

    try:
        for result in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = result[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


def main():
    parser = argparse.ArgumentParser(description="Rice-field dashboard and local Wi-Fi telemetry receiver")
    parser.add_argument("--host", default="0.0.0.0", help="interface to listen on (default: all network interfaces)")
    parser.add_argument("--port", type=int, default=8000, help="HTTP port (default: 8000)")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Dashboard: http://localhost:{args.port}")
    for address in local_addresses():
        print(f"Wi-Fi dashboard: http://{address}:{args.port}")
        print(f"Arduino endpoint: http://{address}:{args.port}/api/telemetry")
    print("Keep this window open while the dashboard or Arduino is using Wi-Fi.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping dashboard server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
