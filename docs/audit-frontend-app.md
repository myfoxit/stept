# Frontend App Audit — Open-Source Release Readiness

**Date:** 2026-03-14  
**Scope:** `app/` directory (frontend web application)  
**Auditor:** Automated audit

---

## Critical

### C1. Duplicate file: `tiptap-renderer.tsx` and `Editor/Renderer.tsx`

- **Files:** `src/components/tiptap-renderer.tsx` and `src/components/Editor/Renderer.tsx`
- **Issue:** These two files are identical except for the export name (`TipTapRenderer` vs `EditorRenderer`). Only `EditorRenderer` is imported (in `src/pages/public-document.tsx:8`). The `TipTapRenderer` component is never used.
- **Fix:** Delete `src/components/tiptap-renderer.tsx`.

### C2. Empty file: `application-navbar.tsx`

- **File:** `src/components/application-navbar.tsx` (0 bytes)
- **Issue:** Empty file left in the codebase. Not imported anywhere.
- **Fix:** Delete `src/components/application-navbar.tsx`.

### C3. Sample/test data committed: `data.json`

- **File:** `src/data.json` (90 lines)
- **Issue:** Contains fake personal data (names, emails, addresses like "Lukas Wusel", "lukas.wusel@example.com", "Gosserweg 12", Berlin). Not imported anywhere in the app. Likely leftover test/demo data from development.
- **Fix:** Delete `src/data.json` or move to a fixtures/seed directory if needed for tests.

### C4. Orphaned pages not routed

- **File:** `src/pages/DeviceAuth.tsx` — Not imported in `main.tsx` or anywhere else as a route component (only referenced as a state variable name in `login.tsx`).
- **File:** `src/pages/context-links.tsx` — Not imported in `main.tsx`. The `ContextLinkPanel` component (in `src/components/ContextLinks/`) is separate and may be used, but the full page at `src/pages/context-links.tsx` (795+ lines) is orphaned.
- **Fix:** Either wire these pages into the router or delete them if superseded.

---

## High

### H1. Unused hooks (7 files, dead code)

None of these hooks are imported anywhere in the codebase:

| File | Exported symbols |
|------|-----------------|
| `src/hooks/use-composed-ref.ts` | `useComposedRef` |
| `src/hooks/use-cursor-visibility.ts` | `useCursorVisibility`, `CursorVisibilityOptions` |
| `src/hooks/use-floating-element.ts` | `useFloatingElement` |
| `src/hooks/use-menu-navigation.ts` | `useMenuNavigation` |
| `src/hooks/use-on-click-outside.ts` | `useOnClickOutside` |
| `src/hooks/use-tiptap-editor.ts` | `useTiptapEditor` |
| `src/hooks/use-ui-editor-state.ts` | `useUiEditorState`, `UiEditorState` |

Note: `use-window-size` and `use-isomorphic-layout-effect` are only used by `use-cursor-visibility` and `use-on-click-outside` respectively — both of which are themselves unused. If those hooks are deleted, these become dead code too.

- **Fix:** Delete unused hook files.

### H2. Unused modules

- **File:** `src/hooks/users.ts` — Not imported anywhere.
- **File:** `src/lib/color.ts` — Exports `getContrastTextColor` but is never imported.
- **File:** `src/lib/tiptap-collab-utils.ts` — Not imported anywhere. Contains duplicate implementations of `getUrlParam` and `fetchAiToken` that already exist in `src/components/Editor/utils/editor-helpers.ts`.
- **Fix:** Delete these files.

### H3. Duplicate utility functions

- **Files:** `src/lib/tiptap-collab-utils.ts` (lines 21, 161) and `src/components/Editor/utils/editor-helpers.ts` (lines 195, 201)
- **Issue:** Both files define `getUrlParam()` and `fetchAiToken()` with near-identical implementations. The `editor-helpers.ts` versions are the ones actually imported (by `src/contexts/ai-context.tsx`).
- **Fix:** Delete the duplicates from `tiptap-collab-utils.ts` (or delete the entire file per H2).

### H4. Leftover Vite boilerplate CSS

- **File:** `src/App.css`
- **Issue:** Contains default Vite/React boilerplate CSS (`.logo`, `#root { max-width: 1280px }`, etc.). Not imported anywhere in the app — the app uses `index.css` + Tailwind.
- **Fix:** Delete `src/App.css`.

### H5. `console.log` statements in production code

These are NOT behind `import.meta.env.DEV` guards:

| File | Line | Statement |
|------|------|-----------|
| `src/components/Editor/Nodes/ButtonNode/ButtonNodeComponent.tsx` | 47 | `console.log(\`Run action: ${action}\`)` |
| `src/api/workflows.ts` | 132 | `console.log('Uploading image:', {...})` |
| `src/pages/workflow-view.tsx` | 473 | `console.log('Duplicate step:', stepNumber)` |
| `src/pages/workflow-view.tsx` | 480 | `console.log('Link copied to clipboard')` |
| `src/pages/workflow-view.tsx` | 484 | `console.log('Update guide link for step:', stepNumber)` |

The `apiClient.ts:14` log IS behind a `DEV` guard — that's fine.

- **Fix:** Remove or wrap in `DEV` guard.

### H6. TODO/FIXME comments with stub implementations

| File | Line | Comment |
|------|------|---------|
| `src/components/Editor/ComponentEditor.tsx` | 78 | `{/* TODO: real pop‑over list */}` |
| `src/pages/workflow-view.tsx` | 474 | `// TODO: Implement step duplication` |
| `src/pages/workflow-view.tsx` | 485 | `// TODO: Implement guide link update` |

- **Fix:** Implement or remove these stubs before release. The workflow-view TODOs have corresponding `console.log` calls that log but do nothing.

---

## Medium

### M1. TypeScript `any` types (50+ occurrences)

Major clusters:

| File | Lines | Issue |
|------|-------|-------|
| `src/types/openapi.ts` | 190 | `[key: string]: any` in index signature |
| `src/components/Editor/FloatingToolbar.tsx` | 98, 146, 230 | `editor: any` should be `Editor` from `@tiptap/react` |
| `src/components/Editor/SlashMenu.tsx` | 22, 263 | `editor: any; range: any` |
| `src/components/Editor/Nodes/ProcessRecordingNode/ProcessRecordingNode.tsx` | 42 | `node: any` |
| `src/components/Editor/Nodes/ButtonNode/ButtonNodeComponent.tsx` | 28 | `node: any` |
| `src/components/Editor/Extensions/pagination/index.ts` | 746, 750, 773, 1022, 1031, 1048, 1069 | Multiple `any` casts |
| `src/components/Editor/hooks/useAutoSave.ts` | 70, 139 | `dependencies: any[]`, `catch (err: any)` |
| `src/components/Editor/SteptEditor.tsx` | 90 | `onSuccess: (data: any)` |
| `src/components/tiptap-renderer.tsx` | 320 | `content: any` |
| `src/components/Editor/Renderer.tsx` | 320 | `content: any` |
| `src/hooks/api/folders.ts` | 91, 94 | `oldData: any`, `nodes: any[]` |
| `src/hooks/api/documents.ts` | 30, 36, 140, 149 | Multiple `any` payloads |
| `src/pages/analytics-dashboard.tsx` | 89, 114, 138, 166, 200 | `.map((r: any)` throughout |
| `src/pages/document-gallery.tsx` | 105, 252, 367 | `doc: any`, `aVal: any, bVal: any` |
| `src/pages/team.tsx` | 99 | `member: any` |
| `src/pages/trash.tsx` | 32, 38 | `(d: any)`, `(w: any)` |
| `src/pages/verification-settings.tsx` | 62 | `value: any` |
| `src/api/workflows.ts` | 299 | `steps_snapshot?: any[]` |
| `src/api/documents.ts` | 36 | `content: any` |
| Multiple catch blocks | various | `catch (err: any)` / `catch (e: any)` — 10+ occurrences |

- **Fix:** Replace with proper types. For catch blocks, use `unknown` and narrow. For editor props, use `Editor` from `@tiptap/react`. For API responses, create proper interfaces.

### M2. Inconsistent API call patterns

- **Issue:** Most API modules (`src/api/*.ts`) use the centralized `apiClient` (Axios), but several also use raw `fetch()` for specific endpoints:
  - `src/api/chat.ts` — uses `fetch` for streaming
  - `src/api/inlineAI.ts` — uses `fetch` for streaming
  - `src/api/processing.ts` — uses `fetch` for streaming
  - `src/api/workflows.ts` — uses `fetch` for file upload

  Additionally, pages use raw `fetch` directly:
  - `src/pages/public-document.tsx:14`
  - `src/pages/embed-workflow.tsx:15`
  - `src/pages/device-consent.tsx:26,55`

- **Fix:** The streaming cases are understandable (Axios doesn't handle ReadableStream well). Document this as an intentional pattern. For non-streaming cases in pages, consider routing through `apiClient` for consistent auth/error handling.

### M3. Hardcoded external service URLs

| File | Line | URL | Issue |
|------|------|-----|-------|
| `src/utils/workflow.ts` | 204 | `https://www.google.com/s2/favicons?domain=...` | Hardcoded Google favicon service |
| `src/components/workflow/icon-picker-modal.tsx` | 86, 191 | Same Google favicon URL | Duplicate of above |
| `src/components/Settings/LlmSetupWizard.tsx` | 276 | `https://api.githubcopilot.com` | Hardcoded Copilot API URL |
| `src/components/app-sidebar.tsx` | 80 | `https://docs.stept.ai` | Hardcoded docs URL |
| `src/components/settings-tabs.tsx` | 17 | `https://docs.stept.ai` | Duplicate docs URL |
| `src/pages/embed-workflow.tsx` | 116 | `https://stept.ai` | Hardcoded product URL |
| `src/components/app-sidebar.tsx` | 52 | `hello@stept.ai` | Hardcoded email |

- **Fix:** Extract docs/product URLs to env vars or a config constants file. The Google favicon URL should be a shared constant. The Copilot URL is part of provider config and may be acceptable.

### M4. `chrome.runtime` usage in web app

- **File:** `src/pages/workflow-view.tsx`, lines 432-434
- **Issue:** Direct `chrome.runtime.sendMessage()` call in the web app to communicate with the Chrome extension. This will throw `ReferenceError` in non-Chrome browsers or when the extension isn't installed.
- **Fix:** Add proper feature detection: `if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage)`.

### M5. Accessibility: icon-only buttons without `aria-label`

Many `<Button variant="ghost" size="icon">` throughout the app lack `aria-label`. Key offenders (17+ instances):

| File | Lines | Description |
|------|-------|-------------|
| `src/components/Settings/ProviderLogin.tsx` | 222 | Copy code button |
| `src/components/Settings/LlmSetupWizard.tsx` | 417 | Toggle visibility button |
| `src/components/workflow/share-export-modal.tsx` | 231, 299 | Copy URL, remove user buttons |
| `src/components/VersionHistory/VersionHistoryPanel.tsx` | 147 | Close panel button |
| `src/components/Editor/LinkBubbleMenu.tsx` | 72, 75 | Save/cancel buttons (84, 87, 90 have `title` but no `aria-label`) |
| `src/components/Editor/SteptEditor.tsx` | 266, 277, 278 | Reload, restore, dismiss buttons |
| `src/pages/context-links.tsx` | 795, 798 | Edit/delete buttons |

- **Fix:** Add `aria-label` to all icon-only buttons describing their action.

### M6. Missing `alt` text on images

- **File:** `src/components/application-nav-bar.tsx`, lines 280-285: `<img>` with dynamic `alt={appName}` — acceptable.
- **File:** `src/components/workflow/icon-picker-modal.tsx`, line 191: Favicon preview `<img>` has no alt text.
- **Fix:** Add descriptive `alt` text to the favicon preview image.

---

## Low

### L1. Excessive `console.error` / `console.warn` in production

~60 `console.error` and `console.warn` calls throughout the codebase (outside test files). While some are in error handlers (acceptable), many are overly verbose for production:

- `src/components/Editor/Extensions/pagination/index.ts` — 12 debug-level `console.log` calls behind a `debug` flag (acceptable pattern, but the flag should default to `false`)
- `src/lib/tiptap-utils.ts` — 5 `console.warn`/`console.error` calls
- `src/lib/tiptap-collab-utils.ts` — 2 `console.error`/`console.warn` calls (file is unused anyway)
- Various page components with `console.error` in catch blocks

- **Fix:** Consider using a logging utility that can be silenced in production builds, or replace with user-facing error toasts via `sonner`.

### L2. Hardcoded Ollama localhost URLs

- **File:** `src/components/Settings/LlmSetupWizard.tsx`, lines 166, 186, 708
- **Issue:** `http://localhost:11434/api/tags` hardcoded 3 times for Ollama detection.
- **Fix:** Extract to a constant like `OLLAMA_DEFAULT_URL`. These are user-facing defaults, so the hardcoding is somewhat intentional, but the repetition should be DRY'd up.

### L3. `sass-embedded` in devDependencies but SCSS files exist

- **File:** `package.json` devDependency: `sass-embedded`
- **Issue:** There are 5 `.scss` files in the project (`src/styles/`, `src/components/Editor/`), and `sass-embedded` is correctly listed. However, `@tailwindcss/vite` and `tailwindcss` are listed as production dependencies but are actually Vite plugins / build tools — they should be in `devDependencies`.
- **Fix:** Move `@tailwindcss/vite` and `tailwindcss` to `devDependencies`.

### L4. Mixed CSS approaches

- **Issue:** The app uses three CSS approaches simultaneously:
  1. **Tailwind CSS** — primary, used everywhere via utility classes
  2. **Plain CSS files** — `src/index.css`, `src/App.css` (unused), `src/components/Editor/Nodes/VariableNode/variable-node.css`
  3. **SCSS** — `src/styles/_variables.scss`, `src/styles/_keyframe-animations.scss`, editor component styles
- **Fix:** Not necessarily a blocker, but consider migrating the few CSS/SCSS files to Tailwind for consistency, or at minimum document the CSS architecture.

### L5. `cross-env` devDependency potentially unused

- **File:** `package.json`
- **Issue:** `cross-env` is in devDependencies but none of the `scripts` entries use it.
- **Fix:** Remove if unused.

### L6. `dotenv` devDependency potentially unused

- **File:** `package.json`
- **Issue:** `dotenv` is in devDependencies. Vite handles `.env` files natively via `import.meta.env`. Unless used in test setup or scripts, it may be unnecessary.
- **Fix:** Check if used in Jest/Playwright config; remove if not.

### L7. Duplicate Google Favicon URL construction

- **Files:** `src/utils/workflow.ts:204`, `src/components/workflow/icon-picker-modal.tsx:86,191`
- **Issue:** The Google Favicons URL template is constructed in 3 places.
- **Fix:** Use the existing helper from `src/utils/workflow.ts` everywhere.

### L8. `import.meta.env.VITE_API_BASE_URL` vs `VITE_API_URL`

- **File:** `src/lib/apiClient.ts:11`
- **Issue:** Falls back through two env var names: `VITE_API_BASE_URL || VITE_API_URL || '/api/v1'`. Having two env var names for the same thing is confusing.
- **Fix:** Standardize on one env var name and document it.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High | 6 |
| Medium | 6 |
| Low | 8 |

### No old name references found ✅

Searched for `ondoki`, `snaprow`, `SnapRow`, `Ondoki`, `snap_row`, `snap.row` across all `.ts`, `.tsx`, `.css`, `.scss`, `.json`, and `.html` files — **zero matches**. The rename appears complete.

### Key actions for open-source release:

1. **Delete dead files** (C1-C4, H1-H2, H4): ~15 files to remove
2. **Remove `console.log`** statements (H5): 5 occurrences
3. **Resolve or remove TODOs** (H6): 3 stub implementations
4. **Add `aria-label`** to icon buttons (M5): 17+ buttons
5. **Type the `any`s** (M1): 50+ occurrences, prioritize public API surface
6. **Guard `chrome.runtime`** (M4): 1 fix needed
