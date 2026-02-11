from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager

from app.routers import auth,formula, text_container, user, project, table, column, field, relation, select_options, lookup_columns, document, ecommerce_setup, rollup, filter,sort, column_visibility, process_recording, dashboard, imports, folder

from app.database import Base, engine, AsyncSessionLocal
from app.core.config import settings

# NEW: Import test seed router - check environment at module level
import os
IS_TEST_MODE = os.getenv("ENVIRONMENT") == "test" or os.getenv("TEST_MODE") == "true"

if IS_TEST_MODE:
    print("🧪 Test mode detected - loading test_seed router")
    from app.routers import test_seed


app = FastAPI(title="SnapRow")

# Versioned API router
api_router = APIRouter(prefix=settings.API_V1_STR)


app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    # Wildcard + credentials do not work.
    # Reflect any http/https origin – change to a stricter regex or an explicit list in production.
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,  # ← enable cookies
)


# Register all feature routers under the versioned router
api_router.include_router(user.router,    prefix="/users",    tags=["users"])
api_router.include_router(project.router, prefix="/projects", tags=["projects"])
api_router.include_router(table.router,   prefix="/tables",   tags=["tables"])
api_router.include_router(column.router,  prefix="/columns",  tags=["columns"])
api_router.include_router(field.router,   prefix="/fields",   tags=["fields"])
api_router.include_router(relation.router, prefix="/relations",   tags=["relations"])
api_router.include_router(select_options.router,   prefix="/select_options",   tags=["select_options"])
api_router.include_router(lookup_columns.router,   prefix="/lookup",   tags=["lookup_columns"])
api_router.include_router(document.router, prefix="/documents", tags=["documents"])
api_router.include_router(text_container.router, prefix="/text_container", tags=["text_container"])
api_router.include_router(formula.router, prefix="/formula", tags=["formulas"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(rollup.router, prefix="/rollup", tags=["rollup"])
api_router.include_router(filter.router, prefix="/filters", tags=["filters"])
api_router.include_router(sort.router, prefix="/sorts", tags=["sorts"])
api_router.include_router(column_visibility.router, prefix="/column_visibility", tags=["column_visibility"])
api_router.include_router(ecommerce_setup.router, prefix="/ecommerce_setup", tags=["ecommerce_setup"])
api_router.include_router(process_recording.router, prefix="/process-recording", tags=["process_recording"])
api_router.include_router(dashboard.router, prefix="/dashboards", tags=["dashboards"])  
api_router.include_router(imports.router, prefix="/imports", tags=["imports"])
api_router.include_router(folder.router, prefix="/folders", tags=["folders"])


# Mount the versioned router on the main app
app.include_router(api_router)

# NEW: Add test seed routes in test environment
if IS_TEST_MODE:
    app.include_router(test_seed.router, prefix="/test", tags=["test"])
    print("🧪 Test routes registered at /test/*")

@app.get("/health")
async def health_check():
    """Health check endpoint for Docker health checks"""
    return {"status": "healthy", "test_mode": IS_TEST_MODE}

