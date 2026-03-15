# SnapRow Database Feature — Deep Code Audit

**Date:** 2026-03-15  
**Auditor:** Automated Architecture Review  
**Codebase:** `/Users/ahoehne/repos/snaprow` (FastAPI + SQLAlchemy + PostgreSQL + React)  
**Target:** `/Users/ahoehne/repos/stept` (port destination)

---

## 1. Architecture Analysis

### 1.1 Dynamic Table Creation (DDL Approach)

**How it works:** SnapRow uses a **real-table-per-user-table** approach. When a user creates a "table" in the UI, a physical PostgreSQL table is created via raw DDL:

```python
# crud/table.py — create_table()
physical_name = f"sr_{suffix}_{physical_segment}"
ddl = f"CREATE TABLE IF NOT EXISTS {quoted_physical} ({id_col}, {timestamp_column})"
await db.execute(text(ddl))
```

Every user table gets:
- `id SERIAL PRIMARY KEY`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- A default `name` column (TEXT)
- An `sr__order` column (INTEGER, added lazily)

**Metadata is tracked in `table_meta`** — mapping logical names to physical table names.

**Assessment:** This is the same approach NocoDB and Baserow use. It's the **correct** architectural choice for this use case because:
- Native SQL indexes, constraints, and types
- No JSONB column scanning for queries
- Standard PostgreSQL tooling (pg_dump, EXPLAIN, etc.)
- Performs well at scale

**Concern:** Table names use `sr_{random}_{sanitized_name}`. Renaming a table triggers `ALTER TABLE ... RENAME TO`, which changes the physical name. This could break cached queries or external references.

### 1.2 Data Storage

**One physical table per user table.** Data is stored in native PostgreSQL columns:
- `single_line_text` → `TEXT`
- `number` → `INTEGER`
- `decimal` → `DECIMAL(38, scale)`
- `long_text` → `TEXT` (stores ProseMirror JSON as stringified JSON)
- `single_select` / `multi_select` → `TEXT` (stores option name / comma-separated names)
- `oo_relation` → `INTEGER` (FK to related table)
- `boolean` → `BOOLEAN`

**Assessment:** Good use of native types. However:
- **Multi-select stored as comma-separated TEXT** is a major anti-pattern. Should use a join table or PostgreSQL array (`TEXT[]`).
- **Long text stores JSON as stringified TEXT** rather than `JSONB`. Loses query/indexing capabilities.
- **Select options store the option name, not the ID** in the physical column. Renaming an option breaks all existing data.

### 1.3 Query Building (Filtering/Sorting/Pagination)

Queries are built dynamically in `crud/field.py` using a `_SQLFragments` dataclass that assembles SELECT, JOIN, WHERE, GROUP BY, and ORDER BY clauses.

```python
# field.py — get_rows()
fragments = _SQLFragments(base_alias="t")
for col in cols:
    handler = _HANDLERS[col.ui_type]  # dispatch by type
    await handler(db, table_obj, col, fragments, "name")
sql = fragments.to_sql(base_table_sql, limit=limit, offset=offset, custom_order=sort_clauses)
```

**Filtering** (`crud/filter.py`):
- Filters are persisted per-user in the `filters` table
- `build_filter_clause()` constructs WHERE clauses from filter metadata
- Uses offset-based pagination

**Sorting** (`routers/sort.py`):
- Sorts are persisted per-user in the `sorts` table
- Row ordering uses `sr__order` column with fractional indexing for manual reorder

**Assessment:**
- The query builder is well-structured with the handler dispatch pattern
- **CRITICAL: Offset pagination will degrade badly at scale** (100k+ rows). OFFSET 90000 means the DB must scan and discard 90k rows.
- The `_SQLFragments` approach works but generates complex SQL with many JOINs for tables with relations — each relation column adds a LEFT JOIN

### 1.4 Relations Implementation

Four relation types are supported:

| Type | Physical Storage | Notes |
|------|-----------------|-------|
| `one_to_one` | FK on left table + UNIQUE constraint | Physical column |
| `many_to_one` | FK on left table | Physical column |
| `one_to_many` | FK on right table, virtual column on left | Left col is virtual |
| `many_to_many` | Dedicated join table | Both cols are virtual |

**Implementation details:**
- `crud/relation.py` creates FK constraints, physical columns, and join tables via raw DDL
- `ColumnMeta.column_type` distinguishes `PHYSICAL` vs `VIRTUAL` columns
- `ColumnMeta.relations_table_id` tracks which table a relation column points to
- `RelationMeta` stores the full relation metadata (both sides, join table, FK name)

**Assessment:** This is solid and follows database conventions properly. The bidirectional metadata (storing both `left_column_id` and `right_column_id` on `RelationMeta`) is the right approach. However:
- Deleting a relation drops the FK column with `ALTER TABLE ... DROP COLUMN`, which is a DDL lock operation
- No ON DELETE cascade on relation FKs — deleting a referenced row will throw an FK violation

### 1.5 Formulas, Rollups, Lookups

**Formulas:**
- Stored in `formulas` table with raw formula text and a parsed version
- Formulas reference columns by `{column_id}` syntax
- **Evaluation happens entirely on the frontend** via a custom Pratt parser (`formulaEngine.ts`)
- Server only stores the formula; `get_rows()` returns the formula config as JSON
- Supports: arithmetic, comparisons, built-in functions (SUM, AVG, IF, CONCAT, etc.)

**Rollups:**
- Stored in `rollups` table with relation_column_id, rollup_column_id, aggregate_func
- **Also computed on the frontend** — server returns config JSON
- Supports: count, sum, avg, min, max

**Lookups:**
- Stored in `lookup_columns` table linking: source column → relation column → target column
- **Server-side resolution** via SQL JOINs in `_handle_lookup()` — dispatches to relation handlers
- The SQL builder generates the necessary JOINs to pull lookup values

**Assessment:**
- Frontend formula evaluation is clever for simplicity but **dangerous for integrity** — different clients could compute different results
- Rollups computed on frontend means the client needs ALL related rows loaded — **won't work with pagination**
- Lookups being server-side resolved is the right approach

### 1.6 Column Type System

The type system maps `ui_type` strings to SQL types via `TYPE_MAP`:

```python
TYPE_MAP = {
    "single_line_text": "TEXT",
    "number": "INTEGER",
    "REAL": "REAL",
    "BOOLEAN": "BOOLEAN",
    "oo_relation": "INTEGER",
    "om_relation": "INTEGER",
    "single_select": "TEXT",
    "multi_select": "TEXT",
    "decimal": "DECIMAL",
    "long_text": "TEXT",
}
```

Virtual types (no physical column): `om_relation`, `mm_relation_left`, `mm_relation_right`, `formula`, `rollup`, `lookup`

**Missing types:** date/datetime, email, URL, phone, attachment/file, checkbox, percent, currency, auto-number, created_time, last_modified_time, created_by, last_modified_by

---

## 2. Security Audit

### 2.1 SQL Injection Risks — 🔴 CRITICAL

**`build_filter_clause()` in `crud/filter.py` is vulnerable to SQL injection:**

```python
# filter.py lines ~85-130
def build_filter_clause(column, operation, value, table_alias="t"):
    if operation == "equals":
        return f"{col_ref} = '{value}'"  # ← DIRECT STRING INTERPOLATION
    elif operation == "contains":
        return f"{col_ref}::text ILIKE '%{value}%'"  # ← INJECTABLE
    elif operation == "gt":
        return f"{col_ref} > {value}"  # ← INJECTABLE (numeric)
```

**This is the single most critical issue in the codebase.** A user can craft a filter value like `'; DROP TABLE users; --` and execute arbitrary SQL.

**The `in` operation is also injectable:**
```python
elif operation == "in":
    values = "', '".join(str(v) for v in value)
    return f"{col_ref} IN ('{values}')"  # ← INJECTABLE
```

**Other raw SQL usage:**
- DDL operations (CREATE TABLE, ALTER TABLE, DROP TABLE) use `text()` with `quote_ident()` — these are **safe** because identifiers are validated by `sanitize_identifier()` and quoted
- Data operations (INSERT, UPDATE, DELETE) in `crud/field.py` use parameterized queries with `:param` placeholders — these are **safe**
- The `search_rows()` function uses `:search_term` parameter — **safe**

### 2.2 Auth/Permission Checks — 🟡 INCONSISTENT

**Good:**
- `filter.py`, `sort.py`, `column_visibility.py` routers use `get_current_user` dependency
- The `ProjectPermissionChecker` class provides role-based access control with hierarchical roles
- Session-based auth with hashed tokens

**Bad:**
- **`relation.py` router has NO auth checks at all** — any authenticated user can create/delete relations on any table
- **`formula.py` router has NO auth checks** — same issue
- **`rollup.py` router has NO auth checks**
- **`lookup_columns.py` router has NO auth checks**
- **`select_options.py` router has NO auth checks** (only table existence check)
- **`table.py` router** — need to verify, but table CRUD likely has auth via `ProjectPermissionChecker`
- **`column.py` router** — need to verify
- **`store_view.py` router has NO auth checks at all** — anyone can create/list/delete store views
- **`imports.py`** has auth but the background task `process_import()` receives a `db` session that may be closed by the time it runs

### 2.3 Input Validation — 🟡 MODERATE

- **Identifier sanitization is solid:** `sanitize_identifier()` in `db/utils.py` uses regex validation and rejects dangerous characters
- **Column names are validated** before DDL execution
- **Field values are NOT validated by type** — you can insert "abc" into a NUMBER column (it'll fail at the DB level, not the app level)
- **Filter values are not sanitized** (see SQL injection above)
- **Formula expressions are not sandboxed** on the server (but they're only evaluated client-side, so this is less critical)

### 2.4 Data Leakage Between Projects/Users — 🟡 MODERATE RISK

- Filters, sorts, and visibility are scoped by `user_id` — ✅
- However, the `get_rows()` function in `crud/field.py` does NOT check project membership — if you know a `table_id`, you can read its data
- The `field.py` router (not fully visible but implied) needs to verify the caller has access to the table's project
- Physical table names are predictable (`sr_{suffix}_{name}`) — knowledge of the naming pattern could allow guessing

### 2.5 Rate Limiting — 🔴 NONE

No rate limiting anywhere. The import endpoint accepts arbitrary file sizes. The filter builder can be abused to run expensive queries.

---

## 3. Scaling Concerns

### 3.1 100k+ Rows — 🔴 WILL DEGRADE

**Offset pagination:**
```python
# field.py get_rows()
sql += "OFFSET :offset\n"
```
At 100k rows, `OFFSET 90000 LIMIT 100` means PostgreSQL scans 90,100 rows and discards 90,000. This is O(n) in offset value.

**The query builder generates complex SQL:**
For a table with 5 relation columns, `get_rows()` generates:
```sql
SELECT t.id, t.name, 
  json_build_object('id', r1.id, 'name', r1.name) AS relation1,
  COALESCE(jsonb_agg(...) FILTER (WHERE ...), '[]') AS relation2,
  (SELECT json_build_object(...) FROM formulas ...) AS formula1,
  ...
FROM sr_abc_table AS t
LEFT JOIN sr_def_remote AS r1 ON ...
LEFT JOIN sr_ghi_join AS j1 ON ...
LEFT JOIN sr_jkl_remote AS r2 ON ...
GROUP BY t.id, t.name, r1.id, r1.name
ORDER BY t.sr__order ASC
LIMIT 100 OFFSET 0
```

Each additional relation column adds 1-2 JOINs. With many relations, this becomes expensive.

### 3.2 N+1 Query Problems — 🟡 MODERATE

**In `get_rows()`:** The function pre-fetches all columns in one query, but each column handler may do additional DB lookups:
```python
for col in cols:
    handler = _HANDLERS[col.ui_type]
    await handler(db, table_obj, col, fragments, "name")  # Each handler may query DB
```

Each relation handler calls `_relation_for()`, `db.get(TableMeta, ...)`, `db.get(ColumnMeta, ...)` — these are individual queries per relation column. For a table with 10 relation columns, that's ~30 extra queries just to BUILD the SQL (not execute it).

**In `insert_row()`:** `_column_defaults_map()` queries all columns, then `insert_row()` queries columns again for validation.

**In imports:** Each row is inserted individually in a loop — no batch INSERT.

### 3.3 Missing Indexes — 🟡 MODERATE

**Good:** The metadata tables have appropriate indexes on FKs and lookup columns.

**Missing on dynamic tables:**
- No index on `sr__order` — `ORDER BY sr__order` on 100k rows will be slow
- No index on the `name` column — search will do full table scans
- No full-text search indexes
- FK columns created by relations have FK constraints (which create indexes in PostgreSQL) ✅
- No composite indexes for common filter patterns

### 3.4 Pagination — 🔴 OFFSET ONLY

Uses `LIMIT/OFFSET`. For cursor-based pagination, you'd need to paginate on `(sr__order, id)` or use keyset pagination. The current approach means:
- Page 1: fast
- Page 100: slow (scans 10,000 rows)
- Page 1000: very slow (scans 100,000 rows)

### 3.5 Full Table Scans

- `search_rows()` uses `ILIKE '%term%'` — always a full scan, cannot use indexes
- `build_filter_clause()` with `contains` → `ILIKE '%value%'` — full scan
- `_handle_single_select()` joins on `select_options` with both ID and name matching — potential scan
- `MAX(sr__order)` on every INSERT — scan (should be indexed)

---

## 4. Code Quality

### 4.1 Separation of Concerns — 🟡 MIXED

**Good pattern:** Routers are thin, business logic is in `crud/` modules. The handler dispatch pattern in `field.py` is well-organized.

**Bad:**
- `process_import()` in `routers/imports.py` contains 100+ lines of business logic that should be in a service
- `security.py` is 300+ lines mixing auth logic, permission checking, and project context extraction
- The `_SQLFragments` class and all SQL generation is in `crud/field.py` (700+ lines) — should be a separate query builder module
- `select_options.py` router reads raw JSON body (`await request.json()`) to get `ui_type` — bypasses Pydantic validation

### 4.2 Error Handling — 🟡 INCONSISTENT

- Most routers catch `ValueError` and return 400/404 — reasonable pattern
- **No global exception handler** for unexpected errors
- **Background import task** catches all exceptions and stores error in cache — but `await db.rollback()` may fail if session is already closed
- `print(payload)` left in production code (`relation.py` line 23)
- `console.log` statements throughout frontend code (formula engine, editable cells)

### 4.3 Test Coverage — 🔴 MINIMAL

**Backend:** 481 total lines across 3 test files:
- `test_table_crud.py` — 63 lines
- `test_column_crud.py` — 90 lines
- `test_relation_crud.py` — 225 lines

**Missing tests for:** filters, sorts, formulas, rollups, lookups, imports, select options, field operations, auth/permissions, SQL injection

**Frontend:** 1 test file found: `FormulaField.test.tsx`

**Assessment:** Test coverage is dangerously low. Critical paths like filter clause building (with SQL injection vulnerability) have zero tests.

### 4.4 Code Duplication — 🟡 MODERATE

- `sanitize_identifier()` + `quote_ident()` pattern is repeated in every CRUD module (correctly)
- The `get_rows()` handler pattern is well-organized and avoids duplication
- Import processing has duplicated NaN/Infinity handling (3 separate cleanup passes)
- Frontend: Similar patterns in `SingleRelationField`, `MultiRelationField`, `TagSelectField`, `MultiSelectField`

### 4.5 Type Safety — 🟡 MODERATE

**Backend:**
- Uses Pydantic schemas for request/response validation on most endpoints
- `select_options.py` bypasses Pydantic by reading raw JSON: `body = await request.json()`
- `rollup.py` has a typo: `table_id: string` instead of `table_id: str` — this would crash at runtime
- `import_cache` is a global `Dict[str, Any]` with no type safety

**Frontend:**
- TypeScript with proper type imports (`ColumnRead` from openapi types)
- The formula engine has good typing with AST nodes
- Some `any` types in DataTable components (row handling)

---

## 5. Frontend Analysis

### 5.1 Component Architecture — 🟢 WELL-STRUCTURED

```
DataTable/
├── DataTable.tsx          — Main orchestrator (424 LOC)
├── columns.tsx            — Column definitions + cell rendering dispatch
├── schema.ts              — Zod schema (unused/placeholder)
├── Fields/                — Field-type components
│   ├── SingleRelationField.tsx
│   ├── MultiRelationField.tsx
│   ├── TagSelectField.tsx
│   ├── MultiSelectField.tsx
│   ├── FormulaField.tsx
│   ├── RollupField.tsx
│   ├── LookUpField.tsx
│   ├── DecimalField.tsx
│   ├── LongTextField.tsx
│   ├── HeaderWithMenu.tsx
│   └── EditFieldDialog.tsx
├── SpreadsheetMode/       — Spreadsheet-like editing
│   ├── SpreadsheetContext.tsx
│   ├── EditableCell.tsx
│   ├── HighlightableCell.tsx
│   └── SelectionOverlay.tsx
├── FilterPopover.tsx
├── SortPopover.tsx
├── AddColumnPopover.tsx
├── ImportExcelDialog.tsx
├── RowDialog.tsx
├── RowActionsMenu.tsx
├── TableSearch/
│   └── TableSearch.tsx
└── DragHandle.tsx
```

**Assessment:** The component tree is logical. Field types are properly separated. The SpreadsheetMode is a nicely isolated module. The `columns.tsx` dispatch pattern (switch on `ui_type`) is clean.

### 5.2 State Management — 🟢 GOOD

- **TanStack React Table** for table state (sorting, column sizing, visibility, selection)
- **TanStack React Query** for server state (data fetching, caching, invalidation)
- **Context** (`SpreadsheetContext`) for spreadsheet-mode state (active cell, editing cell, navigation)
- **Zustand-like store** (`active-cell-store`) for the active cell (external to React for performance)
- **No Redux** — good, it would be overkill

The `useRowsVirtual` hook cleanly encapsulates infinite query logic with cursor-based fetching (via `useInfiniteQuery`). This is well-done.

### 5.3 Performance — 🟢 GOOD

- **Virtual scrolling** via `@tanstack/react-virtual` ✅
- **ROW_HEIGHT = 34px, VIRTUAL_OVERSCAN = 30** — reasonable defaults
- **Memoized columns** with `React.useMemo` ✅
- **Debounced visibility persistence** (400ms debounce) ✅
- **React.memo** on filter row components ✅
- **requestAnimationFrame** for keyboard navigation with repeat-key acceleration ✅
- **Infinite scroll** instead of traditional pagination ✅

**Concerns:**
- Column definitions recalculate when `rowsForRender` changes (dependency): `[rowsForRender, cols, tableId, spreadsheetMode]`. Since `rowsForRender` changes on every scroll, columns may be recalculated too often.
- `window.location.reload()` after import — should use query invalidation instead
- No debouncing on cell edits — each keystroke in EditableCell triggers a re-render

### 5.4 Accessibility — 🟡 NEEDS WORK

- **ARIA labels** on checkboxes and buttons ✅
- **Keyboard navigation** in spreadsheet mode (arrows, Tab, Enter, Escape, F2) ✅
- **Missing:** No `role="grid"` or `role="gridcell"` on the table
- **Missing:** No screen reader announcements for cell navigation
- **Missing:** No ARIA labels on filter/sort popovers
- **Missing:** No focus management when dialogs open/close
- Column resize handles have `aria-hidden="true"` but no keyboard alternative

### 5.5 What Works Well (Keep)

1. **Virtual scrolling implementation** — well-tuned with `useRowsVirtual`
2. **SpreadsheetMode** — full keyboard navigation, cell editing, auto-row-creation is smooth
3. **Formula engine** — complete Pratt parser with proper error handling and validation
4. **Column type dispatch** — clean switch-based rendering in `columns.tsx`
5. **Filter/Sort UI** — draft→apply workflow is user-friendly
6. **Cell editing UX** — double-click, F2, type-to-enter, Tab/Enter navigation

### 5.6 What Needs Improvement

1. **`schema.ts`** is a placeholder with hardcoded fields — unused
2. **Console.log statements** everywhere (formula engine, editable cell, columns)
3. **No error boundaries** around field components — a bad formula crashes the whole table
4. **No loading skeleton** for the initial table load (only for sparse rows)
5. **Import uses `window.location.reload()`** instead of query invalidation
6. **No undo/redo** for cell edits
7. **No copy/paste** support for cell ranges

---

## 6. Specific Bugs/Issues Found

### 🔴 Critical

1. **SQL Injection in `crud/filter.py:build_filter_clause()`** (lines 85-130) — All string operations (`equals`, `contains`, `starts_with`, `ends_with`, `in`, `not_in`) interpolate user values directly into SQL strings. **Exploit:** Set filter value to `' OR 1=1; DROP TABLE users; --`.

2. **Duplicate column definitions in `models.py`** (lines ~458-468) — `DashboardWidget` class has `y`, `w`, `h`, `created_at`, `updated_at`, `dashboard`, `table` defined twice. SQLAlchemy will use the last definition, but this is a code error.

3. **Type annotation bug in `crud/rollup.py:add_rollup()`** (line 18) — `table_id: string` should be `table_id: str`. The `string` type doesn't exist in Python. This will crash at runtime if type checking is enforced.

4. **Background import session leak in `routers/imports.py`** (line 100) — `process_import()` receives a `db` session from the request handler, but background tasks run after the response is sent. The session may be closed/committed by `get_session()` dependency before the background task runs. This is a well-known FastAPI footgun.

### 🟡 Medium

5. **Race condition in `insert_row()`** (`crud/field.py`, line ~100) — `MAX(sr__order)` is read, then used for the new row's order. Two concurrent inserts could get the same MAX and produce duplicate order values. Needs `SELECT ... FOR UPDATE` or a sequence.

6. **Race condition in `_rebalance_order_window()`** (`crud/field.py`, ~line 190) — CTE-based rebalance doesn't lock rows. Concurrent operations during rebalance could produce inconsistent ordering.

7. **Infinite recursion in `insert_row_at_position()`** (`crud/field.py`, ~line 175) — If rebalance doesn't increase the gap, the function calls itself recursively. No maximum recursion guard.

8. **Missing auth on 6 routers** — `relation.py`, `formula.py`, `rollup.py`, `lookup_columns.py`, `select_options.py`, `store_view.py` have no `get_current_user` or `ProjectPermissionChecker` dependency.

9. **`lru_cache` on `_table_cache_key()`** (`crud/field.py`) — This function just returns its input. The `lru_cache` decorator does nothing useful here (the function below it `_get_table` isn't cached). Dead code that suggests an incomplete optimization.

10. **Import cache is in-memory** (`routers/imports.py`, line 22) — `import_cache: Dict[str, Any] = {}` means imports are lost on server restart and don't work with multiple worker processes.

11. **Multi-select stores comma-separated values** — If an option name contains a comma, parsing breaks. No escaping mechanism.

12. **Select option assignment stores name, not ID** (`crud/select_options.py:assign_select_option()`) — Renaming an option breaks all existing data associations.

13. **`_handle_oo_relation()` adds an extra raw alias to SELECT** (`crud/field.py`, ~line in _handle_oo_relation) — `f.select.append(f"{remote_name} AS {remote_alias}")` adds a second SELECT clause with a non-deterministic alias (uses `gen_suffix(3)`), potentially causing column name collisions.

14. **No LIMIT on formula subquery** — `_handle_formula()` uses `LIMIT 1` which is fine, but `_handle_rollup()` has no LIMIT — if somehow multiple rollup configs exist, it'll return multiple rows.

### 🟢 Minor

15. **`print(payload)` in `routers/relation.py`** (line 23) — Debug print left in production code.

16. **Console.log statements** throughout frontend: `formulaEngine.ts` (Parser constructor, ColumnNode.evaluate, BinaryNode.evaluate), `EditableCell.tsx` (debug effects), `columns.tsx` (`console.log(keys)`).

17. **Unused `DragHandle` import** in `columns.tsx` — imported but never used.

18. **`schema.ts` is dead code** — Contains a hardcoded Zod schema with fields like `header`, `status`, `target` that don't match any actual table structure.

19. **`keepPreviousData` is deprecated** in newer TanStack Query versions — `useRowsVirtual.ts` uses it.

---

## 7. Migration Plan for Stept

### 7.1 KEEP AS-IS (Copy Directly)

| Component | Path | Notes |
|-----------|------|-------|
| Formula engine | `app/src/utils/formulaEngine.ts` | Complete Pratt parser, well-tested |
| Built-in functions | `app/src/utils/builtInFunctions.ts` | Function registry |
| SpreadsheetContext | `app/src/components/DataTable/SpreadsheetMode/` | All 4 files |
| EditableCell | Same | Cell editing UX |
| SelectionOverlay | Same | Visual selection |
| HighlightableCell | Same | Read-only cell wrapper |
| useRowsVirtual hook | `app/src/hooks/useRowsVirtual.ts` | Virtual infinite scroll |
| FilterPopover UI | `app/src/components/DataTable/FilterPopover.tsx` | Draft→apply pattern |
| SortPopover UI | `app/src/components/DataTable/SortPopover.tsx` | Sort UI |
| Field components | `app/src/components/DataTable/Fields/` | All 12 field type components |

### 7.2 KEEP + IMPROVE

| Component | Changes Needed |
|-----------|---------------|
| `DataTable.tsx` | Remove `window.location.reload()`, add error boundaries, remove console.logs |
| `columns.tsx` | Remove unused imports, clean console.logs, add missing field types (date, checkbox, URL) |
| `schema.ts` | Rewrite with actual Zod schemas matching ColumnRead |
| `useRowsVirtual.ts` | Replace `keepPreviousData` with `placeholderData`, add error handling |
| `HeaderWithMenu.tsx` | Add column reorder drag-and-drop (partially implemented) |
| `ImportExcelDialog.tsx` | Use query invalidation instead of page reload |

### 7.3 REWRITE (Backend)

| Module | Why | Approach |
|--------|-----|----------|
| `crud/filter.py:build_filter_clause()` | **SQL injection** — MUST parameterize | Use SQLAlchemy `column()` objects with `op()` methods, or build a proper query builder |
| `crud/field.py:get_rows()` | Query complexity, N+1 during build | Pre-fetch ALL metadata in batch (single query for all relations, columns). Consider materialized views for heavy tables |
| `crud/field.py:insert_row()` | Race condition on `sr__order` | Use PostgreSQL `GENERATED ALWAYS AS IDENTITY` or `SELECT ... FOR UPDATE` |
| `routers/imports.py:process_import()` | Session leak, in-memory cache | Use Celery/ARQ for background jobs, Redis for cache |
| All routers missing auth | Security gap | Add `ProjectPermissionChecker` dependency to every router |
| Multi-select storage | Comma-separated = broken | Use PostgreSQL `TEXT[]` array or a join table |

### 7.4 ADD (Missing Features)

| Feature | Priority | Notes |
|---------|----------|-------|
| Cursor-based pagination | HIGH | Use keyset pagination on `(sr__order, id)` |
| Server-side formula evaluation | HIGH | Can't rely on frontend for data integrity |
| Server-side rollup computation | HIGH | Current approach can't work with pagination |
| Rate limiting | HIGH | FastAPI `slowapi` or custom middleware |
| Proper date/datetime column type | MEDIUM | With timezone handling |
| Row-level permissions | MEDIUM | Stept may need this for shared projects |
| Batch INSERT for imports | MEDIUM | Use `INSERT INTO ... VALUES (...), (...), ...` |
| Full-text search | MEDIUM | PostgreSQL `tsvector` + GIN index |
| Column type validation | MEDIUM | Validate values match column type before INSERT |
| Undo/redo system | LOW | Operation log with reversible actions |
| Audit log | LOW | Track who changed what |
| Webhook/real-time updates | LOW | WebSocket for collaborative editing |

### 7.5 Model Changes for Stept

Stept currently uses `SQLModel` base and has `gen_suffix` for IDs. The data table models need to be added:

```python
# New models to add to Stept's models.py

class TableType(enum.Enum):
    USER = "user"
    JOIN = "join"

class ColumnType(enum.Enum):
    PHYSICAL = "physical"
    VIRTUAL = "virtual"

class TableMeta(Base):
    __tablename__ = "table_meta"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, index=True)
    physical_name = Column(String, unique=True, index=True)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    table_type = Column(SQLEnum(TableType), nullable=False, default=TableType.USER)
    has_order_column = Column(Boolean, default=False)

class ColumnMeta(Base):
    __tablename__ = "column_meta"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), index=True)
    display_name = Column(String)
    name = Column(String)  # physical column name
    ui_type = Column(String, nullable=False)
    column_type = Column(SQLEnum(ColumnType), default=ColumnType.PHYSICAL)
    sr__order = Column(Integer, default=1000)
    default_value = Column(JSON, nullable=True)
    settings = Column(JSON, nullable=True)
    relations_table_id = Column(String(16), nullable=True)

# Keep: RelationMeta, SelectOption, LookUpColumn, Formulas, Rollup
# Keep: Filter, Sort, ColumnVisibility (with user_id FK to Stept's User)
```

**Key differences from SnapRow:**
- Stept's `database.py` already has pool configuration (pool_size=20, max_overflow=10) — SnapRow doesn't. Keep Stept's.
- Stept uses `Base = declarative_base()` from SQLAlchemy — same as SnapRow. Compatible.
- Stept has folder hierarchy — tables should be linkable to folders

### 7.6 Migration Strategy

1. **Create Alembic migration** in Stept adding all metadata tables:
   ```bash
   alembic revision --autogenerate -m "add_data_table_models"
   ```

2. **Add the `db/utils.py` module** with `sanitize_identifier()`, `quote_ident()`, `_get_dialect_name()`

3. **Port CRUD modules** in order:
   - `crud/table.py` (create/drop/rename)
   - `crud/column.py` (add/delete/update/reorder)
   - `crud/field.py` (insert/update/delete/get_rows) — **REWRITE filter clause building**
   - `crud/relation.py` (add/delete/assign/unassign)
   - `crud/select_options.py`
   - `crud/formula.py`
   - `crud/rollup.py`
   - `crud/lookup_column.py`
   - `crud/filter.py` — **REWRITE `build_filter_clause()`**

4. **Port routers** — add `ProjectPermissionChecker` to every endpoint

5. **Port frontend** — copy components, update API client imports to match Stept's patterns

---

## 8. Best Practices Comparison

### NocoDB

| Aspect | NocoDB | SnapRow |
|--------|--------|---------|
| Table storage | Real PostgreSQL tables (same) | Same ✅ |
| Query building | Custom SQL builder with proper parameterization | Custom SQL builder with **SQL injection** ❌ |
| Filter system | Server-side with parameterized queries | Server-side with **string interpolation** ❌ |
| Formula eval | Server-side (Node.js) | Frontend-only (fragile) ⚠️ |
| Pagination | Offset + limit (same limitation) | Same |
| Auth | JWT + project-level RBAC | Cookie/JWT + project RBAC (inconsistently applied) ⚠️ |
| Relations | FK-based (same) | Same ✅ |

### Baserow (Python/Django)

| Aspect | Baserow | SnapRow |
|--------|---------|---------|
| Table storage | Real PostgreSQL tables | Same ✅ |
| Query building | Django ORM with `Q` objects — type-safe | Raw SQL builder ⚠️ |
| Filter system | Django filters with proper escaping | SQL injection ❌ |
| Type system | Rich: 20+ field types with validators | Basic: ~10 types, no validation ⚠️ |
| Formula eval | Server-side (Python) with AST | Frontend-only ⚠️ |
| Permissions | Row-level RBAC | Project-level only |
| Pagination | Offset (same issue) | Same |

### Teable (TypeScript/Prisma)

| Aspect | Teable | SnapRow |
|--------|--------|---------|
| Table storage | Real PostgreSQL tables | Same ✅ |
| Query building | Prisma + custom SQL | Custom SQL |
| Formula eval | Server-side with dependency graph | Frontend-only ⚠️ |
| Real-time | WebSocket collaboration | None |
| Pagination | Cursor-based | Offset only ❌ |
| Type system | 15+ types with validation | ~10 types, no validation ⚠️ |

### Key Takeaways from Comparison

1. **SnapRow's real-table approach is correct** — all major players use it
2. **SQL injection in filters is uniquely bad** — no comparable tool has this vulnerability
3. **Frontend-only formula evaluation is unusual** — all mature tools do server-side
4. **Missing cursor pagination** is a known limitation shared with NocoDB/Baserow but solved by Teable
5. **Auth gaps are the most actionable improvement** — add permission checks everywhere

---

## Summary: Risk Matrix

| Issue | Severity | Effort to Fix | Priority |
|-------|----------|---------------|----------|
| SQL injection in filters | 🔴 Critical | Low (rewrite one function) | **P0 — Fix before anything else** |
| Missing auth on 6 routers | 🔴 Critical | Low (add dependency) | **P0** |
| Background task session leak | 🔴 Critical | Medium (add task queue) | P1 |
| Multi-select comma storage | 🟡 High | Medium (migration + code) | P1 |
| Offset pagination at scale | 🟡 High | Medium (keyset pagination) | P1 |
| N+1 in query builder | 🟡 Medium | Medium (batch metadata) | P2 |
| Frontend-only formulas/rollups | 🟡 Medium | High (server-side engine) | P2 |
| Missing indexes on dynamic tables | 🟡 Medium | Low (add on creation) | P2 |
| No rate limiting | 🟡 Medium | Low (add middleware) | P2 |
| Test coverage | 🟡 Medium | High (write tests) | P2 |
| Select stores name not ID | 🟡 Medium | Medium (migration) | P3 |
| Missing field types | 🟢 Low | Medium (add types) | P3 |
| Console.log cleanup | 🟢 Low | Low | P3 |

**Bottom line:** The architecture is sound (real tables, metadata system, handler dispatch). The frontend is surprisingly good (virtual scrolling, keyboard nav, formula engine). But the backend has two showstopper security issues (SQL injection, missing auth) that must be fixed before porting to Stept. The filter clause builder needs a complete rewrite with parameterized queries. After security fixes, the main effort is scaling (cursor pagination, server-side formulas, batch operations).
