# Benchmark — "Create API Key in OpenAI"

Same workflow every run: platform.openai.com → API keys → Create new secret key → name it → copy → done.

## Gold Standard (Scribe — Windows)

**Title:** "Create a secret API key in OpenAI"

| # | Step |
|---|------|
| 1 | Switch to Tab "OpenAI API" |
| 2 | Click "Create new secret key" |
| 3 | Click in Field "My Test Key" *(placeholder)* |
| 4 | Type "xxxx" |
| 5 | Click "Create Secret Key" |
| 6 | Click "Copy" |
| 7 | Click "Done" |

## Scoring

- **2** = correct action + correct label
- **1** = correct action, wrong label
- **0** = wrong/missing
- Title scored 0–2 separately
- **Max: 16** (7 steps + title)

---

## Runs

### Windows — `a8ea37f` — 2026-03-03 — 8/16

**Title:** *(not recorded)* — **0**

| # | Ondoki | Score | Note |
|---|--------|-------|------|
| 1 | Click "API keys - OpenAI API - Google Chrome" | 1 | |
| 2 | Click "API keys - OpenAI API - Google Chrome" | 0 | Missed the "Create" button click |
| 3 | Click "API keys - OpenAI API" | 0 | Missed the field focus |
| 4 | Type "x" / Type "fdf" *(split into 2)* | 1 | Split action |
| 5 | Click "Create secret key" | 2 ✅ | |
| 6 | Click "Copy" | 2 ✅ | |
| 7 | Click "Done" | 2 ✅ | |
| **Total** | | **8/16** | |

**Issues:** nameFromParent grabs window title for steps 1–3, type split in two, title not tracked, Chrome suffix not stripped.

---

### Mac — `a8ea37f` — 2026-03-03 — 14/16

**Title:** "Create new item in OpenAI API" — **2 ✅**

| # | Ondoki | Score | Note |
|---|--------|-------|------|
| 1 | Click "API keys - OpenAI API - Google Chrome – Alexander (Alex)" | 1 | Correct action; label includes OS user suffix |
| 2 | Click "Create new secret key" | 2 ✅ | |
| 3 | Click on TextField field | 1 | Correct action; generic label |
| 4 | Type "sdsdssd" in API keys - OpenAI API | 2 ✅ | |
| 5 | Click "Create secret key" | 2 ✅ | |
| 6 | Click "Copy" | 2 ✅ | |
| 7 | Click "Done" | 2 ✅ | |
| **Total** | | **14/16** | |

**Observations:** Mac captured the workflow much more accurately, missing no steps and correctly identifying the title.

**Persistent Issues:** Chrome window title (including user profile suffix) still pulled in for Step 1. Step 3 used generic "TextField" label.

---

### Mac — `ce54f67` — 2026-03-03 — 13/16

**Title:** *(not recorded this run)* — **0**

| # | Ondoki | Score | Notes |
|---|--------|-------|-------|
| 1 | Click "API keys - OpenAI API - Google Chrome – Alexander (Alex)" | 1 | Chrome suffix still present (em-dash strip order bug — fixed next commit) |
| 2 | Click "Create new secret key" | 2 ✅ | |
| 3 | Click on "My Test Key" field | 2 ✅ | Placeholder now surfaced! |
| 4 | Type "ssdssdds" in API keys - OpenAI API | 2 ✅ | |
| 5 | Click "Create secret key" | 2 ✅ | |
| 6 | Click "Copy" | 2 ✅ | |
| 7 | Click "Done" | 2 ✅ | |
| Title | *(not recorded)* | 0 | |
| **Total** | | **13/16** | |

**Extra steps (outside benchmark):** Click "Cell" x2 (OpenAI grid + desktop icon)

**Progress:** Step 3 fixed (placeholder detected). Suffix strip order bug identified and fixed in next commit.