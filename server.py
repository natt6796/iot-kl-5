#!/usr/bin/env python3
"""FastAPI backend for the rice-field dashboard and Arduino telemetry."""

import argparse
import json
import math
import socket
import sqlite3
import threading
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Annotated, Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StrictFloat, StrictInt, model_validator


ROOT = Path(__file__).resolve().parent
DATABASE_PATH = ROOT / "telemetry.sqlite3"
MAX_BODY_BYTES = 4096
MAX_HISTORY_ITEMS = 5000


@contextmanager
def database_connection(database_path: Path):
    connection = sqlite3.connect(database_path)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def validate_reading(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")

    moisture = payload.get("moisture")
    if not isinstance(moisture, list) or len(moisture) != 4:
        raise ValueError("moisture must contain exactly four values")

    def numeric_value(value: Any, name: str) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{name} must be a number")
        converted = float(value)
        if not math.isfinite(converted):
            raise ValueError(f"{name} must be a finite number")
        return converted

    moisture_values = [numeric_value(value, "moisture") for value in moisture]
    if any(value < 0 or value > 100 for value in moisture_values):
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

    return {"moisture": moisture_values, "ph": ph, **nutrients}


SensorNumber = StrictInt | StrictFloat


class TelemetryPayload(BaseModel):
    moisture: list[SensorNumber] = Field(min_length=4, max_length=4)
    ph: SensorNumber
    n: SensorNumber
    p: SensorNumber
    k: SensorNumber

    @model_validator(mode="after")
    def validate_ranges(self) -> "TelemetryPayload":
        try:
            validate_reading(self.model_dump())
        except ValueError as error:
            raise ValueError(str(error)) from error
        return self

    def normalized(self) -> dict[str, Any]:
        return validate_reading(self.model_dump())


def create_app(database_path: Path = DATABASE_PATH) -> FastAPI:
    database_path = Path(database_path).resolve()
    lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database_path.parent.mkdir(parents=True, exist_ok=True)
        with database_connection(database_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    received_at INTEGER NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            latest = connection.execute(
                "SELECT received_at, payload FROM readings ORDER BY id DESC LIMIT 1"
            ).fetchone()
        app.state.latest_reading = (
            {"reading": json.loads(latest[1]), "receivedAt": latest[0]}
            if latest
            else None
        )
        yield

    app = FastAPI(
        title="Rice Field IoT API",
        description="รับ ตรวจสอบ และจัดเก็บข้อมูลเซ็นเซอร์ Arduino ลง SQLite",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5500",
            "http://127.0.0.1:5500",
        ],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.state.latest_reading = None

    @app.middleware("http")
    async def limit_request_body(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                body_length = int(content_length)
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "invalid Content-Length"})
            if body_length < 0 or body_length > MAX_BODY_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "request body must be between 0 and 4096 bytes"},
                )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/latest")
    def get_latest():
        with lock:
            return app.state.latest_reading or {"reading": None, "receivedAt": None}

    @app.get("/api/history")
    def get_history(limit: Annotated[int, Query(ge=1, le=MAX_HISTORY_ITEMS)] = 500):
        try:
            with lock, database_connection(database_path) as connection:
                rows = connection.execute(
                    "SELECT received_at, payload FROM readings ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
        except sqlite3.Error as error:
            raise HTTPException(status_code=500, detail=f"could not read telemetry history: {error}") from error
        return {
            "items": [
                {"receivedAt": received_at, "reading": json.loads(payload)}
                for received_at, payload in reversed(rows)
            ]
        }

    @app.post("/api/telemetry")
    def receive_telemetry(payload: TelemetryPayload):
        reading = payload.normalized()
        received_at = int(time.time() * 1000)
        try:
            with lock, database_connection(database_path) as connection:
                connection.execute(
                    "INSERT INTO readings (received_at, payload) VALUES (?, ?)",
                    (received_at, json.dumps(reading, separators=(",", ":"))),
                )
        except sqlite3.Error as error:
            raise HTTPException(status_code=500, detail=f"could not save telemetry: {error}") from error
        app.state.latest_reading = {"reading": reading, "receivedAt": received_at}
        return {"ok": True, "receivedAt": received_at}

    @app.get("/", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    def get_dashboard():
        return FileResponse(ROOT / "index.html")

    @app.get("/app.js", include_in_schema=False)
    def get_app_script():
        return FileResponse(ROOT / "app.js", media_type="text/javascript")

    @app.get("/styles.css", include_in_schema=False)
    def get_stylesheet():
        return FileResponse(ROOT / "styles.css", media_type="text/css")

    app.mount("/images", StaticFiles(directory=ROOT / "images"), name="images")
    app.mount("/models", StaticFiles(directory=ROOT / "models"), name="models")
    return app


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
    parser = argparse.ArgumentParser(description="Rice-field FastAPI dashboard and telemetry backend")
    parser.add_argument("--host", default="0.0.0.0", help="interface to listen on")
    parser.add_argument("--port", type=int, default=8000, help="HTTP port")
    parser.add_argument("--database", type=Path, default=DATABASE_PATH, help="SQLite telemetry database path")
    args = parser.parse_args()

    print(f"Dashboard: http://localhost:{args.port}")
    print(f"FastAPI docs: http://localhost:{args.port}/docs")
    for address in local_addresses():
        print(f"Wi-Fi dashboard: http://{address}:{args.port}")
        print(f"Arduino endpoint: http://{address}:{args.port}/api/telemetry")
    print(f"Telemetry history is saved in {args.database.resolve()}")
    print("Keep this window open while the dashboard or Arduino is using Wi-Fi.")

    uvicorn.run(create_app(args.database), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
