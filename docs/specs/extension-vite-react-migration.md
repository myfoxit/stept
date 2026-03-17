# Extension Migration: Vanilla JS → Vite + TypeScript + React

## Overview

Migrate the Chrome extension from plain JavaScript files (no build step) to a Vite-bundled TypeScript + React project. The extension currently has ~8,900 lines across 12 files with zero dependencies, zero types, and zero build tooling.

**Goal**: Modern build system, type safety, React for UI surfaces (sidepanel + popup), while preserving every existing behavior exactly.

**Non-goals**: Adding features, changing UX, refactoring algorithms, improving the capture pipeline.

---

## Ground Rules

1. **Every commit must produce a loadable extension.** Load `dist/` in `chrome://extensions`, verify it works. If it doesn't, fix before moving on.
2. **Do not change any algorithm, timing, or behavior.** The pre-capture race handling, double-click detection, navigate suppression, element finder cascade, streaming upload — all of it stays identical.
3. **Do not rename message types yet.** Keep `'START_RECORDING'`, `'CLICK_EVENT'`, etc. as strings initially. Type them, but don't rename them.
4. **Do not refactor while migrating.** If code is ugly, leave it ugly. Migration and refactoring are separate tasks.
5. **Content scripts injected into pages (`content.ts`, `redaction.ts`, `guide-runtime.ts`) stay as vanilla TypeScript.** No React, no JSX. They run inside page shadow DOMs and must stay lightweight.
6. **Test on Windows after each commit.** The primary test platform is Windows where service worker lifecycle is aggressive (<30s kill).

---

## Target File Structure

```
extension/
├── src/
│   ├── background/
│   │   ├── index.ts                    # Service worker entry (imports handlers)
│   │   ├── state.ts                    # State object + persistence functions
│   │   ├── auth.ts                     # Login, logout, token refresh, PKCE
│   │   ├── recording.ts               # Start/stop/pause/resume recording
│   │   ├── steps.ts                    # Step CRUD, screenshot management
│   │   ├── upload.ts                   # Streaming upload + finalize
│   │   ├── guides.ts                   # Guide orchestration, health tracking
│   │   ├── context.ts                  # Context link matching
│   │   ├── settings.ts                 # Settings get/set, display mode
│   │   ├── navigation.ts              # Tab tracking, page change detection
│   │   └── api.ts                      # API fetch helpers, authedFetch
│   │
│   ├── content/
│   │   ├── index.ts                    # Content script entry (capture + dock + smart blur)
│   │   ├── capture.ts                  # Click/key/type event handlers
│   │   ├── elements.ts                 # gatherElementInfo, selectors, xpath, parent chain
│   │   ├── dock.ts                     # Dock overlay (shadow DOM, vanilla)
│   │   ├── smart-blur.ts              # Smart blur popup (shadow DOM, vanilla)
│   │   └── dom-snapshot.ts            # rrweb snapshot wrapper
│   │
│   ├── content/redaction.ts           # PII redaction module (IIFE, injected separately)
│   │
│   ├── guide-runtime/
│   │   └── index.ts                    # Guide overlay runtime (IIFE, injected on demand)
│   │
│   ├── sidepanel/
│   │   ├── index.tsx                   # React entry
│   │   ├── App.tsx                     # Root component
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── LoginPanel.tsx
│   │   │   ├── SetupPanel.tsx          # Project selector + start button
│   │   │   ├── StepsList.tsx           # Recording steps with screenshots
│   │   │   ├── StepCard.tsx            # Individual step card
│   │   │   ├── UploadPanel.tsx
│   │   │   ├── RecordingFooter.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── ContextLinks.tsx
│   │   │   ├── RecentWorkflows.tsx
│   │   │   ├── GuideStepsPanel.tsx     # Guide stepper UI
│   │   │   └── SettingsPanel.tsx       # Slide-in settings
│   │   ├── hooks/
│   │   │   ├── useExtensionState.ts    # Poll/subscribe to background state
│   │   │   ├── useSteps.ts
│   │   │   ├── useGuideState.ts
│   │   │   └── useContextMatches.ts
│   │   └── sidepanel.css              # Keep existing CSS, import in App.tsx
│   │
│   ├── popup/
│   │   ├── index.tsx                   # React entry
│   │   ├── App.tsx
│   │   └── popup.css
│   │
│   ├── shared/
│   │   ├── messages.ts                 # Message type union + payload types
│   │   ├── types.ts                    # Shared types (Step, Project, User, Guide, etc.)
│   │   ├── storage.ts                  # IndexedDB wrapper (from storage.js)
│   │   ├── search.ts                   # Search API client (from search.js)
│   │   └── constants.ts               # BUILD_CONFIG, MAX_STEPS, etc.
│   │
│   └── vendor/
│       └── rrweb-snapshot.min.js       # Keep as-is (no types needed)
│
├── public/
│   ├── sidepanel.html                  # Minimal HTML shell for React
│   ├── popup.html                      # Minimal HTML shell for React
│   └── icons/                          # Copied from current icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
│
├── manifest.json                       # Updated to point at dist/ outputs
├── vite.config.ts
├── tsconfig.json
├── package.json
└── tests/                              # Existing e2e tests (unchanged)
```

---

## Commit Sequence

### Commit 1: Package setup + Vite config + empty build

Create `package.json`, `vite.config.ts`, `tsconfig.json`. Verify `pnpm build` produces a `dist/` folder.

**Files to create:**

#### `extension/package.json`
```json
{
  "name": "@stept/extension",
  "private": true,
  "version": "1.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch --mode development",
    "build": "vite build",
    "build:cloud": "vite build --mode cloud",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@types/chrome": "^0.0.287",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

> **Note on `@crxjs/vite-plugin`**: This plugin handles MV3 quirks (service worker bundling, content script injection, HMR). If it causes issues with the current Vite version, fall back to manual multi-entry config (see Appendix A). Check compatibility before committing to it.

#### `extension/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["chrome"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

#### `extension/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Manual multi-entry config for Chrome Extension MV3
// Each entry becomes a separate bundle
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    'import.meta.env.BUILD_MODE': JSON.stringify(mode === 'cloud' ? 'cloud' : 'self-hosted'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode === 'development' ? false : 'esbuild',
    rollupOptions: {
      input: {
        // Service worker
        'background': resolve(__dirname, 'src/background/index.ts'),
        // Content scripts (no React — vanilla TS)
        'content': resolve(__dirname, 'src/content/index.ts'),
        'redaction': resolve(__dirname, 'src/content/redaction.ts'),
        'guide-runtime': resolve(__dirname, 'src/guide-runtime/index.ts'),
        // UI pages (React)
        'sidepanel': resolve(__dirname, 'public/sidepanel.html'),
        'popup': resolve(__dirname, 'public/popup.html'),
      },
      output: {
        // Content scripts + service worker must be single files (no code splitting)
        // Only sidepanel/popup can have shared chunks
        entryFileNames: (chunkInfo) => {
          if (['background', 'content', 'redaction', 'guide-runtime'].includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
```

> **Important**: Content scripts and service workers cannot use dynamic imports or code splitting in MV3. They must be single self-contained bundles. The Rollup config above handles this by naming them as flat entries. If Rollup tries to code-split shared modules between `content.js` and `background.js`, add `manualChunks` to prevent it, or use `inlineDynamicImports` per entry. Test the output to verify each is a standalone file.

#### `public/sidepanel.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stept</title>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="../src/sidepanel/index.tsx"></script>
</body>
</html>
```

#### `public/popup.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stept</title>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="../src/popup/index.tsx"></script>
</body>
</html>
```

**Verification**: `pnpm install && pnpm build` runs without errors. `dist/` contains `background.js`, `content.js`, `redaction.js`, `guide-runtime.js`, `sidepanel.html`, `popup.html`.

---

### Commit 2: Shared types + message protocol

Create the type foundations. These files are new — nothing to break.

#### `src/shared/messages.ts`

Extract every message type from the existing background.js switch statement. Every `case 'SOMETHING':` becomes a member of the union.

```ts
// ─── Message Types ──────────────────────────────────────────
// Extracted from background.js message handler (47 cases).
// DO NOT rename these strings — they are used across content scripts,
// sidepanel, popup, and guide-runtime.

export type BackgroundMessageType =
  // Auth
  | 'LOGIN'
  | 'LOGOUT'
  | 'CHECK_AUTH'
  // Recording
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'GET_STATE'
  // Steps
  | 'CLICK_EVENT'
  | 'TYPE_EVENT'
  | 'PRE_CAPTURE'
  | 'USER_ACTION'
  | 'GET_STEPS'
  | 'DELETE_STEP'
  | 'REORDER_STEPS'
  | 'SET_STEP_DESCRIPTION'
  | 'CLEAR_STEPS'
  // Upload
  | 'UPLOAD'
  // Settings
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'SET_DISPLAY_MODE'
  // Smart Blur
  | 'TOGGLE_SMART_BLUR'
  | 'GET_REDACTION_SETTINGS'
  // Guide
  | 'START_GUIDE'
  | 'STOP_GUIDE'
  | 'GUIDE_STEP_HEALTH'
  | 'GUIDE_STEP_CHANGED'
  | 'GUIDE_STOPPED'
  | 'GUIDE_NAVIGATE'
  | 'GUIDE_GO_TO_STEP'
  | 'GUIDE_FIND_IN_FRAMES'
  | 'GET_GUIDE_STATE'
  | 'FETCH_WORKFLOW_GUIDE'
  // API proxy
  | 'API_FETCH'
  | 'API_FETCH_BLOB'
  // Context
  | 'CHECK_CONTEXT_LINKS'
  | 'GET_CONTEXT_MATCHES'
  // Search
  | 'SEARCH';

// Messages sent FROM background TO content/sidepanel/popup
export type ContentMessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'SHOW_DOCK'
  | 'HIDE_DOCK'
  | 'HIDE_DOCK_TEMP'
  | 'SHOW_DOCK_TEMP'
  | 'TOGGLE_SMART_BLUR'
  | 'CLOSE_SMART_BLUR'
  | 'STEP_ADDED'
  | 'APPLY_REDACTION'
  | 'PING'
  // Guide
  | 'START_GUIDE'
  | 'STOP_GUIDE'
  | 'GUIDE_GOTO'
  | 'GUIDE_FIND_IN_FRAME';

// Broadcast messages (background → sidepanel)
export type BroadcastMessageType =
  | 'STEP_ADDED'
  | 'SCREENSHOT_FAILED'
  | 'MAX_STEPS_REACHED'
  | 'RECORDING_STATE_CHANGED'
  | 'CONTEXT_MATCHES_UPDATED'
  | 'GUIDE_STATE_UPDATE';

// Helper: send a typed message to background
export function sendToBackground<T = any>(
  message: { type: BackgroundMessageType; [key: string]: any }
): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || ({} as T));
    });
  });
}
```

> **Note**: Review the actual background.js switch statement to ensure ALL message types are captured. The list above is based on my reading — there may be 1-2 I missed. Grep for `case '` in background.js to get the exact list.

#### `src/shared/types.ts`

```ts
// ─── Core Types ─────────────────────────────────────────────
// Extracted from the runtime shape of objects in background.js, content.js,
// and sidepanel.js. All fields are based on actual usage, not aspirational.

export interface ElementInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  text: string;
  href: string | null;
  type: string | null;
  name: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  role: string | null;
  title: string | null;
  alt: string | null;
  associatedLabel: string | null;
  parentText: string | null;
  testId: string | null;
  elementRect: { x: number; y: number; width: number; height: number };
  // Enhanced capture fields
  selector: string | null;
  xpath: string | null;
  dataId: string | null;
  dataRole: string | null;
  ariaDescription: string | null;
  ariaLabelledby: string | null;
  parentChain: ParentChainEntry[] | null;
  siblingText: string[] | null;
  isInIframe: boolean;
  iframeSrc: string | null;
}

export interface ParentChainEntry {
  tag: string;
  id: string | null;
  role: string | null;
  ariaLabel: string | null;
  testId: string | null;
  className: string | null;
}

export interface CapturedStep {
  stepNumber: number;
  actionType: 'Left Click' | 'Right Click' | 'Double Click' | 'Type' | 'Key' | 'Select' | 'Navigate';
  description: string;
  pageTitle: string;
  url: string;
  timestamp: number;
  screenshotDataUrl?: string | null;
  screenshotRelativeMousePosition?: { x: number; y: number } | null;
  screenshotSize?: { width: number; height: number } | null;
  globalPosition?: { x: number; y: number };
  relativePosition?: { x: number; y: number };
  clickPosition?: { x: number; y: number };
  windowSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  elementInfo?: ElementInfo;
  domSnapshot?: string;
  textTyped?: string;
}

export interface ExtensionState {
  isAuthenticated: boolean;
  isRecording: boolean;
  isPaused: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: UserInfo | null;
  userProjects: Project[];
  selectedProjectId: string | null;
  steps: CapturedStep[];
  recordingStartTime: number | null;
  stepCount: number;
}

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface GuideStep {
  title?: string;
  description?: string;
  action_type?: string;
  selector?: string;
  xpath?: string;
  element_role?: string;
  element_text?: string;
  element_info?: Partial<ElementInfo>;
  expected_url?: string;
  url?: string;
  screenshot_url?: string;
  screenshot_relative_position?: { x: number; y: number };
  screenshot_size?: { width: number; height: number };
}

export interface Guide {
  id: string;
  title?: string;
  workflow_id?: string;
  workflowId?: string;
  steps: GuideStep[];
}

export interface ActiveGuideState {
  guide: Guide;
  tabId: number;
  currentIndex: number;
  stepStatus?: string;
}

export interface ContextMatch {
  resource_type: 'workflow' | 'document';
  resource_id: string;
  resource_name: string;
  match_type: string;
}

export interface RedactionSettings {
  enabled: boolean;
  emails: boolean;
  names: boolean;
  numbers: boolean;
  formFields: boolean;
  longText: boolean;
  images: boolean;
}

export interface BuildConfig {
  mode: 'self-hosted' | 'cloud';
  cloudApiUrl: string;
  defaultApiUrl: string;
}
```

#### `src/shared/constants.ts`

```ts
import type { BuildConfig } from './types';

export const BUILD_CONFIG: BuildConfig = {
  mode: (import.meta.env.BUILD_MODE as 'self-hosted' | 'cloud') || 'self-hosted',
  cloudApiUrl: 'https://app.stept.ai/api/v1',
  defaultApiUrl: 'http://localhost:8000/api/v1',
};

export const DEFAULT_API_BASE_URL =
  BUILD_CONFIG.mode === 'cloud'
    ? BUILD_CONFIG.cloudApiUrl
    : BUILD_CONFIG.defaultApiUrl;

export const MAX_STEPS = 100;
export const DEBUG = false;
export const DOUBLE_CLICK_MS = 400;
export const TYPING_DELAY = 1500;
export const STREAMING_CONCURRENCY = 2;
export const NAVIGATION_SUPPRESS_WINDOW = 5000;
```

#### `src/shared/storage.ts`

Direct port of `storage.js` — replace `self.screenshotDB = { ... }` with named exports:

```ts
// Direct port of storage.js — IndexedDB wrapper for screenshot blobs.
// The only change is: named exports instead of self.screenshotDB assignment.

const DB_NAME = 'stept-recordings';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  // ... exact same code as storage.js openDB() ...
}

export async function saveScreenshot(stepId: string, dataUrl: string): Promise<void> {
  // ... exact same code ...
}

export async function getScreenshot(stepId: string): Promise<string | null> {
  // ... exact same code ...
}

export async function getAllScreenshots(): Promise<Record<string, string>> {
  // ... exact same code ...
}

export async function deleteScreenshot(stepId: string): Promise<void> {
  // ... exact same code ...
}

export async function clearAllScreenshots(): Promise<void> {
  // ... exact same code ...
}

export async function migrateFromChromeStorage(): Promise<boolean> {
  // ... exact same code ...
}
```

> **Instruction**: Copy the function bodies EXACTLY from `storage.js`. Add TypeScript parameter and return types. Do not refactor.

#### `src/shared/search.ts`

Direct port of `search.js` with types added.

**Verification**: `pnpm typecheck` passes. No runtime changes.

---

### Commit 3: Background service worker — mechanical port

This is the biggest commit. Port `background.js` into `src/background/` split across files.

**Strategy**: Split the 2,088-line `background.js` by extracting functions into modules, keeping the message handler dispatch in `index.ts`. Each extracted module receives the `state` object as a parameter or import.

#### `src/background/state.ts`

Extract the state object and its persistence functions:

```ts
import type { ExtensionState, ActiveGuideState, ContextMatch } from '@/shared/types';

// ─── Mutable state (same as original background.js lines 35-50) ──────
// This is intentionally a mutable singleton. Do not refactor into a store
// during this migration. That's a separate task.

export const state: ExtensionState = {
  isAuthenticated: false,
  isRecording: false,
  isPaused: false,
  accessToken: null,
  refreshToken: null,
  currentUser: null,
  userProjects: [],
  selectedProjectId: null,
  steps: [],
  recordingStartTime: null,
  stepCount: 0,
};

// Module-level variables (same as original background.js)
export let activeGuideState: ActiveGuideState | null = null;
export let contextMatches: ContextMatch[] = [];
export let healthBatch: any[] = [];
export let healthBatchWorkflowId: string | null = null;
// ... etc — extract ALL module-level let/var declarations from background.js

export function setActiveGuideState(gs: ActiveGuideState | null) {
  activeGuideState = gs;
}

// Persistence functions — exact copies from background.js
export async function persistAuth(): Promise<void> {
  // ... exact code from background.js persistAuth() ...
}

export async function persistRecordingState(): Promise<void> {
  // ... exact code from background.js persistRecordingState() ...
}

export async function persistSteps(): Promise<void> {
  // ... exact code from background.js persistSteps() ...
}

export async function restoreState(): Promise<void> {
  // ... exact code from background.js (the chrome.storage.local.get block at init) ...
}
```

#### `src/background/auth.ts`

Extract: `handleLogin()`, `handleLogout()`, `authedFetch()`, `refreshAccessToken()`, PKCE helpers.

```ts
import { state } from './state';
import { DEFAULT_API_BASE_URL } from '@/shared/constants';

export async function handleLogin(): Promise<{ success: boolean; error?: string }> {
  // ... exact code from background.js LOGIN case ...
}

export async function handleLogout(): Promise<void> {
  // ... exact code ...
}

export async function authedFetch(url: string, options?: RequestInit): Promise<Response> {
  // ... exact code ...
}

export async function refreshAccessToken(): Promise<boolean> {
  // ... exact code ...
}
```

#### `src/background/recording.ts`

Extract: `startRecording()`, `stopRecording()`, `pauseRecording()`, `resumeRecording()`, `addStep()`, `ensureContentScript()`.

#### `src/background/upload.ts`

Extract: streaming upload logic, `finalizeUpload()`.

#### `src/background/guides.ts`

Extract: guide start/stop/navigate, `_injectGuideNow()`, `_injectGuideAfterLoad()`, health batch handling.

#### `src/background/navigation.ts`

Extract: `trackPageChange()`, `markUserAction()`, tab listeners, `checkContextLinks()`.

#### `src/background/settings.ts`

Extract: `getApiBaseUrl()`, settings get/set handlers.

#### `src/background/api.ts`

Extract: `authedFetch()`, `API_FETCH` handler, `API_FETCH_BLOB` handler.

#### `src/background/index.ts`

The main entry. Imports all modules, sets up the message listener, event listeners:

```ts
import { state, restoreState } from './state';
import { handleLogin, handleLogout } from './auth';
import { startRecording, stopRecording, pauseRecording, resumeRecording, addStep } from './recording';
import { finalizeUpload } from './upload';
// ... etc

// Restore state on service worker startup
restoreState();

// ─── Message Handler ────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Keep the switch statement structure from background.js.
  // Each case delegates to an imported function.
  // Do NOT restructure this into a dispatch map during migration.

  (async () => {
    switch (message.type) {
      case 'LOGIN': {
        const result = await handleLogin();
        sendResponse(result);
        break;
      }
      case 'LOGOUT': {
        await handleLogout();
        sendResponse({ success: true });
        break;
      }
      case 'START_RECORDING': {
        await startRecording(message.projectId);
        sendResponse({ success: true });
        break;
      }
      // ... all 47 cases, each delegating to imported functions ...
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true;
});

// ─── Event Listeners ────────────────────────────────────────
// Tab activation, navigation, commands — exact copies from background.js
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // ... exact code ...
});

// ... etc
```

> **Critical instruction**: When extracting functions, do NOT change:
> - The `async () => { switch ... }` wrapper pattern in the message listener
> - The `return true` at the end (required for async `sendResponse`)
> - Any `setTimeout` / `setInterval` timing values
> - Any `.catch(() => {})` patterns (they're intentional for MV3 message-to-nonexistent-listener)
> - The order of operations in `addStep()` — pre-capture await, screenshot, streaming upload are sequenced carefully

**Verification**: Load extension. Sign in. Select project. Start recording. Click 5 things on a page. Complete capture. Verify upload succeeds and workflow appears in web app. Test dock mode. Test smart blur. Test pause/resume.

---

### Commit 4: Content scripts — mechanical port to TypeScript

Port `content.js` → `src/content/index.ts` (+ sub-modules), `redaction.js` → `src/content/redaction.ts`.

These stay as vanilla TypeScript — **NO React, NO JSX**.

#### `src/content/index.ts`

The entry point. Same IIFE structure but using TypeScript:

```ts
// Content script entry — injected into pages.
// NO React. This runs in page context inside a shadow DOM.
// Must stay lightweight and self-contained.

import { startCapturing, stopCapturing } from './capture';
import { createDock, removeDock, incrementDockSteps, updateDockPauseUI } from './dock';
import { createSmartBlurPopup, closeSmartBlur, removeSmartBlur, toggleSmartBlur } from './smart-blur';

// ... message listener, init check — exact port of content.js lines 580-690 ...
```

#### `src/content/capture.ts`

Extract: `handleClick()`, `handleKeydown()`, `handleFocusIn()`, `handleFocusOut()`, `flushTypedText()`, `sendClickStep()`.

#### `src/content/elements.ts`

Extract: `gatherElementInfo()`, `generateStableSelector()`, `generateXPath()`, `getParentChain()`, `getSiblingText()`, `getAssociatedLabel()`, `getBestLabel()`, `generateClickDescription()`.

#### `src/content/dock.ts`

Extract: dock shadow DOM creation, `createDock()`, `removeDock()`, `updateDockDisplay()`, `updateDockPauseUI()`.

All inline CSS strings stay as-is (do NOT extract to CSS files — they're injected into shadow DOMs).

#### `src/content/smart-blur.ts`

Extract: smart blur popup shadow DOM creation, `createSmartBlurPopup()`, `closeSmartBlur()`, `toggleSmartBlur()`.

#### `src/content/redaction.ts`

Direct port of `redaction.js` to TypeScript. Keep the IIFE structure because it's injected separately. Keep `window.__steptRedaction = { ... }` — the content script accesses it via this global.

```ts
// PII Redaction Module — injected separately from content.ts.
// Communicates with content.ts via window.__steptRedaction global.
// Keep IIFE structure — this is injected via chrome.scripting.executeScript.

declare global {
  interface Window {
    __steptRedaction?: {
      applyCategory: (category: string) => number;
      removeCategory: (category: string) => void;
      applyAllEnabled: () => number;
      removeAll: () => void;
      toggleCategory: (category: string, enabled: boolean) => number;
      loadSettings: () => Promise<RedactionSettings>;
      getSettings: () => RedactionSettings;
    };
  }
}

(function () {
  'use strict';
  // ... exact code from redaction.js ...
})();
```

#### `src/content/dom-snapshot.ts`

```ts
// rrweb snapshot wrapper

declare const rrwebSnapshot: {
  snapshot: (doc: Document, opts: any) => any;
};

export function captureDomSnapshot(): string | null {
  // ... exact code from content.js captureDomSnapshot() ...
}
```

**Verification**: Same as Commit 3 — full recording flow on Windows.

---

### Commit 5: Guide runtime — mechanical port to TypeScript

Port `guide-runtime.js` → `src/guide-runtime/index.ts`.

This stays as a **single file IIFE** because it's injected on demand via `chrome.scripting.executeScript`. It cannot import other modules.

```ts
// Guide Runtime — injected on demand into pages.
// MUST remain a single self-contained IIFE.
// NO imports, NO React, NO module splitting.

(function () {
  'use strict';

  // ... exact code from guide-runtime.js ...
  // Add TypeScript types inline (not imported — this file is standalone)

  interface GuideStep { /* ... */ }
  interface Guide { /* ... */ }
  interface FindResult {
    element: Element;
    confidence: number;
    method: string;
    iframeOffset?: { x: number; y: number };
  }

  // ... rest of guide-runtime.js exactly as-is ...
})();
```

> **Important**: Vite must output this as a single file without code splitting. Verify `dist/guide-runtime.js` is self-contained. If Vite tries to extract shared code, configure `rollupOptions` to inline everything for this entry.

**Verification**: Start a guide from the sidepanel. Verify element highlighting, tooltip positioning, click advance, back/skip/next buttons, roadblock detection, URL mismatch warning, completion detection.

---

### Commit 6: Sidepanel — React rewrite

This is the first commit that actually changes UI technology. The sidepanel communicates with background ONLY via `chrome.runtime.sendMessage` — it has no direct dependency on content scripts.

#### `src/sidepanel/index.tsx`

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './sidepanel.css';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

#### `src/sidepanel/App.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { sendToBackground } from '@/shared/messages';
import type { ExtensionState } from '@/shared/types';
import { Header } from './components/Header';
import { LoginPanel } from './components/LoginPanel';
import { SetupPanel } from './components/SetupPanel';
import { StepsList } from './components/StepsList';
import { UploadPanel } from './components/UploadPanel';
import { RecordingFooter } from './components/RecordingFooter';
import { SettingsPanel } from './components/SettingsPanel';
import { GuideStepsPanel } from './components/GuideStepsPanel';

export function App() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState(false);
  // ... etc

  // Poll state on mount + listen for broadcasts
  useEffect(() => {
    refreshState();

    const listener = (message: any) => {
      if (message.type === 'STEP_ADDED') { /* ... */ }
      if (message.type === 'RECORDING_STATE_CHANGED') refreshState();
      if (message.type === 'CONTEXT_MATCHES_UPDATED') { /* ... */ }
      if (message.type === 'GUIDE_STATE_UPDATE') { /* ... */ }
      // ... exact same handlers as sidepanel.js chrome.runtime.onMessage.addListener
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function refreshState() {
    const s = await sendToBackground<ExtensionState>({ type: 'GET_STATE' });
    setState(s);
    // ... same logic as sidepanel.js refreshState()
  }

  if (!state) return null;

  if (!state.isAuthenticated) return <LoginPanel onLogin={refreshState} />;
  if (!state.isRecording) return <SetupPanel state={state} onStart={refreshState} />;
  if (uploadMode) return <UploadPanel steps={steps} onDone={...} />;
  return (
    <>
      <Header state={state} onSettingsClick={() => setSettingsOpen(true)} />
      <StepsList steps={steps} onDelete={...} onReorder={...} onDescriptionChange={...} />
      <RecordingFooter onPause={...} onComplete={...} onDelete={...} onSmartBlur={...} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
```

> **Key instruction for each component**: Port the exact HTML structure from `sidepanel.html` and the exact event handlers from `sidepanel.js`. The React components should produce the same DOM as the current innerHTML templates. Use the existing `sidepanel.css` unchanged — just import it.

#### Component mapping (sidepanel.js → React):

| Current code | React component | Source lines |
|---|---|---|
| `spLoginPanel` div + `spLoginBtn` handler | `LoginPanel.tsx` | sidepanel.js 501-520 |
| `spSetupPanel` div + project selector + start | `SetupPanel.tsx` | sidepanel.js 95-155 |
| `createStepCard()` function | `StepCard.tsx` | sidepanel.js 201-320 |
| Steps list + empty state | `StepsList.tsx` | sidepanel.js 160-200 |
| Upload panel | `UploadPanel.tsx` | sidepanel.js 350-440 |
| Recording footer | `RecordingFooter.tsx` | sidepanel.js 443-500 |
| Settings slide-in | `SettingsPanel.tsx` | sidepanel.js 47-92 |
| Search bar + results | `SearchBar.tsx` | sidepanel.js 560-660 |
| Context links panel | `ContextLinks.tsx` | sidepanel.js 665-720 |
| Recent workflows + play buttons | `RecentWorkflows.tsx` | sidepanel.js 725-835 |
| Guide steps stepper | `GuideStepsPanel.tsx` | sidepanel.js 838-1060 |

> **For each component**: Look at the referenced lines in `sidepanel.js`. The React component must produce identical DOM structure so `sidepanel.css` selectors still match. Use the same class names. When the current code does `element.innerHTML = \`...\``, convert that template to JSX.

**Specific gotchas to handle:**

1. **Step card inline editing**: The current code uses `contentEditable` + `blur`/`keydown` handlers. Port this exactly — don't replace with a controlled `<input>`.

2. **Drag and drop reordering**: Current code uses native drag events on `.step-drag-handle`. Port the exact `dragstart`/`dragover`/`drop` handlers.

3. **Screenshot zoom overlay**: Current code creates a full-screen overlay div on click. Port as a React portal or simple state-driven overlay.

4. **Guide step images**: `_loadStepImage()` fetches via `API_FETCH_BLOB` and caches in `_guideImageCache`. Port the cache as a module-level `Map` or `useRef`.

5. **Toast**: `showToast()` creates a temporary DOM element. Convert to React state.

6. **`escapeHtml()`**: In React, JSX auto-escapes. Replace `${escapeHtml(text)}` with `{text}` in JSX. But be careful with `dangerouslySetInnerHTML` — avoid it.

**Verification**: Every UI interaction in the sidepanel must work identically:
- [ ] Sign in flow
- [ ] Project selector populates
- [ ] Start recording → steps appear live
- [ ] Step description inline edit (click, type, Enter to save, Escape to cancel)
- [ ] Step drag reorder
- [ ] Step delete
- [ ] Screenshot click → zoom overlay
- [ ] Pause/resume button
- [ ] Smart blur button → content script popup opens
- [ ] Complete → upload → redirect to workflow
- [ ] Search bar with debounce
- [ ] Context links for current URL
- [ ] Recent workflows with play buttons
- [ ] Guide stepper (start guide → steps update → roadblock → images load)
- [ ] Settings panel (display mode, API URL, auto-upload toggle, logout)

---

### Commit 7: Popup — React rewrite

Same approach as sidepanel but smaller. Port `popup.js` + `popup.html` + `popup.css`.

**Verification**: Click extension icon in toolbar. Verify popup shows correct state (not recording → show start, recording → show controls).

---

### Commit 8: Update manifest.json

Point manifest at the built files in `dist/`:

```json
{
  "manifest_version": 3,
  "name": "Stept — Process Documentation",
  "version": "1.0.1",
  "description": "Capture and document workflows automatically",
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["vendor/rrweb-snapshot.min.js", "redaction.js", "content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "toggle-recording": {
      "suggested_key": { "default": "Ctrl+Shift+E" },
      "description": "Start or stop recording"
    },
    "pause-recording": {
      "suggested_key": { "default": "Ctrl+Shift+P" },
      "description": "Pause or resume recording"
    }
  },
  "permissions": [
    "activeTab",
    "tabs",
    "storage",
    "sidePanel",
    "scripting",
    "webNavigation",
    "identity"
  ],
  "host_permissions": ["<all_urls>"]
}
```

> **Note**: The manifest must reference files as they appear in `dist/`. If Vite outputs `assets/sidepanel-XXXX.html`, configure Vite to output `sidepanel.html` at the root of `dist/`. The `vendor/rrweb-snapshot.min.js` must be copied to `dist/vendor/` — configure Vite's `publicDir` or a copy plugin.

**Update the Vite config** to:
1. Copy `src/vendor/rrweb-snapshot.min.js` → `dist/vendor/rrweb-snapshot.min.js`
2. Copy `manifest.json` → `dist/manifest.json`
3. Copy `public/icons/` → `dist/icons/`
4. Ensure HTML outputs are at `dist/sidepanel.html` and `dist/popup.html` (not nested in `assets/`)

**Verification**: `pnpm build`, then load `extension/dist/` in Chrome. Full test suite:
- [ ] Extension loads without errors in chrome://extensions
- [ ] Service worker starts (check in chrome://serviceworker-internals)
- [ ] Content script injects on page load
- [ ] Full capture flow: start → click → type → complete → upload
- [ ] Dock mode
- [ ] Smart blur with all categories
- [ ] Guide playback from recent workflows
- [ ] Keyboard shortcuts (Ctrl+Shift+E, Ctrl+Shift+P)
- [ ] Context links badge on toolbar icon
- [ ] Service worker restart recovery (navigate to chrome://extensions, click "Service Worker" → "Terminate", verify recording resumes)
- [ ] Auth token refresh during recording
- [ ] Search

---

### Commit 9: Cleanup

Remove the old root-level `.js`, `.html`, `.css` files that are now in `src/`. Keep `tests/` and `vendor/` in place.

Update the monorepo `pnpm-workspace.yaml` if needed (extension should already be listed).

Add to root `turbo.json`:
```json
{
  "extension#build": {
    "outputs": ["dist/**"]
  }
}
```

**Verification**: `pnpm build` from monorepo root builds the extension. `pnpm --filter @stept/extension build` works standalone.

---

## Appendix A: Vite Config Without @crxjs/vite-plugin

If `@crxjs/vite-plugin` causes issues (it's beta and may not support Vite 6), use this manual approach:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'copy-extension-assets',
      closeBundle() {
        // Copy manifest
        copyFileSync('manifest.json', 'dist/manifest.json');
        // Copy vendor
        mkdirSync('dist/vendor', { recursive: true });
        copyFileSync('src/vendor/rrweb-snapshot.min.js', 'dist/vendor/rrweb-snapshot.min.js');
        // Copy icons
        mkdirSync('dist/icons', { recursive: true });
        for (const size of ['16', '32', '48', '128']) {
          const src = `public/icons/icon${size}.png`;
          if (existsSync(src)) copyFileSync(src, `dist/icons/icon${size}.png`);
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        redaction: resolve(__dirname, 'src/content/redaction.ts'),
        'guide-runtime': resolve(__dirname, 'src/guide-runtime/index.ts'),
        sidepanel: resolve(__dirname, 'public/sidepanel.html'),
        popup: resolve(__dirname, 'public/popup.html'),
      },
      output: {
        entryFileNames: (chunk) => {
          // Service worker + content scripts must be flat files, no hash
          const flatEntries = ['background', 'content', 'redaction', 'guide-runtime'];
          if (flatEntries.includes(chunk.name)) return '[name].js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
```

> **Code splitting caveat**: If Rollup extracts shared code between `background.js` and `content.js` into a shared chunk, the content script won't load (it can't resolve relative imports in page context). To prevent this, you may need separate Vite builds for content scripts vs. the rest. A pragmatic solution: build content scripts + guide-runtime + redaction as a separate Vite invocation with `build.lib` mode, and the rest (background + sidepanel + popup) as the main build.

---

## Appendix B: What Must Not Change (Behavioral Invariants)

These are the behaviors that must be identical before and after migration. If any of these break, the migration has a bug.

1. **Pre-capture timing**: `pointerdown` → `PRE_CAPTURE` message → background starts `captureVisibleTab` → `CLICK_EVENT` arrives → background awaits the pre-capture if still in flight. The ordering matters.

2. **Double-click detection**: 400ms window. Single click is delayed by 400ms. If second pointerdown arrives on same target within 400ms, cancel the pending single click and send double-click.

3. **Navigate step suppression**: After any `USER_ACTION` message, all `trackPageChange` calls within 5000ms are suppressed.

4. **Streaming upload**: Screenshots upload in parallel (concurrency 2) during recording. On upload finalize, only un-uploaded screenshots are sent.

5. **Service worker state persistence**: Auth, recording state, and steps are persisted to `chrome.storage.local` and `chrome.storage.session`. On SW restart, state is restored and recording continues.

6. **Guide element finder cascade**: selector (1.0) → testid (0.95) → role+text (0.85) → tag+text fuzzy (0.70) → xpath (0.60) → parent-chain (0.50). Search order: document → shadow roots → same-origin iframes → cross-origin iframes via background.

7. **Guide 100ms polling**: Element polling runs every 100ms. Roadblock shown after 30 ticks (3 seconds) of not finding the element. Polling continues even after showing roadblock.

8. **Guide overlay isolation**: Shadow DOM with `mode: 'closed'`. Inert attribute protection via MutationObserver. Zoom compensation. All pointer/click/mousedown events on tooltip call `stopPropagation()`.

9. **Click advance on links**: Uses `pointerdown` (not `click`) for `<a>` elements and `[role="option"]` to fire before navigation.

10. **Redaction WeakMap**: Original values stored in WeakMap for full reversibility. Bullet character replacement for form fields, CSS blur for text/images.

11. **Content script injection order**: `rrweb-snapshot.min.js` → `redaction.js` → `content.js`. The content script depends on `window.__steptRedaction` being available.

12. **IndexedDB migration**: On first load, screenshots are migrated from `chrome.storage.local` (`persistedSteps[].screenshotDataUrl`) to IndexedDB, and `persistedSteps` entries are updated to `idb:step_N` references.

---

## Appendix C: Testing Checklist

Run this after each commit on Windows:

### Basic flow
- [ ] Load extension in Chrome → no errors in chrome://extensions
- [ ] Click extension icon → popup appears
- [ ] Open side panel → login page shows
- [ ] Sign in → project list loads
- [ ] Select project → Start Capture enables
- [ ] Start Capture → recording badge shows, dot pulses

### Capture
- [ ] Left click on button → step captured with correct description
- [ ] Right click → step captured as "Right Click"
- [ ] Double click → single step "Double Click" (not two single clicks)
- [ ] Type in input field → step captured as "Type ..."
- [ ] Press Enter → step captured as "Press Enter"
- [ ] Ctrl+C → step captured as "Press Ctrl+C"
- [ ] Navigate to new URL (address bar) → Navigate step captured
- [ ] Click a link → NO navigate step (suppressed by 5s window)
- [ ] Click in new tab → content script injects, recording continues
- [ ] Screenshots show click marker at correct position

### Smart Blur
- [ ] Click blur button → capture pauses, blur popup appears
- [ ] Toggle email category → emails blur on page
- [ ] Toggle off → emails unblur
- [ ] Click Done → capture resumes

### Dock Mode
- [ ] Switch to dock in settings → dock appears on page edge
- [ ] Dock shows step count + timer
- [ ] Dock pause/resume works
- [ ] Dock complete → upload + redirect
- [ ] Dock delete → confirms, clears, removes dock

### Upload
- [ ] Complete → auto-upload with progress bar
- [ ] Success → redirect to workflow in web app
- [ ] Failure → error message, can retry

### Guide Playback
- [ ] Recent workflows show play button for guides
- [ ] Click play → guide starts, overlay appears on page
- [ ] Element highlighted with green ring + backdrop cutout
- [ ] Tooltip shows step description + progress bar
- [ ] Click target element → auto-advances to next step
- [ ] Back/Skip/Next buttons work
- [ ] URL mismatch → "Navigate to page" button
- [ ] Element not found after 3s → roadblock UI
- [ ] Complete all steps → guide stops
- [ ] Close button → guide stops

### Service Worker Resilience
- [ ] During recording: go to chrome://serviceworker-internals → find Stept → click "Stop"
- [ ] Return to page → recording state restored, can continue
- [ ] Steps captured before restart are preserved

### Settings
- [ ] API URL save works
- [ ] Frontend URL save works
- [ ] Display mode toggle persists
- [ ] Auto-upload toggle persists
- [ ] Logout clears state

### Search & Context
- [ ] Type in search bar → results appear (debounced)
- [ ] Click result → opens in new tab
- [ ] Navigate to a URL with context links → badge shows count
- [ ] Context links panel shows related content
