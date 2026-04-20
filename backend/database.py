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


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _column_names(connection: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()]


def _foreign_key_target(connection: sqlite3.Connection, table: str, from_column: str) -> str | None:
    for row in connection.execute(f"PRAGMA foreign_key_list({table})").fetchall():
        if row[3] == from_column:
            return row[2]
    return None


def _next_table_name(connection: sqlite3.Connection, base_name: str) -> str:
    candidate = base_name
    suffix = 1
    while _table_exists(connection, candidate):
        candidate = f"{base_name}_{suffix}"
        suffix += 1
    return candidate


def _repair_analysis_table(connection: sqlite3.Connection) -> None:
    if not _table_exists(connection, "analysis"):
        return

    if _foreign_key_target(connection, "analysis", "post_id") == "posts":
        return

    backup_table = _next_table_name(connection, "analysis_repair_backup")
    source_columns = _column_names(connection, "analysis")

    # Rebuild analysis from the canonical schema so new writes reference posts again.
    connection.commit()
    connection.execute("PRAGMA foreign_keys = OFF;")
    connection.execute(f"ALTER TABLE analysis RENAME TO {backup_table}")
    connection.executescript(SCHEMA_PATH.read_text())

    target_columns = _column_names(connection, "analysis")
    copy_columns = [column for column in target_columns if column in source_columns]
    if copy_columns:
        columns_sql = ", ".join(copy_columns)
        connection.execute(
            f"INSERT INTO analysis ({columns_sql}) SELECT {columns_sql} FROM {backup_table}"
        )

    connection.execute(f"DROP TABLE {backup_table}")
    connection.commit()
    connection.execute("PRAGMA foreign_keys = ON;")


def init_db() -> None:
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON;")
        connection.executescript(SCHEMA_PATH.read_text())
        _repair_analysis_table(connection)
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
