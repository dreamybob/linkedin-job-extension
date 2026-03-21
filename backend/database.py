from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from config import settings


SCHEMA_PATH = Path(__file__).resolve().parent / "db" / "schema.sql"


def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {column[0]: row[idx] for idx, column in enumerate(cursor.description)}


def init_db() -> None:
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON;")
        connection.executescript(SCHEMA_PATH.read_text())
        connection.commit()


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(settings.database_path, check_same_thread=False)
    connection.row_factory = dict_factory
    connection.execute("PRAGMA foreign_keys = ON;")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()

