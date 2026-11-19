import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Base
from routers.pos import router as pos_router
from routers.inventory import router as inventory_router
from routers.finance import router as finance_router
from routers.radar import router as radar_router
from routers.organizations import router as organizations_router
from routers.auth import router as auth_router
from routers.procurement import router as procurement_router
from routers.transfers import router as transfers_router
from routers.returns import router as returns_router

logger = logging.getLogger("kms.api")

app = FastAPI(
    title="Kenya Motorcycle Spare Parts & Supply Chain Ecosystem",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://localhost:3000"],  # Update this to the origin of your Vite frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pos_router)
app.include_router(inventory_router)
app.include_router(finance_router)
app.include_router(radar_router)
app.include_router(organizations_router)
app.include_router(auth_router)
app.include_router(procurement_router)
app.include_router(transfers_router)
app.include_router(returns_router)


_SQLSTATE_RESPONSES = {
    "42501": (403, "Forbidden"),
    "23505": (409, "Conflict: duplicate record"),
    "23503": (409, "Conflict: referenced record missing or invalid"),
    "23502": (422, "Required value missing"),
    "23514": (422, "Value violates a constraint"),
    "22023": (422, "Invalid parameter value"),
    "22P02": (400, "Invalid input syntax"),
}


@app.exception_handler(DBAPIError)
async def database_error_handler(request: Request, exc: DBAPIError):
    sqlstate = getattr(exc.orig, "sqlstate", None)
    status_code, detail = _SQLSTATE_RESPONSES.get(sqlstate, (500, "Internal database error"))
    if status_code >= 500:
        logger.error("database error sqlstate=%s path=%s", sqlstate, request.url.path)
    return JSONResponse(status_code=status_code, content={"detail": detail})


@app.get("/")
async def root():
    return {"message": "Welcome to the Kenya Motorcycle Spare Parts API"}


@app.get("/health/db")
async def database_health(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(text("SELECT NOW() AS server_time"))
        server_time = result.scalar_one()
        return {
            "status": "ok",
            "database": "connected",
            "server_time": server_time.isoformat(),
        }
    except Exception:
        logger.exception("database health check failed")
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )
