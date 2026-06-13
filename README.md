# Saathi · your exam wellness companion 💙

> **Saathi** (Hindi: *companion / friend*) is a private, on-device GenAI mental
> wellness tracker for students under high-stakes exam pressure — NEET, JEE,
> CUET, CAT, GATE, UPSC and board exams.

Saathi turns open-ended **journaling + mood logs** into gentle, actionable
insight: it surfaces *hidden* stress triggers and emotional patterns, talks
back as an **empathetic conversational companion**, guides **adaptive
mindfulness**, and keeps students coming back with **Duolingo-grade
gamification** — all while running **entirely on the student's own device.**

---

## The vertical

Mental wellness for exam aspirants. Indian entrance/board exams are uniquely
high-stakes: a single test can shape a future, and the surrounding pressure
(family expectations, peer rank comparison, sleep loss, burnout) is intense and
specific. Generic wellness apps don't speak this language. Saathi does — its
trigger lexicon, tone, and crisis helplines are all built for this audience.

## Approach: a tested engine + GenAI empathy, with graceful fallback

Saathi is a **hybrid**:

- A **pure, unit-tested analysis engine** is the backbone. It runs entirely in
  code (and in CI), deterministically extracting triggers, sentiment, mood
  trends, patterns, streaks/XP, and — critically — **crisis signals**.
- **Generative AI (local Ollama, `gemma3:1b`)** adds conversational empathy on
  top, *grounded* by the engine's insights so it speaks to the individual.
- If Ollama isn't running, Saathi **degrades to grounded template responses and
  still fully works.** Nothing is gated behind the model.

**Privacy by design:** the journal never leaves the device. No accounts, no
cloud, no API keys, no telemetry. The only network call Saathi can make is to a
**local** Ollama at `http://localhost:11434`.

## How it works

```
journal text + mood ──> storage (localStorage)
                          │
                          ▼
              engine.analyze(entries)  ── MEMOIZED ──>  insights
              { triggers, sentiment, moodTrend, patterns,
                streak, xp, level, crisis, examCountdown }
                          │
        ┌─────────────────┼─────────────────────────────┐
        ▼                 ▼                             ▼
  crisis check      prompts.buildContext()         dashboard +
  (BEFORE any LLM)  grounds the companion          gamification +
        │                 ▼                         mascot
        │           provider.chat()  ── Ollama (stream) ── or ── Local templates
        ▼
  helpline panel (Tele-MANAS / KIRAN / iCall)
```

1. You write a journal entry and pick a mood (1–5); it's saved locally.
2. The engine analyses your history (memoized — recomputed only when entries
   change, never on every render).
3. A **deterministic crisis check runs before any AI call.** On a signal, Saathi
   immediately shows a calm panel with India helplines and a "not a substitute
   for professional help" message.
4. The **Companion** chat is grounded by your insights and answered by Ollama
   (streamed token-by-token) or by the offline template provider.
5. **Mindfulness** offers a guided breathing cycle; the **Insights** dashboard
   visualises mood trends and top triggers (as both a chart *and* a data table —
   never colour alone); gamification (streaks, XP, levels, a reactive mascot,
   synthesized sound, confetti) keeps it sticky.

## Safety

- Crisis detection is **deterministic and runs first** — it never depends on the
  model. It matches intent-bearing phrases (not loose words) to stay precise and
  avoid flagging hyperbole like *"this exam is killing my schedule."*
- The LLM is **system-instructed** to never counsel self-harm and to defer to
  helplines. The safety gate short-circuits the model entirely on a crisis
  signal and replies with a fixed, helpline-first message.
- Helplines: **Tele-MANAS 14416**, **KIRAN 1800-599-0019**, **iCall
  +91-9152987821**.

---

## Run it

No build step, zero runtime dependencies. You only need Python (to serve over
HTTP, which ES modules and the Ollama fetch both require) and — optionally —
Ollama for the richer AI chat.

```bash
# 1. Serve the app
npm start          # python3 -m http.server 8753
# then open http://localhost:8753

# 2. (Optional) richer AI companion via local Ollama
ollama pull gemma3:1b
OLLAMA_ORIGINS=* ollama serve     # see CORS note below
```

> **CORS note:** the browser calls Ollama cross-origin (`localhost:8753` →
> `localhost:11434`). Launch Ollama with `OLLAMA_ORIGINS=*` (or your exact
> origin) so it accepts the request. If it isn't set, Saathi simply falls back
> to template responses — everything else works unchanged.

## Test it

```bash
npm test           # node --test test/*.test.js — no Ollama, no browser needed
```

The suite covers the engine (triggers, sentiment, mood trend, streak/XP/level),
crisis precision/recall, prompt building + safety gating, and the provider
(selection, fallback, NDJSON stream parsing — fetch is mocked).

---

## Requirement → location

| Requirement | Where it lives |
| --- | --- |
| GenAI over open-ended journals | `src/ai-provider.js` (Ollama `gemma3:1b`), grounded by `src/prompts.js` |
| Surface hidden triggers & patterns | `src/engine.js` (`extractTriggers`, `detectPatterns`), `src/lexicons.js` |
| Mood logging & trend | `src/engine.js` (`computeMoodTrend`), dashboard in `src/ui.js` |
| Empathetic conversational companion | `src/prompts.js` + `src/ai-provider.js` + Companion view |
| Adaptive mindfulness | breathing controller in `src/ui.js` |
| Coping strategies & motivation | `src/ai-provider.js` (`localReply` / Ollama), gamification |
| Safety: crisis detection + helplines | `src/engine.js` (`detectCrisis`), `src/prompts.js` (`safetyGate`), `src/lexicons.js` (`HELPLINES`) |
| Gamification (streak/XP/level/mascot/sfx) | `src/engine.js` (`computeGameState`), `src/mascot.js`, `src/audio.js`, `src/ui.js` |
| Exam context & countdown | `src/engine.js` (`examCountdown`), Settings view |
| Data export & wipe | `src/storage.js` (`exportJSON`, `wipe`), Settings view |
| Privacy / on-device only | `src/storage.js` (localStorage), strict CSP in `index.html` |
| Efficiency (memoized analysis) | `src/engine.js` (`memoize`, `analysisKey`, `createMemoizedAnalyze`) |
| Accessibility | `index.html` landmarks/ARIA, `styles/main.css` reduced-motion + AA |
| Tests + CI | `test/*.test.js`, `.github/workflows/ci.yml` |

## State complexity (for Efficiency)

- `entries[]` — append-only daily logs (text, mood, ts). O(1) to add.
- `insights` — derived, **memoized** from entries; recompute is O(n·k)
  (n = entries, k = lexicon) and happens *only* when the entry set or options
  change (cache key = `count : lastTs : exam : examDate : today`).
- `gameState` — streak/XP/level derived from entries inside the same pass.
- `chat[]` — session conversation, bounded to the last 100 turns.
- `settings` — exam, exam date, muted, reduced-motion override.

## Assumptions

- Judges may evaluate from the repo + README without running Ollama, so the app
  is fully functional and demoable in fallback mode.
- Helplines are India-focused (the audience is Indian entrance/board exams).
- `gemma3:1b` is the default model; quality is carried by strong engine
  grounding rather than raw model size.
- Single user, single device — no accounts or backend, matching the
  privacy-by-design promise.

## License

MIT — see [LICENSE](./LICENSE).
