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
| 4 | Type "xxxx" |
| 5 | Click "Create Secret Key" |
| 6 | Click "Copy" |
| 7 | Click "Done" |

---


**Scribe workflow title:** "Create a secret API key in OpenAI"

---

## Scoring

For each step, score 0–2:
- **2** — exact or equivalent (correct verb + correct label)
- **1** — correct action, wrong/partial label (e.g. window title instead of element name)
- **0** — wrong action, missing step, or completely wrong label

Title scored separately: **0–2**
- **2** — matches intent (e.g. "Create API key in OpenAI" or similar)
- **1** — generic but not wrong (e.g. "API keys - OpenAI API")
- **0** — missing or garbage

**Max score: 16 (7 steps × 2 + title × 2)**

---

## Results

| Commit | Date | Title | Steps | Total | Notes |
|--------|------|-------|-------|-------|-------|
| `a8ea37f` | 2026-03-03 | ?/2 | ?/14 | ?/16 | needs re-run with title tracked |

---

## How to Run

1. `git pull`
2. `cd native\windows && dotnet publish -c Release -r win-x64 --self-contained`
3. `npm run dev:electron`
4. Start recording
5. Do exactly: switch to OpenAI tab → Create new secret key → click name field → type name → Create Secret Key → Copy → Done
6. Stop recording
7. Note the **workflow title** Ondoki generates
8. Note **every step description** exactly as shown
9. Add a row to Results + raw output section below

---

## Raw Ondoki Output Log

*(add an entry here after each benchmark run — include title + all steps verbatim)*

### `a8ea37f` — 2026-03-03

**Title:** *(not recorded — re-run needed)*

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

Score breakdown vs gold standard:

| # | Gold | Ondoki | Score | Note |
|---|------|--------|-------|------|
| Title | "Create a secret API key in OpenAI" | *(not recorded)* | ?/2 | |
| 1 | Switch to Tab "OpenAI API" | Click "API keys - OpenAI API - Google Chrome" | 1/2 | Window title, not tab; " - Google Chrome" not stripped |
| 2 | Click "Create new secret key" | Click "API keys - OpenAI API - Google Chrome" | 0/2 | Grabbed window title, missed button |
| 3 | Click in Field "My Test Key" | Click "API keys - OpenAI API" | 0/2 | Page title, UIA can't read placeholder |
| 4 | Type "xxxx" | Type "x" / Type "fdf" | 1/2 | Type detected but split into 2 steps; label is page title not field |
| 5 | Click "Create Secret Key" | Click "Create secret key" | 2/2 ✅ | |
| 6 | Click "Copy" | Click "Copy" | 2/2 ✅ | |
| 7 | Click "Done" | Click "Done" | 2/2 ✅ | |
| **Total** | | | **8/16** | |

---

## Known Failure Modes

| Symptom | Likely Cause |
|---------|-------------|
| "Click here" on every step | element data null / UIA not working |
| "Click 'API keys - OpenAI API - Google Chrome'" | nameFromParent, window title includes Chrome suffix |
| Steps out of order (type before click) | keys/scrolls bypassing unified queue |
| Missing steps | tab-change click filtered, or click dropped |
| Type split into multiple steps | keypress grouping logic too aggressive |
