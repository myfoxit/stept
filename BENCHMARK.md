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

**Title:** *(not recorded)*

| # | Ondoki | Score |
|---|--------|-------|
| 1 | Click "API keys - OpenAI API - Google Chrome" | 1 |
| 2 | Click "API keys - OpenAI API - Google Chrome" | 0 |
| 3 | Click "API keys - OpenAI API" | 0 |
| 4 | Type "x" / Type "fdf" *(split into 2)* | 1 |
| 5 | Click "Create secret key" | 2 ✅ |
| 6 | Click "Copy" | 2 ✅ |
| 7 | Click "Done" | 2 ✅ |
| Title | *(not recorded)* | ? |
| **Total** | | **8/16** |

**Issues:** nameFromParent grabs window title for steps 1–3, type split in two, title not tracked, Chrome suffix not stripped.

---

### Mac — `e60609b` — 2026-03-03 — 13/16

**Title:** "Create new item in OpenAI API"

| # | Ondoki | Score | Notes |
|---|--------|-------|-------|
| 1 | Click "API keys - OpenAI API - Google Chrome – Alexander (Alex)" | 1 | Chrome suffix still in element name (tab AXTitle includes app name) |
| 2 | Click "Create new secret key" | 2 ✅ | |
| 3 | Click on TextField field | 1 | Role detected, no placeholder/name |
| 4 | Type "sdsdssd" in API keys - OpenAI API | 2 ✅ | |
| 5 | Click "Create secret key" | 2 ✅ | |
| 6 | Click "Copy" | 2 ✅ | |
| 7 | Click "Done" | 2 ✅ | |
| Title | "Create new item in OpenAI API" | 1 | "item" not specific enough vs "secret API key" |
| **Total** | | **13/16** | |

**Improvements over Windows a8ea37f (8/16):** Steps 2–7 all correct. Title now tracked.

**Remaining issues:**
- Step 1: Tab element AXTitle includes full Chrome window title (" - Google Chrome – Profile") — need to strip browser suffix from element names, not just window titles
- Step 3: TextField has no accessible name/placeholder exposed — needs AXPlaceholderValue fallback
- Title: "item" is too generic — smarter title generation needed

