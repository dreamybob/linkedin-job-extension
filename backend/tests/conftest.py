from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    import config
    import database
    import main

    importlib.reload(config)
    importlib.reload(database)
    importlib.reload(main)

    database.init_db()
    return TestClient(main.app)
