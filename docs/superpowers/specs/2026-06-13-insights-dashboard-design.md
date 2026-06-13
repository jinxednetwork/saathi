# Saathi — Insights & Patterns Dashboard (Design)

**Date:** 2026-06-13
**Status:** Approved design, ready for implementation plan

## Context

Students want to **understand their own patterns and behaviours** over time — how their
mood moves, what stresses them, how consistently they focus and journal. Saathi already
*captures* the raw material but does little to reflect it back: the engine analyzes only
journal entries, those insights aren't surfaced as trends, and the student can't explore them.

This feature turns the existing data into a **visual insights dashboard** the student can read
at a glance. Outcome: a student opens "Your patterns" and sees their mood trend, top stressors,
focus consistency, conversation tone, and — most importantly — a few plain-language
**observations correlating these streams** (e.g. "focus dips on high-stress days").

### Decisions (confirmed with user)
- **Query experience:** a *visual dashboard* the student explores. **No** natural-language
  "ask my journal" Q&A in this scope.
- **Data scope:** all three stored streams combined — journal `entries`, `chat`, focus `sessions`.
- **Insight storage:** **derive on read.** We store only raw logs; insights are recomputed
  fresh each visit via the deterministic engine. Single source of truth, never stale, no
  migration. (Engine is pure + memoized → instant even over months of data.)
- **Analysis depth:** **correlated insights** — per-stream panels *plus* cross-stream
  plain-language observations. No date-range toggles / multi-chart suite (deferred as YAGNI).

### Privacy & safety (unchanged guarantees)
- Everything stays in `localStorage` on-device. The dashboard performs **no network calls** and
  **no LLM calls** — it is 100% deterministic computation over local data.
- Chat content is analyzed *locally* only (sentiment + theme extraction); nothing leaves the device.
- The crisis-safety gate and the chat-grounding path (`engine.analyze` → `buildContext`) are
  **untouched**.

## Existing foundation (reused, not rebuilt)

| Asset | Location | Reused for |
|-------|----------|-----------|
| `entries[]`, `chat[]`, `sessions[]` | `src/storage.js` `defaultState()` | All three already persisted as `{...,ts}` |
| `analyze(entries, opts)` | `src/engine.js` | Journal insights; **stays as-is** for chat grounding |
| `scoreSentiment(text)` | `src/engine.js` | Per-message chat tone |
| `extractTriggers(text)` | `src/engine.js` | Chat topics / journal stressors |
| `computeMoodTrend(entries)` | `src/engine.js` | Mood-over-time series |
| `detectPatterns(...)` | `src/engine.js` | Pattern-observation idiom to mirror for correlations |
| `dayIndex(ts)` (timezone-safe) | `src/engine.js` | Grouping all streams onto one daily timeline |
| memoize / `createMemoizedAnalyze` | `src/engine.js` | Memoizing `analyzeAll` |
| `#view-dashboard`, trigger + pattern rendering | `index.html`, `src/ui.js` | Dashboard view to extend |

## Architecture & data flow

```
saathi.v1 (localStorage)
  entries[]  ─┐
  chat[]     ─┼──►  analyzeAll({entries, chat, sessions}, opts)   ◄── derive on read, memoized
  sessions[] ─┘            │
                           ▼
                 extended insights object
                           │
                           ▼
                Dashboard view renders panels (inline SVG, no libs)
```

`engine.analyze(entries, opts)` is **not modified** — it continues to feed the companion's
grounding context. A new top-level **`analyzeAll`** composes `analyze` with new pure functions
and is consumed **only** by the dashboard, keeping the chat path isolated and safe.

## Components

### New pure functions in `src/engine.js` (no DOM, no I/O)

- **`analyzeChat(chat)`** → `{ tone: SeriesPoint[], topics: Theme[], volume: SeriesPoint[] }`
  - tone: `scoreSentiment` applied to each `role:'user'` message, bucketed by `dayIndex`.
  - topics: `extractTriggers` over concatenated user messages, ranked.
  - volume: message count per day.

- **`analyzeFocus(sessions, today)`** → `{ totalSessions, totalMinutes, avgMinutes, streak, perDay: SeriesPoint[] }`
  - `streak`: consecutive days (ending today, with the same one-day grace as `computeGameState`)
    that have ≥1 completed session.
  - `perDay`: minutes summed per `dayIndex`.

- **`correlate({entries, chat, sessions}, today)`** → `string[]` of plain-language observations.
  - Build a per-day map keyed by `dayIndex`: `{ moodAvg, focusMinutes, stressThemes:Set }`.
  - Apply a small fixed rule set, each guarded by a minimum-data threshold (mirror
    `detectPatterns` "stay quiet until enough data"):
    1. Focus vs. a top stress theme: "Your focus sessions are shortest on days you mention
       '<theme>'." (compare avg focus minutes on theme-days vs other days).
    2. Mood vs. focus: "Your mood tends to lift on days you complete a focus session."
    3. Journaling vs. mood: "You journal most on the days you feel lowest — that's a healthy
       instinct." (only if the signal is clear).
  - Return at most 2–3 lines; empty array when data is insufficient.

- **`analyzeAll(state, opts)`** → existing `analyze(entries, opts)` insights **plus**
  `{ chat: analyzeChat(...), focus: analyzeFocus(...), correlations: correlate(...) }`.
  Memoized on a key derived from stream lengths + last timestamps + `opts`.

### Dashboard rendering (`src/ui.js`, extending `#view-dashboard`)

Mobile-first, vertical scroll inside the existing phone frame. **Zero chart libraries** — render
small **inline SVG** sparklines (mood, chat tone) and mini bar charts (focus minutes/day) as SVG
`<path>`/`<rect>`, consistent with the project's "zero runtime dependencies" constraint. All text
inserted via `textContent`; SVG built with explicit element creation (never `innerHTML` of user data).

Panels, top to bottom:
1. **Mood over time** — sparkline from `computeMoodTrend`, with an emoji scale label.
2. **What weighs on you** — existing trigger bars (top stressors).
3. **Focus & consistency** — focus streak (🔥), session count + total time, minutes/day mini-bars.
4. **How our chats feel** — chat-tone sparkline + message count.
5. **✨ What Saathi noticed** — existing `patterns` **plus** new `correlations` lines.

```
┌─ Your patterns ──────────────┐
│  Mood over time      😟→🙂    │
│   ╭╮      ╭─╮                 │
│  ╭╯╰─╮╭──╯  ╰╮                │
├───────────────────────────────┤
│  What weighs on you           │
│  ▓▓▓▓▓▓ Time pressure   (6)    │
│  ▓▓▓▓ Self-doubt        (4)    │
├───────────────────────────────┤
│  Focus & consistency          │
│  🔥 4-day focus streak         │
│  12 sessions · 5h 20m total    │
│  ▁▃▅▂▆▇▃  minutes / day        │
├───────────────────────────────┤
│  How our chats feel           │
│  tone ╭──╮ ╭─╮  · 23 messages  │
├───────────────────────────────┤
│  ✨ What Saathi noticed         │
│  • Focus dips on 'Time         │
│    pressure' days              │
│  • Mood lifts when you journal │
│    and finish a focus session  │
└───────────────────────────────┘
```

**Empty / sparse states:** each panel shows a gentle prompt when its stream has too little data
(e.g. "Journal a few days to see your mood trend"), never an empty chart or an error.

## Error handling

- All engine functions tolerate empty/malformed input (return empty series/zeros), matching the
  existing `analyze tolerates empty / malformed input` contract.
- Dashboard reads through the memoized analyzer; a compute failure degrades to empty-state panels,
  never a blank screen or thrown error.
- No new persistence → no migration, no quota risk beyond the raw logs already stored.

## Testing

- **Unit (`test/engine.test.js`, Node test runner, no DOM):**
  - `analyzeChat` builds tone/topics/volume series from chat; tolerant of empty/odd shapes.
  - `analyzeFocus` totals, average, and streak (incl. the one-day grace and gap-breaks-streak cases).
  - `correlate` emits the expected line when a signal is present, and **stays silent** below the
    data threshold (precision matters more than recall here).
  - `analyzeAll` returns the full superset contract and leaves `analyze`'s output intact.
- **E2E:** extend existing Playwright coverage (if present) to assert the dashboard panels render
  with seeded data and show empty-states with none.
- **Regression:** existing `npm test` suite (62 tests) must stay green; chat grounding and crisis
  gate unchanged.

## Out of scope (YAGNI)

- Natural-language "ask my journal" Q&A (revisit later if desired).
- Configurable date ranges / week-month toggles / multiple chart types.
- Persisted daily insight snapshots.
- Any server, export of insights, or cross-device sync.

## Files

- **Edit:** `src/engine.js` (add `analyzeChat`, `analyzeFocus`, `correlate`, `analyzeAll`),
  `src/ui.js` (dashboard panels + inline-SVG renderers), `index.html` (dashboard panel markup),
  `styles/main.css` (panel + chart styles), `test/engine.test.js` (new tests).
- **Create:** none required (no new modules; engine extensions live with their siblings).

## Verification

1. `npm test` — new engine tests pass; all 62 existing tests stay green.
2. Seed `localStorage` with a couple weeks of entries + a few chat turns + focus sessions; open
   "Your patterns" → all five panels render with correct sparklines/bars and 2–3 correlation lines.
3. Fresh profile (no data) → every panel shows its gentle empty-state, no errors in console.
4. Confirm zero network requests fire when opening the dashboard (DevTools Network tab).
5. Confirm the chat companion and crisis gate behave exactly as before (unchanged paths).
