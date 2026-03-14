# Dead Code Cleanup — 2026-03-14

## Files Deleted (16 total)

### Unused Components (`app/src/components/`)
| File | Reason |
|------|--------|
| `tiptap-renderer.tsx` | Duplicate of `Editor/Renderer.tsx`, never imported |
| `application-navbar.tsx` | Empty file (0 bytes) |

### Unused Hooks (`app/src/hooks/`)
| File | Reason |
|------|--------|
| `use-composed-ref.ts` | Not imported anywhere |
| `use-cursor-visibility.ts` | Not imported anywhere |
| `use-floating-element.ts` | Not imported anywhere |
| `use-menu-navigation.ts` | Not imported anywhere |
| `use-on-click-outside.ts` | Not imported anywhere |
| `use-tiptap-editor.ts` | Not imported anywhere |
| `use-ui-editor-state.ts` | Not imported anywhere |
| `users.ts` | Not imported anywhere |

### Unused Lib Modules (`app/src/lib/`)
| File | Reason |
|------|--------|
| `color.ts` | `getContrastTextColor` never imported |
| `tiptap-collab-utils.ts` | Duplicate utilities, never imported |

### Orphaned Pages (`app/src/pages/`)
| File | Reason |
|------|--------|
| `DeviceAuth.tsx` | Not in any router config, never imported |
| `context-links.tsx` | Not in any router config, never imported (note: the API module `api/context-links.ts` IS used) |

### Other
| File | Reason |
|------|--------|
| `app/src/data.json` | Fake PII test data, not imported |
| `app/src/App.css` | Vite boilerplate, not imported |

## Stale Lockfiles Deleted
- `app/package-lock.json` — monorepo uses pnpm (`pnpm-workspace.yaml` exists)
- `desktop/package-lock.json` kept — electron-forge may require npm

## Renamed Files
- `desktop/src/renderer/components/spotlight/OndokiLogo.tsx` → `SteptLogo.tsx`
  - File already exported `SteptLogo`; 3 files imported from `./SteptLogo`
  - Old filename would break on case-sensitive filesystems (Linux CI)

## Dependency Changes (`app/package.json`)

### Removed
- `cross-env` — not used in any npm scripts
- `dotenv` — not imported in any source file

### Moved to devDependencies
- `@tailwindcss/vite` (was in `dependencies`)
- `tailwindcss` (was in `dependencies`)
- `tailwind-merge` kept in `dependencies` (used at runtime for class merging)
