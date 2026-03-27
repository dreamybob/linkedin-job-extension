from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from config import settings


SCHEMA_PATH = Path(__file__).resolve().parent / "db" / "schema.sql"


def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {column[0]: row[idx] for idx, column in enumerate(cursor.description)}


def _ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {
        row[1]
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON;")
        connection.executescript(SCHEMA_PATH.read_text())
        _ensure_column(connection, "posts", "error_message", "TEXT")
        _ensure_column(connection, "posts", "is_important", "INTEGER DEFAULT 0")
        _ensure_column(connection, "posts", "is_irrelevant", "INTEGER DEFAULT 0")
        _ensure_column(connection, "analysis", "company_linkedin_url", "TEXT")
        _ensure_column(connection, "analysis", "required_pm_experience", "TEXT")
        _ensure_column(connection, "analysis", "immediate_joiner_preferred", "INTEGER DEFAULT 0")
        _ensure_column(connection, "analysis", "application_method", "TEXT")
        _ensure_column(connection, "analysis", "apply_url", "TEXT")
        _ensure_column(connection, "analysis", "mandatory_qualification_missing", "INTEGER DEFAULT 0")
        _ensure_column(connection, "analysis", "mandatory_qualification_reasons", "TEXT")
        _ensure_column(connection, "analysis", "mandatory_qualification_details", "TEXT")
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
