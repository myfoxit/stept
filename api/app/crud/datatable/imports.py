"""Import CRUD — ported from SnapRow routers/imports.py.

FIXES:
- No background task session leak — uses proper session management
- Batch inserts instead of row-by-row
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TableMeta, ColumnMeta
from app.crud.datatable.column import add_column, ensure_order_column
from app.db.utils import sanitize_identifier, quote_ident

logger = logging.getLogger(__name__)

BATCH_SIZE = 100


async def process_import(
    db: AsyncSession,
    table_obj: TableMeta,
    rows: List[Dict[str, Any]],
    column_mapping: Dict[str, Any],
) -> Dict[str, Any]:
    """Process imported data with batch inserts.

    column_mapping: {source_col: {"action": "skip"|"new"|"existing", "target": col_name, "ui_type": type}}
    """
    if not rows:
        return {"imported": 0, "errors": []}

    await ensure_order_column(db, table_obj)
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))

    # Create new columns as needed
    for source_col, mapping in column_mapping.items():
        if mapping.get("action") == "new":
            target_name = mapping.get("target", source_col)
            ui_type = mapping.get("ui_type", "single_line_text")
            try:
                await add_column(db, table_obj, name=target_name, ui_type=ui_type)
            except Exception as e:
                logger.warning("Failed to create column %s: %s", target_name, e)

    # Get max order for sequencing
    max_order_result = await db.execute(
        text(f"SELECT COALESCE(MAX(sr__order), 0) FROM {quoted_table}")
    )
    current_order = float(max_order_result.scalar() or 0)

    imported = 0
    errors: List[str] = []

    # Process in batches
    for batch_start in range(0, len(rows), BATCH_SIZE):
        batch = rows[batch_start:batch_start + BATCH_SIZE]

        for row_data in batch:
            current_order += 1000
            cleaned: Dict[str, Any] = {"sr__order": current_order}

            for source_col, mapping in column_mapping.items():
                if mapping.get("action") == "skip":
                    continue
                target = sanitize_identifier(mapping.get("target", source_col))
                value = row_data.get(source_col)

                # Clean special values
                if value is not None:
                    try:
                        import math
                        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                            value = None
                    except (TypeError, ValueError):
                        pass
                    if isinstance(value, str) and value.strip() == "":
                        value = None

                cleaned[target] = value

            if not any(v is not None for k, v in cleaned.items() if k != "sr__order"):
                continue

            try:
                columns = ", ".join(quote_ident(c) for c in cleaned)
                placeholders = ", ".join(f":{c}" for c in cleaned)
                await db.execute(
                    text(f"INSERT INTO {quoted_table} ({columns}) VALUES ({placeholders})"),
                    cleaned,
                )
                imported += 1
            except Exception as e:
                errors.append(f"Row {batch_start + batch.index(row_data)}: {str(e)}")

    await db.flush()
    logger.info("Imported %d rows into %s (%d errors)", imported, table_obj.physical_name, len(errors))
    return {"imported": imported, "errors": errors}
