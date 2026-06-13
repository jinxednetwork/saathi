# H2S Round 2 — GenAI Mental Wellness Tracker for Exam Students

## Context

Hack2Skill hackathon, Round 2. We must build a **Generative-AI-powered mental
wellness tracker** for students under high-stakes exam pressure (NEET, JEE,
CUET, CAT, GATE, UPSC). It must use GenAI to analyze **open-ended journaling +
mood logs**, surface **hidden stress triggers and emotional patterns**, and act
as an **empathetic conversational companion** delivering tailored coping
strategies, adaptive mindfulness, and motivation — **safely**.

Round 1 ("Plate") scored **94.99/100**; weakest area was **Efficiency (80)**.
We reuse the winning recipe (zero runtime deps, strict CSP, accessibility +
tests + CI from day one, README with requirement→location table) and explicitly
attack Efficiency this round (memoization, no recompute-on-render, documented
state complexity, optional minified build).

Submission = one **public GitHub repo** (`jinxednetwork/<name>`), **< 10MB**,
mandatory README (vertical, approach, how it works, assumptions).

### Decisions locked with the user
- **GenAI = local Ollama** running **`gemma3:1b`** (already installed, 815 MB,
  quantized). Privacy-by-design: *the journal never leaves the device.* No API
  keys, no cloud, no secret in repo, repo stays tiny (model lives in Ollama).
- **Hybrid w/ graceful fallback**: a pure, unit-tested **analysis engine** is
  the backbone (runs in CI, grounds the LLM prompt). Gemma adds generative
  empathy. If Ollama is absent, the app degrades to grounded template responses
  and **still fully works**.
- **Features (all in):** journal+mood analysis, conversational companion,
  adaptive mindfulness, insights dashboard, **data export+wipe**, **exam
  context/countdown**, **weekly AI summary**, **Duolingo-grade gamification**
  (streaks, XP/levels, milestones, confetti, synthesized sound FX, reactive
  mascot — "addictive").
- **Safety = detect + surface helplines.** Deterministic crisis check runs
  BEFORE any LLM call; on a signal, show a calm panel with India helplines
  (Tele-MANAS 14416, KIRAN 1800-599-0019, iCall +91-9152987821) and a
  "not a substitute for professional help" message; LLM is system-instructed to
  never counsel self-harm and to defer to resources.
- **Tone = playful gamified-first** (bold, energetic, mascot-driven) — risks
  mitigated by AA-contrast palette, reduced-motion path, mute toggle.

### Proposed name
**"Saathi"** (Hindi: *companion/friend*) — fits the "digital companion" brief and
the Indian exam audience. Mascot = a friendly companion creature.
Alternatives if you prefer: *Mitra*, *Sukoon*. (Repo: `jinxednetwork/saathi`.)

---

## Architecture

**No bundler required to run.** ES modules served over HTTP (`python3 -m
http.server 8753`). We serve rather than double-click because the Ollama fetch
(`localhost:11434`) and ES-module loading both need an HTTP origin — and Ollama
is the whole point this round. Pure-logic modules are imported directly by
`node --test` (no global/dual-export hack needed — cleaner than Round 1).

### 3-layer split (logic / data / DOM), each module single-purpose

```
saathi/
  index.html              semantic shell, landmarks, skip link, strict CSP meta
  styles/main.css         design system, themes, gamification FX, reduced-motion
  src/
    engine.js     PURE. analyze(entries,opts) -> insights. No DOM, no I/O.
                  trigger extraction, sentiment, pattern detection, mood trend,
                  streaks/XP, crisis detection. The tested backbone.
    lexicons.js   PURE data: exam-stress trigger lexicon (themed), sentiment
                  word lists, crisis phrase list. Imported by engine.
    prompts.js    PURE. buildSystemPrompt() + buildContext(insights) +
                  safety gating. No I/O. Tested.
    ai-provider.js  provider abstraction. OllamaProvider (fetch injected for
                  testability, NDJSON stream parse) + LocalProvider (grounded
                  templates). detectProvider() probes /api/tags. Tested w/ mock.
    storage.js    localStorage load/save/exportJSON/wipe. Thin, guarded.
    audio.js      Web Audio API SYNTHESIZED sfx (chime/level/streak). Mute-aware,
                  off-respecting. No audio files -> repo tiny, CSP intact.
    mascot.js     inline SVG companion + expression states (idle/happy/cheer/
                  concerned) driven by mood/streak. No external assets.
    ui.js         DOM render + event wiring. textContent-only. View switching,
                  focus mgmt, aria-live updates.
    app.js        bootstrap/orchestration: wires storage->engine->provider->ui.
  test/
    engine.test.js        node --test: triggers, sentiment, patterns, streaks
    crisis.test.js        node --test: crisis detection precision/recall cases
    prompts.test.js       node --test: prompt build + safety gating
    ai-provider.test.js   node --test: provider select, fallback, stream parse
                          (mocked fetch — NO live Ollama needed)
  e2e/smoke.spec.js       Playwright: load -> journal entry -> dashboard updates
                          -> mindfulness -> mute -> crisis phrase shows helplines
                          -> export/wipe. Runs against fallback (no Ollama in CI).
  .github/workflows/ci.yml   node --test on push (+ optional Playwright job)
  build.js (optional)     esbuild (devDep) -> minified dist/ for Efficiency.
                          App runs fine WITHOUT building.
  README.md  LICENSE(MIT)  .gitignore  package.json (zero RUNTIME deps)
```

### Data flow
1. User writes journal text + picks mood (1–5) → `storage.save()` (localStorage).
2. `engine.analyze(entries, {exam, today})` → `insights` =
   `{triggers[], moodTrend, patterns[], streak, xp, level, crisis}`.
   **Memoized**: recomputed only when entries change (cache keyed by
   count+lastTimestamp), never on every render. *(Efficiency fix.)*
3. `crisis.flagged` → render helpline panel immediately (before any LLM).
4. Chat: `prompts.buildContext(insights)` grounds the model → `provider.chat()`
   streams tokens → rendered via `textContent` (never innerHTML).
5. Gamification: insights drive streak/XP/level → mascot state + (muteable) sfx +
   milestone confetti. Dashboard visualizes mood trend + top triggers
   (accessible: data table + visual, AA contrast, not color-alone).

### Ollama integration
- `GET /api/tags` on boot → if reachable + `gemma3:1b` present → OllamaProvider,
  else LocalProvider + a calm banner ("AI companion offline — start Ollama for
  richer chat; everything else still works").
- `POST /api/chat` `{model:"gemma3:1b", messages, stream:true}`, parse NDJSON,
  render incrementally (perceived perf + Efficiency).
- **CORS note (assumption documented in README):** cross-origin localhost may
  require `OLLAMA_ORIGINS=*` (or our origin) when launching Ollama; README gives
  the exact command. Fallback covers the case where it isn't set.

---

## Criteria → implementation map (target: max all six)

- **Problem Alignment (High):** real GenAI (Gemma) over open-ended journals;
  engine surfaces *hidden* triggers/patterns; conversational coping + adaptive
  mindfulness + motivation; exam-aware; safe. README requirement→location table.
- **Security:** strict CSP (`default-src 'self'; connect-src 'self'
  http://localhost:11434; script-src 'self'; style-src 'self'` — no
  unsafe-inline/eval), zero external/CDN deps, no secrets, on-device data only,
  `textContent`-only rendering of LLM output, documented threat model.
- **Efficiency (the focus):** memoized analysis (no recompute-on-render),
  incremental aggregate updates, debounced input, streamed LLM tokens, lazy view
  render, CSS-transform animations + rAF, **documented state complexity**,
  optional minified build.
- **Testing:** `node --test` unit suite (engine/crisis/prompts/provider, provider
  mocked) + Playwright smoke + GitHub Actions CI green on push (no Ollama needed).
- **Accessibility:** landmarks, skip link, labelled inputs, fieldset/legend for
  mood, `aria-live` for companion + streak, `role="progressbar"` breathing,
  focus mgmt on view change, AA contrast (verified), icon+text, mute toggle,
  full `prefers-reduced-motion` path, keyboard-operable everything, sound never
  the sole signal.
- **Code Quality:** clean logic/data/DOM split, small named documented functions,
  pure testable core, no framework, consistent style.

## State complexity (documented up front, for Efficiency)
- `entries[]` — append-only daily logs (text, mood, ts). O(1) add.
- `insights` — derived, **memoized** from entries; recompute O(n·k) only on
  change (n=entries, k=lexicon), cached otherwise.
- `gameState` — streak/xp/level derived from entries; updated incrementally.
- `chat[]` — session conversation (not analyzed by engine).
- `settings` — exam, examDate, muted, reducedMotion override.

---

## Build sequence (engine/test-first, then UI, per the winning workflow)
1. Scaffold repo: `index.html`, `package.json` (no runtime deps), `.gitignore`
   (node_modules, .playwright-mcp, test-results, dist), MIT LICENSE.
2. **`lexicons.js` + `engine.js` test-first** — write `engine.test.js` +
   `crisis.test.js`, implement until green (triggers, sentiment, patterns,
   trend, streaks/XP, crisis). This is the scored backbone.
3. `prompts.js` + `prompts.test.js` (grounding + safety gating) green.
4. `ai-provider.js` + `ai-provider.test.js` (mock fetch: select, fallback,
   stream parse) green.
5. `storage.js`, `audio.js`, `mascot.js`.
6. `ui.js` + `app.js`: views (Journal, Companion chat, Mindfulness, Dashboard,
   Settings), gamification FX, accessibility wiring.
7. CSS design system (gamified-first, AA, reduced-motion, mute).
8. **Live browser verify (Playwright MCP):** journal→insights, chat w/ Ollama
   running, fallback w/ Ollama stopped, mindfulness, crisis→helplines, mute,
   export/wipe, keyboard + reduced-motion pass.
9. `e2e/smoke.spec.js` + `.github/workflows/ci.yml` green.
10. Optional `build.js` (esbuild devDep) → minified `dist/`.
11. README (vertical, approach, how-it-works, assumptions, requirement→location
    table, Ollama setup + CORS note, run/test instructions).
12. `git init` → commit → create **public** repo `jinxednetwork/saathi` → push.
    Verify CI green + repo < 10MB.

## Verification
- `npm test` (node --test) all green locally + in CI.
- Playwright smoke green against the fallback (Ollama off) and manual MCP pass
  with Ollama on (`OLLAMA_ORIGINS=* ollama serve`, `gemma3:1b`).
- Manual: crisis phrase surfaces helplines before any LLM call; LLM output
  renders as text only; mute + reduced-motion fully disable sound/heavy motion;
  export produces valid JSON; wipe clears storage; keyboard-only traversal works;
  contrast spot-checked AA.
- `du -sh` repo < 10MB; `gh repo view` is public.

## Assumptions
- Judges evaluate primarily from repo + README; not all will run Ollama → app
  must be fully functional + impressive in fallback (it is).
- India-focused helplines (audience is Indian entrance/board exams).
- `gemma3:1b` is the default model; configurable; quality is carried by strong
  engine grounding, not raw model size.
- Single user, single device (no accounts/backend) — matches privacy-by-design.
