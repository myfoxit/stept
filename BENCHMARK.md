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
- **1** — correct action, wrong/partial label (e.g. "Click here" or parent title)
- **0** — wrong action, missing step, or completely wrong label

**Max score: 12**

---

## Results

| Commit | Date | Score | Notes |
|--------|------|-------|-------|
| `1449b03` | 2026-03-02 | -/12 | UIA added, but path wrong (net8.0 vs net8.0-windows), element data null |
| `a34a30c` | 2026-03-02 | -/12 | Path fixed, UIA data flowing but deadlock in hook → ordering broken |
| `20f1160` | 2026-03-02 | ~4/12 | nameFromParent penalty, some correct, ordering sometimes wrong |
| `e60609b` | 2026-03-03 | ?/12 | Unified queue (ordering fixed), smart element detection — needs test |
| `a8ea37f` | 2026-03-03 | 8/12 | Steps 6-8 perfect. Steps 1,2,4 grab window/page title (nameFromParent). Step 1 includes "Google Chrome" suffix. |

---

## How to Run

1. `git pull`
2. `cd native\windows && dotnet publish -c Release -r win-x64 --self-contained`
3. `npm run dev:electron`
4. Start recording
5. Do exactly: switch to OpenAI tab → Create new secret key → type "My Test Key" → Create Secret Key → Copy → Done
6. Stop recording
7. Compare steps shown in Ondoki to Gold Standard above
8. Add a row to Results with commit hash, date, score, and notes

---

## Known Failure Modes

| Symptom | Likely Cause |
|---------|-------------|
| "Click here" on every step | element data null / UIA not working |
| "Click 'API keys – OpenAI API'" (page title) | nameFromParent, parent walk grabbed container |
| Steps out of order (type before click) | keys/scrolls bypassing unified queue |
| Missing steps (e.g. only 4 of 6) | tab-change click filtered, or click dropped |
| "Click '2. März 2026'" | DataItem row clicked instead of button |
