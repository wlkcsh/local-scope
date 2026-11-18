"""
Database connection, sessionmaker, and SQLite WAL mode configuration per SPEC §2.1 and Phase 2.
"""

from typing import Generator
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

from app.config import settings
from app.models import Base

# Engine and session factory globals
engine = None
_session_factory = None


def SessionLocal(*args, **kwargs):
    """Session factory wrapper that delegates to the active _session_factory."""
    if _session_factory is None:
        configure_db()
    return _session_factory(*args, **kwargs)


def configure_db(url: str | None = None) -> None:
    """Configures or re-configures the SQLAlchemy engine and _session_factory."""
    global engine, _session_factory

    db_url = url or settings.resolved_database_url
    if db_url.startswith("sqlite:///"):
        db_file_path = db_url.replace("sqlite:///", "")
        Path(db_file_path).parent.mkdir(parents=True, exist_ok=True)

    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(
        db_url,
        connect_args=connect_args,
        future=True,
    )

    if db_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=30000;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

    _session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )


# Initialize default database connection
configure_db()


def init_db() -> None:
    """Create all database tables on application startup."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
