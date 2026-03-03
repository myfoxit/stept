# Step Description Benchmark — "Create API Key in OpenAI"

This file tracks step description quality across commits.
Run the same recording each time: navigate to platform.openai.com → API keys → create a key named "My Test Key".

---

## Gold Standard (Scribe)

| # | Description |
|---|-------------|
| 1 | Switch to Tab "OpenAI API" |
| 2 | Click on "Create new secret key" |
| 3 | Click in Field "My Test Key" (placeholder shown in grey) |
| 4 | Click "Create Secret Key" |
| 5 | Click "Copy" |
| 6 | Click "Done" |

---

## Scoring

For each step, score 0–2:
- **2** — exact or equivalent (correct verb + correct label)
- **1** — correct action, wrong/partial label (e.g. window title instead of element name)
- **0** — wrong action, missing step, or completely wrong label

**Max score: 12**

---

## Results

| Commit | Date | Score | Notes |
|--------|------|-------|-------|
| `1449b03` | 2026-03-02 | -/12 | UIA added, but path wrong (net8.0 vs net8.0-windows), element data null |
| `a34a30c` | 2026-03-02 | -/12 | Path fixed, UIA data flowing but deadlock in hook → ordering broken |
| `20f1160` | 2026-03-02 | ~4/12 | nameFromParent penalty, some correct, ordering sometimes wrong |
| `e60609b` | 2026-03-03 | -/12 | Unified queue (ordering fixed), smart element detection — untested |
| `a8ea37f` | 2026-03-03 | 8/12 | See detailed breakdown below |

---

## Detailed Breakdown — `a8ea37f` (2026-03-03) — Score: 8/12

| # | Gold Standard | Ondoki Output | Score | Root Cause |
|---|--------------|---------------|-------|------------|
| 1 | Switch to Tab "OpenAI API" | Click "API keys - OpenAI API - Google Chrome" | 1/2 | nameFromParent=true; window title includes " - Google Chrome" suffix not stripped |
| 2 | Click "Create new secret key" | Click "API keys - OpenAI API - Google Chrome" | 0/2 | nameFromParent=true; UIA walks up to window title, misses the button entirely |
| 3 | *(n/a — Scribe skips)* | Type "x" | -/- | Extra accidental keypress, both tools handle differently |
| 4 | Click in Field "My Test Key" | Click "API keys - OpenAI API" | 0/2 | nameFromParent=true; UIA walks up to page title, placeholder not exposed via UIA |
| 5 | *(type step)* | Type "fdf" in "API keys - OpenAI API" | 1/2 | Correct verb, but field context label is page title not field name |
| 6 | Click "Create Secret Key" | Click "Create secret key" | 2/2 ✅ | Button has explicit accessible name via UIA |
| 7 | Click "Copy" | Click "Copy" | 2/2 ✅ | Button has explicit accessible name via UIA |
| 8 | Click "Done" | Click "Done" | 2/2 ✅ | Button has explicit accessible name via UIA |

### What works
- Buttons with explicit accessible names (Create Secret Key, Copy, Done) → perfect
- Type steps detected and grouped correctly
- Ordering correct (unified queue fix from e60609b working)
- All 6 steps captured (no missing clicks)

### What fails
- **nameFromParent=true elements**: UIA can't find the clicked element's name, walks up to window/page title
- **Tab bar clicks**: Chrome tab element has no accessible name → falls back to window title + " - Google Chrome"
- **Input field placeholder**: UIA doesn't expose placeholder text; would need Chrome extension DOM access
- **"Create new secret key" button**: UIA should be able to find this (it's a real button) — unclear why it walks up to page title instead

### Next investigation needed (before any fixes)
1. Why does "Create new secret key" button not resolve via UIA? (Step 2 — should score 2)
2. Does `shortenWindowTitle()` not strip "- Google Chrome"? (Step 1 — should be 1.5/2 at least)
3. What does `nameFromParent` penalty currently do — is 0.4 below the 0.6 threshold? If so why are nameFromParent labels still showing?

---

## How to Run

1. `git pull`
2. `cd native\windows && dotnet publish -c Release -r win-x64 --self-contained`
3. `npm run dev:electron`
4. Start recording
5. Do exactly: switch to OpenAI tab → Create new secret key → type "My Test Key" → Create Secret Key → Copy → Done
6. Stop recording
7. Compare steps shown in Ondoki to Gold Standard above
8. Add a row to Results + detailed breakdown section

---

## Known Failure Modes

| Symptom | Likely Cause |
|---------|-------------|
| "Click here" on every step | element data null / UIA not working |
| "Click 'API keys - OpenAI API - Google Chrome'" | nameFromParent, window title not stripped |
| Steps out of order (type before click) | keys/scrolls bypassing unified queue |
| Missing steps | tab-change click filtered, or click dropped |
| "Click '2. März 2026'" | DataItem row (date) detected instead of button |

---

## Raw Ondoki Output Log

### `a8ea37f` — 2026-03-03

```
1. Click "API keys - OpenAI API - Google Chrome"
2. Click "API keys - OpenAI API - Google Chrome"
3. Type "x"
4. Click "API keys - OpenAI API"
5. Type "fdf" in "API keys - OpenAI API"
6. Click "Create secret key"
7. Click "Copy"
8. Click "Done"
```
