"""Datatable router package — all endpoints require auth + project permissions."""
from fastapi import APIRouter

from app.routers.datatable.tables import router as tables_router
from app.routers.datatable.columns import router as columns_router
from app.routers.datatable.rows import router as rows_router
from app.routers.datatable.relations import router as relations_router
from app.routers.datatable.select_options import router as select_options_router
from app.routers.datatable.formulas import router as formulas_router
from app.routers.datatable.rollups import router as rollups_router
from app.routers.datatable.lookups import router as lookups_router
from app.routers.datatable.filters import router as filters_router
from app.routers.datatable.sorts import router as sorts_router
from app.routers.datatable.visibility import router as visibility_router
from app.routers.datatable.imports import router as imports_router

router = APIRouter()

router.include_router(tables_router, prefix="/tables", tags=["datatable-tables"])
router.include_router(columns_router, prefix="/columns", tags=["datatable-columns"])
router.include_router(rows_router, prefix="/rows", tags=["datatable-rows"])
router.include_router(relations_router, prefix="/relations", tags=["datatable-relations"])
router.include_router(select_options_router, prefix="/select-options", tags=["datatable-select-options"])
router.include_router(formulas_router, prefix="/formulas", tags=["datatable-formulas"])
router.include_router(rollups_router, prefix="/rollups", tags=["datatable-rollups"])
router.include_router(lookups_router, prefix="/lookups", tags=["datatable-lookups"])
router.include_router(filters_router, prefix="/filters", tags=["datatable-filters"])
router.include_router(sorts_router, prefix="/sorts", tags=["datatable-sorts"])
router.include_router(visibility_router, prefix="/visibility", tags=["datatable-visibility"])
router.include_router(imports_router, prefix="/imports", tags=["datatable-imports"])
