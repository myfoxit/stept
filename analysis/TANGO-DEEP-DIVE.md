# Tango Replay Architecture — Deep Dive

## The Fundamental Architecture

Tango does NOT work like Stept. At all. Here's how it actually works:

### 1. The Overlay Is a REACT APP Injected Into The Page

Tango's content script (`content-entry.js`) bootstraps a Shadow DOM element and then injects a **full React application** (`overlay.js`) into it. This React app:
- Subscribes to the XState machine's state via `K()` (a `useSelector` hook)
- Runs element finding in a **100ms `setInterval` polling loop** (not MutationObserver!)
- Renders highlights, tooltips, step advancement UI

The key code (Bw2Vl8wp.js ~line 2748):
```javascript
var Ta = 100; // 100ms polling interval
// ...
if (u.enableAutomatix) (v(), (e = setInterval(v, Ta)));
// cleanup: clearInterval(e)
```

### 2. State Machine Lives in Service Worker

Tango uses **XState** for state management. The machine (`BtgoBnV8.js`) tracks:
- `highlightedBlockId` — current step being shown
- `findElementResult` — result of element search (set by content script)
- `paused` — `None`, `Manual`, `UntilSuitableTab`, `AutomationOnly`
- `workflow` — the full workflow data
- `completedBlocks`, `skippedBlocks` — progress

The content script sends events to this machine:
```javascript
Y()?.send({ type: 'setHighlightedBlock', blockId: nextStepId })
Y()?.send({ type: 'setFindElementResult', findElementResult: result })
Y()?.send({ type: 'setPaused', paused: 'UntilSuitableTab' })
```

### 3. How Navigation Works (The Critical Difference)

**On page load / tab activation**, the service worker:
1. Calls `$(tab)` which checks if the tab URL matches any step URL
2. If URL doesn't match: `setPaused: UntilSuitableTab` → element finding stops
3. If URL matches: `setPaused: None` → element finding resumes
4. Calls `k(m.Viewing)` which broadcasts `CurrentRoute: Viewing` to the content script

**The content script** (`content-entry.js`):
1. On init (every page load), calls `c({ name: n.CurrentRoute })` — PULLS state from background
2. Background responds with current route via `we(sender)` 
3. If route is `Viewing`, the overlay React app mounts
4. React app subscribes to XState state → reads `highlightedBlockId` → starts element finding

**On SPA navigation** (pushState/replaceState):
- Chrome fires `tabs.onUpdated` with `status: complete` 
- Service worker's handler: `q(n.id, { name: i.TabUpdated }), $(n)` 
- `TabUpdated` message goes to content script, which can trigger overlay re-evaluation
- `$(n)` updates pause state and re-broadcasts route

**The content script does NOT need to re-inject.** It's always there. The React overlay app is ALSO always there (once mounted). Element finding runs on a 100ms interval forever — it just checks `paused` state and `highlightedBlockId` before doing work.

### 4. Step Advancement

When user clicks the highlighted element:
- Click is captured by the overlay's React event handlers
- Calls `markStepAsCompleted(stepId)` 
- Which sends `setHighlightedBlock` to advance to next step
- The 100ms polling loop picks up the new `highlightedBlockId` and finds the new element

There is NO `setTimeout` for step advancement. It's reactive — state change triggers re-render which triggers new element search.

### 5. Why Tango Never Has Navigation Problems

1. **Content script + overlay React app are always mounted** — never destroyed on SPA navigation
2. **Element finding is a continuous poll** (100ms interval), not event-driven retry chains
3. **Pause/unpause is the synchronization mechanism** — not re-injection
4. **State machine is single source of truth** — content script reads from it, never owns state
5. **No race conditions** — there's only one place state changes (XState machine), and React handles reactivity

## How This Maps to Stept's Problems

### Current Stept Issues:

1. **guide-runtime is destroyed and recreated on `START_GUIDE`** — Tango's overlay persists across navigations
2. **Element finding uses retry chains with escalating delays** — Tango uses continuous 100ms polling
3. **Step advancement uses `setTimeout(80ms)` + `activateStep`** — Tango uses reactive state updates
4. **Background pushes `START_GUIDE` on every nav event** — Tango broadcasts route, content script decides what to do
5. **Dedup event kills the existing overlay** — Tango's overlay just updates in place

### What Stept Should Change:

**Option A: Full Tango Port (Major rewrite)**
- Build XState machine in service worker
- Make guide-runtime a persistent React-like system
- Use continuous polling for element finding
- Use pause/unpause for navigation sync

**Option B: Minimal Changes to Match Tango's Key Patterns**
1. **Don't destroy/recreate on `START_GUIDE`** — if same guide + same/newer step, just update in place
2. **Use continuous polling (setInterval 150ms)** instead of retry chains with escalating delays
3. **Make step advancement synchronous** — no setTimeout, just immediately call activateStep
4. **Content script PULLS state on init** instead of background pushing — on page load, content script sends `GUIDE_RUNTIME_READY`, background responds with current state, content script picks up from there
5. **Don't re-inject guide-runtime.js** — it's in the manifest, always present. On SPA nav, the existing instance handles it.

The core insight: **Tango's system is PULL-based (content script pulls state) while Stept's is PUSH-based (background pushes commands). Push creates races. Pull doesn't.**
