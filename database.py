from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import os
from uuid import UUID

from dotenv import load_dotenv
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

load_dotenv(".env")
load_dotenv(".env.local")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from .env or .env.local")

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    poolclass=NullPool,
    connect_args={"statement_cache_size": 0},
)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


@asynccontextmanager
async def user_scoped_session(user_id: UUID, claims: dict) -> AsyncGenerator[AsyncSession, None]:
    """Transaction bound to one authenticated user.

    The pooler connection role bypasses RLS, so every request must switch to
    `authenticated` and bind the JWT subject with transaction-local settings.
    Commit on success, rollback on any exception, connection always closed.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # No-op on fresh NullPool connections; required when the session
            # factory is bound to a reused connection (savepoint test harness).
            await session.execute(text("RESET ROLE"))
            row = (await session.execute(
                text("SELECT banned_until, deleted_at FROM auth.users WHERE id = CAST(:user_id AS uuid)"),
                {"user_id": str(user_id)},
            )).mappings().first()
            if row is None or row["deleted_at"] is not None:
                raise HTTPException(status_code=401, detail="User no longer exists",
                                    headers={"WWW-Authenticate": "Bearer"})
            if row["banned_until"] is not None and row["banned_until"] > datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="User is suspended",
                                    headers={"WWW-Authenticate": "Bearer"})
            await session.execute(
                text("SELECT set_config('request.jwt.claim.sub', :sub, true)"),
                {"sub": str(user_id)},
            )
            await session.execute(
                text("SELECT set_config('request.jwt.claims', :claims, true)"),
                {"claims": json.dumps(claims)},
            )
            await session.execute(text("SET LOCAL ROLE authenticated"))
            yield session
