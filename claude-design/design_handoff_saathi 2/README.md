# Handoff: Saathi — Student Mental Health Companion

## Overview
Saathi is a privacy-first, gently gamified wellbeing companion for students under exam
pressure (anchor persona: an Indian NEET aspirant). It pairs open-ended **journaling +
mood logging** with a **focus/Pomodoro timer**, a **conversational companion (chat)**, and
**guided breathing** — wrapped in a Duolingo-grade reward loop with the *anxiety* loop
deliberately removed. A user-built mascot is the emotional anchor; a calm, ungamified
**crisis/helpline surface** is the hard safety boundary.

Core principle: **borrow the reward loop, drop the anxiety loop.** No guilt screens, no
loss-aversion, no passive-aggressive nudges. Missed days get "welcome back", never a funeral.

## About the Design Files
The file in this bundle (`Saathi.dc.html`) is a **design reference created in HTML** — an
interactive prototype demonstrating the intended look, motion, and behavior. It is **not
production code to copy directly.** It is authored as a single self-contained streaming
component with an inline-SVG mascot engine and React-style state.

Your task is to **recreate these designs in the target codebase's existing environment**
(React Native, Flutter, SwiftUI, a React/Vue web app, etc.) using that project's established
patterns, component library, navigation, and state management. If no environment exists yet,
choose the most appropriate framework for a mobile-first wellbeing app and implement there.
Treat the HTML as the spec for *appearance and interaction*, not the implementation.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, copy, and interaction
timing are all specified below and should be reproduced faithfully. The mascot, mood icons,
and small UI glyphs are drawn as inline SVG in the prototype — reproduce them as inline SVG /
vector assets (not raster), since the mascot must recolor and swap expression at runtime.

---

## Design Tokens

### Color — base & surfaces
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F7F4E9` | App background (warm cream — never stark white) |
| `--surface` | `#FFFFFF` | Cards, input fields, speech bubbles |
| `--surface-sunken` | `#EFEBDD` | Pressed/inset areas, pending day dots, input borders |
| `--canvas` | `#E7E5DD` | The neutral page behind the device frame (prototype only) |

### Color — brand & semantic
| Token | Hex | Use |
|---|---|---|
| `--primary` | `#639922` | CTAs, mascot default, active nav, selected states |
| `--primary-soft` | `#EAF3DE` | Selected fills, success-tint cards, chips |
| `--primary-ink` | `#3B6D11` | Text/icons on `--primary-soft` |
| `--reward` | `#EF9F27` | XP / streak / confetti accents (used sparingly) |
| `--reward-soft` | `#FAEEDA` | Reward stat cards, streak chip background |
| `--reward-ink` | `#854F0B` | Text on `--reward-soft` |
| `--crisis-surface` | `#E6F1FB` | Helpline panel (calm blue — never red) |
| `--crisis-ink` | `#0C447C` | Text on crisis surface |
| `--crisis-ink-2` | `#3A6EA5` | Secondary text on crisis surface |

### Color — text
| Token | Hex |
|---|---|
| `--ink` | `#2C2C2A` (primary text) |
| `--ink-muted` | `#5F5E5A` (secondary) |
| `--ink-hint` | `#888780` (placeholders, inactive, hints) |

### Mood scale (1–5, sad→happy)
Color is **never** the sole signal — each mood is distinguished by **mouth-curve shape** in
its icon **and** a text label, plus a selection ring/fill when chosen.
| Level | Label | Icon mouth shape |
|---|---|---|
| 1 | Low | deep frown (∩) |
| 2 | Meh | slight frown |
| 3 | Okay | flat line |
| 4 | Good | slight smile |
| 5 | Great | big smile (∪) |

### Mascot color palette (user-selectable)
`#639922` sage (default) · `#5B8DB8` blue · `#E08A5B` terracotta · `#9B86C4` lavender ·
`#E0A93E` gold · `#4FA399` teal. All share a friendly mid-chroma feel.

### Typography
- **Display / UI:** `Fredoka` (rounded, warm), weight **500** only.
- **Body:** `Nunito`, weights **400 / 500**.
- Deliberately **no 600/700** — keeps the tone soft. Hierarchy comes from size + Fredoka's
  inherent roundness, not boldness.
- Scale (px): display 23–26 · screen-title 22–23 · body 15–16 · label 13 · hint 11–12.
  Large numerics (streak/XP/timer) use Fredoka 500 at 34–54px.
- Body line-height **1.5–1.7**. Inputs **min 16px** (prevents iOS zoom).
- **Sentence case everywhere.** No ALL-CAPS except tiny eyebrow labels (e.g. "LEVEL UP",
  letter-spacing ~1px).

### Spacing — 4px base
`xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32`. Card padding lg–xl.

### Radius
`sm 8 · md 16 (default) · lg 18–20 · pill 28 (cards/CTAs) · full 9999 (dots, avatars,
mascot bubble, swatches)`. Generous rounding is core to the calm feel.

### Motion
- Durations: micro **150ms** · view **200ms** · reward **~350ms**.
- Easings: `--ease-out: cubic-bezier(.22,1,.36,1)` (views) · `--ease-spring:
  cubic-bezier(.34,1.56,.64,1)` (reward pop/bounce).
- **Transform + opacity only** (no layout thrash).
- **Every animation needs a `prefers-reduced-motion` collapse** to an instant/visible state.
  Critically: no element may *depend on an entrance animation to become visible* — its
  resting (un-animated) state must already be visible. Reduced-motion users still get the
  mascot + (optional) sound as parallel signals.

### Shadow
Device/elevation shadows are soft and warm-tinted, e.g. cards rest flat on `--bg` with no
hard shadow; the only prominent shadow is the device frame in the prototype. Keep elevation
subtle — flat, calm surfaces over drop-shadow stacks.

---

## The Mascot System (most important reusable asset)

The mascot ("saathi") is **user-built** during onboarding and reused everywhere. It is a
geometric creature (not human — culturally neutral) rendered as **inline SVG on a 120×120
viewBox** so it can recolor and swap expression at runtime.

**Config (persisted):**
- `shape`: `pentagon` (default) · `circle` · `squircle` · `hexagon` · `triangle`
- `color`: one of the 6 palette hexes
- `accessory`: `none` · `sprout` (two leaves on a stem) · `sparkle` (orange 4-point star) ·
  `cap` (blue beanie) · `specs` (round glasses)
- `name`: free text, ≤14 chars (default "Pip"). The name becomes the companion/chat tab label.

**Expression states (driven by mood + streak):**
| State | Trigger | Look |
|---|---|---|
| `idle` | default | dot eyes, gentle smile arc, calm |
| `happy` | entry logged / mood ≥ 4 / small win | upward arc eyes, wider smile, pink cheeks |
| `cheer` | milestone / level-up / focus complete | arc eyes, open filled smile, **raised stick arms**, cheeks |
| `concerned` | mood ≤ 2 / low-mood streak | dot eyes + raised inner brows, soft tiny smile — caring, **never** pitying/crying |

**Geometry notes (for faithful re-creation):** body shapes use `stroke-linejoin:round` +
`stroke-width:12` in the body color to fake rounded corners on polygons. Face elements use
ink `#2C2C2A`. A soft ground shadow ellipse sits at the bottom. `cheer` adds two curved
stick arms with small circle "hands". The mascot has an idle **bob** loop (translateY ±7px,
4s) that pauses under reduced-motion.

Mood icons reuse the same idea at 40×40: two dot eyes + a mouth path whose curvature encodes
the level (see Mood scale table).

---

## Screens / Views

The app is a **single mobile screen** (≈390×812 / iPhone proportions) with a fixed status
bar, a swappable content area, and a fixed **bottom tab bar** (4 tabs:
**Journal · Focus · {mascot name} · Breathe**). Onboarding is a full-screen takeover shown
before the tabs exist. Reward/safety moments are overlays on top.

### 0. Onboarding — Mascot Builder
- **Purpose:** First run. User creates their companion before entering the app.
- **Layout:** Vertically scrolling, padding 24px. Title "Create your saathi" (Fredoka 23px) +
  muted subtitle. A white rounded card (radius 24) ~188px tall centers a **live mascot
  preview** (size 150, `happy`, bobbing). Below, four labeled choosers and a name field.
- **Components:**
  - **Shape chooser:** row of 5 buttons (56×56, radius 18). Each shows a mini shape glyph in
    the current color. Selected = 2px `--primary` border + `--primary-soft` fill; else 1.5px
    `--surface-sunken` border on white.
  - **Colour chooser:** row of 6 circular swatches (52px, 36px inner dot). Selected = 2px
    `--ink` ring.
  - **Accessory chooser:** row of 5 buttons (62×62) each previewing a tiny circle-bodied
    mascot wearing that accessory + a label.
  - **Name input:** white, radius 16, 1.5px sunken border, 16px text, maxlength 14.
  - **Primary CTA** (full width, pill, `--primary`, Fredoka 17, white): "Meet {name}".
  - Footer hint w/ lock glyph: "Everything stays on your device".
- **Behavior:** Every choice live-updates the preview mascot. CTA → sets `onboarded=true`,
  routes to Journal tab.

### 1. Journal (home / default tab)
- **Purpose:** The emotional heart — log today's mood + an open reflection. "A safe blank page."
- **Layout:** Scrolling column, padding 22px.
  - **Header row:** greeting "Namaste, {firstName}" (Fredoka 23) + sub-line with lock glyph
    "On your device · NEET in 184 days". Right: **streak chip** (`--reward-soft` pill,
    `--reward-ink`, flame glyph + number).
  - **Day-dot row:** 7 days (Mon–Sun). Each = weekday letter (11px hint) above a 34px circle:
    `done` = `--primary` fill + white check; `today` = white fill + 2px `--primary` ring + dot;
    `pending` = `--surface-sunken` fill. (Icon + fill, never color alone.)
  - **(Conditional) focus context chip:** if arriving from a completed focus session, a
    `--primary-soft` pill "After a {n}-min focus session".
  - **Mascot prompt bubble:** small live mascot (size 64) + white speech bubble (radius
    20/20/20/6) with a context-aware prompt that changes with the selected mood.
  - **Mood picker:** a `<fieldset>` with `<legend>` "How are you feeling right now?" and 5
    equal-width buttons (radius 16). Each = mood icon + label. Selected = 2px `--primary`
    border + `--primary-soft` fill + `--primary-ink` label.
  - **Journal textarea:** labeled, white, radius 18, min-height 108, 16px/1.6, placeholder
    "The blank page is yours — no pressure, no judgement…".
  - **Primary CTA:** "Save today's reflection" (pill, `--primary`). **Disabled** (muted
    `#cdd9bf`) until a mood is selected.
  - **Ghost link (demo only):** "Preview the safety surface (demo)" — remove in production;
    crisis detection is automatic.
- **Behavior:** See Interactions → Save loop.

### 2. Focus (Pomodoro study timer)
- **Purpose:** Run a timed study sprint, then reflect on it (journal) or bring a doubt to the
  companion. This is the spine that connects Focus → Journal → Companion.
- **Layout (idle/running):** column, padding 22px.
  - Header: "Focus session" (Fredoka 18) + muted mode label ("pomodoro" / "in progress").
  - **Ring:** centered 236px SVG progress ring — `--surface-sunken` track + `--primary`
    progress arc (12px stroke, round cap, starts at 12 o'clock, animates clockwise,
    `transition: stroke-dashoffset 1s linear`). Inside: live mascot (size 70, bobbing) above a
    big **mm:ss** countdown (Fredoka 42).
  - Hint line under ring.
  - **(idle only) Stepper:** `--primary-soft` pill row: round − button, "{bell glyph} {n} min"
    center, round + button. Range **5–60**, step **5**, default **25**. Hidden while running.
  - **(idle only) Tip card:** white, info glyph + "Pick a single task. Phone face-down — your
    streak waits, it never punishes."
  - **Controls:** primary "Start focus" / "Pause" / "Resume" (pill). While running, a small
    outline "Skip ›" appears beside it.
- **Layout (complete):** centered column.
  - Mascot **cheer** (size 118, pop-in). "Nice focus, {firstName}" (Fredoka 24). Sub: "You
    stayed with it for {n} minutes. +15 XP".
  - "How did that feel?" + a 5-button mini mood row (icons only).
  - CTAs stacked: primary **"Jot a quick reflection"** · outline **"Ask {name} a doubt"** ·
    ghost **"Maybe later"**.
- **Behavior:** See Interactions → Focus loop.

### 3. Companion / {mascot name} (chat)
- **Purpose:** Conversational coping + live study-doubt help. Streamed, caring responses.
- **Layout:** flex column filling the screen.
  - **Header:** mascot (size 42) + name (Fredoka 17) + status line ("Here with you" green dot
    / "Offline · fallback mode" amber dot). Right: outline toggle "Test offline" / "Go online".
  - **(Conditional) offline banner:** `--crisis-surface` card with wifi-off glyph explaining
    AI is offline and pointing to grounding/breathing. (Calm blue, not alarming.)
  - **Message list** (`aria-live="polite"`): mascot bubbles left
    (white, radius 18/18/18/6, max 82%), user bubbles right (`--primary`, white text, radius
    18/18/6/18, max 78%). Typing indicator = 3 bouncing dots in a left bubble.
  - **Suggested-prompt chips** (horizontal scroll): outline pills, e.g. "I'm anxious about
    NEET", "I can't focus today", "I keep comparing myself". Offline → grounding chips.
  - **Input bar:** rounded text input + circular `--primary` send button (paper-plane glyph).
- **Behavior:** See Interactions → Chat.

### 4. Breathe (guided breathing)
- **Purpose:** A 4-4-4 box-breathing reset.
- **Layout:** centered column. Title "Box breathing" + "{n} of 5 breaths". A
  `role="progressbar"` (aria-valuemin 0 / max 5 / now = breaths) region containing two nested
  circles: outer 250px `--primary-soft`, inner 200px sage that **scales** with the phase
  (`transition: transform 3.8s`). Centered phase word (Fredoka 24, `--primary-ink`):
  "Breathe in" → "Hold" → "Breathe out". Sub-line + primary "Begin"/"Stop" CTA.
- **Reduced motion:** circle does not scale; user follows the changing words at their own
  pace (sub-line tells them so).

### Overlays (rendered above the tabs)

**A. Reward (entry logged)** — non-blocking **bottom sheet**. Translucent ink backdrop
(`rgba(44,44,42,.28)`); white sheet (radius 28 top) slides up. Mascot `happy` (pop), "Logged.
Well done.", caring line, two stat chips (**+10 XP** on `--reward-soft`, **{streak} day
streak** on `--primary-soft`), primary "Continue". Optional gentle confetti.

**B. Level up** — full `--primary-soft` screen. Mascot `cheer` (pop) + confetti, eyebrow
"LEVEL UP", "Level {n}" (Fredoka 34), caring line, "Keep going". Rarer/earned — fires only
when XP crosses a 50-point boundary.

**C. Milestone (7-day streak)** — centered white card on ink backdrop. Mascot `cheer` +
confetti, "7-day streak!", caring line, "Lovely".

**D. Streak** — full `--reward-soft` screen. Mascot `happy`, big flame + number (Fredoka 54),
"day streak", and the **self-compassion** message: "Life happens — if you ever miss a day,
your progress stays safe. No guilt here." Primary `--reward` "Continue".

**E. Crisis / safety surface** — **the hard boundary. ZERO gamification:** no XP, no mascot,
no confetti, no sound, no streak, no celebratory color. `role="alertdialog"`, calm
`--crisis-surface` blue. Close (X) top-right. White heart chip, heading "You don't have to
carry this alone", caring paragraph, then three tappable `tel:` helpline cards:
- **Tele-MANAS** — `14416` — Govt. of India · 24×7
- **KIRAN** — `1800-599-0019` — Mental health · 24×7
- **iCall** — `+91 91529 87821` — Mon–Sat · 8am–10pm
Footer: "Saathi is a companion, not a substitute for professional help." + outline
"I'm okay for now". Must be keyboard-reachable and screen-reader-announced on appearance.

---

## Interactions & Behavior

### Navigation
- Bottom tab bar switches Journal / Focus / Companion / Breathe. Active tab = `--primary`
  icon + label (Fredoka 11, slightly heavier stroke); inactive = muted `#9b9788`.
  Set `aria-current="page"` on the active tab. Manage focus on view change.
- Leaving the Breathe tab stops the breathing cycle.

### Save loop (Journal)
1. CTA disabled until a mood is chosen.
2. On save, run **deterministic crisis detection** on the entry text (case-insensitive
   substring match against a keyword list — see State). If matched → open **Crisis overlay**
   and **stop** (no XP, no streak, no reward). This check is non-negotiable and runs before
   any gamification.
3. Otherwise: mark today's dot `done`, `streak += 1`, `xp += 10`, then choose ONE overlay:
   - `streak === 7` → **Milestone**
   - else if XP crossed a 50-boundary (`floor(newXp/50) > floor(oldXp/50)`) → **Level up**
   - else → **Reward** bottom sheet
4. Dismissing Reward clears the entry + mood (fresh page) and any focus context.

### Focus loop
- Start → counts down from `{min}×60` seconds, ticking every 1s; ring + mm:ss update.
- Pause/Resume toggles the interval (remaining time preserved). "Skip ›" jumps to complete.
- On reaching 0 (or skip): `xp += 15`, enter **complete** state with mascot `cheer`.
- Complete CTAs:
  - **Jot a quick reflection** → Journal tab, carries the chosen "how did that feel?" mood in,
    sets the focus-context chip + a focus-aware prompt bubble.
  - **Ask {name} a doubt** → Companion tab and **appends a mascot opener** inviting the user
    to describe what they got stuck on.
  - **Maybe later** → reset timer, stay.

### Chat
- Sending a message (button or Enter) appends a right user bubble, shows the typing indicator,
  then after ~1.1s (≈0.35s under reduced motion) appends the mascot reply.
- Suggested chips send their text. Offline chips route to Breathe.
- **Offline toggle** flips status, shows the fallback banner, swaps suggestions to grounding
  steps, and makes replies a canned offline message. (Never the sole signal — visible banner
  + status dot + text.)
- Replies are currently **scripted with keyword routing** (NEET/exam/anxious, focus/distract,
  comparison, tired/sleep, stuck/doubt, + a caring default). **AI-ready:** there is a single
  `respond(message)` seam — replace it with a **streamed** model call (token-by-token into the
  `aria-live` bubble). Keep the offline fallback path and the typing indicator.

### Reduced motion
- Confetti is skipped entirely. Bob/float loops pause. Entrance animations collapse to their
  visible resting state. Breathing circle stops scaling (words still cycle). Reward, level-up,
  and milestone information is conveyed by text + mascot, never by motion alone.

### Animations inventory
| Name | Use | Spec |
|---|---|---|
| bob | idle mascot | translateY 0→−7→0, 4s ease-in-out, infinite |
| float | sparkle/accent | translateY + small rotate, 3.6s |
| pop | reward/level/focus mascot | scale .92→1.06→1, ~350ms spring |
| up | bottom sheet / cards | translateY 16→0, ~320ms ease-out |
| typing dots | chat | 3 dots, translateY bounce, staggered .18s |
| confetti | milestone/level | 26 transform particles falling + rotating, 1.7–2.8s, **reduced-motion + mute gated** |
| ring fill | focus timer | `stroke-dashoffset` transition 1s linear |
| breathe | breathing orb | `transform: scale()` transition 3.8s per phase |

---

## State Management
Suggested state (adapt to the codebase's store):
- **Onboarding/config:** `onboarded:boolean`, `mascot:{shape,color,accessory,name}`.
- **Navigation:** `tab: 'journal'|'focus'|'companion'|'breathe'`, `overlay:
  null|'reward'|'level'|'mile'|'streak'|'crisis'`.
- **Journal:** `mood:0–5` (0 = none), `entry:string`, `journalFromFocus:boolean`,
  `dots: [{label, state:'done'|'today'|'pending'}]×7`.
- **Gamification:** `streak:number`, `xp:number` (level = `floor(xp/50)+1`).
- **Focus:** `focusMin` (5–60), `focusRem` (seconds), `focusTotal`, `focusRunning`,
  `focusDone`, `focusMood:0–5`. Timer via a 1s interval; clear on unmount/pause/skip.
- **Chat:** `chat:[{role:'me'|'saathi', text}]`, `typing:boolean`, `offline:boolean`,
  `input:string`. Reply via timeout (swap for streamed model call).
- **Breathe:** `breathOn`, `breathPhase`, `breathScale`, `breathCount` (0–5); 3.8s interval.
- **Crisis detection keywords** (case-insensitive substring; tune with a clinician before
  shipping): `kill myself`, `end it all`, `want to die`, `no point in living`,
  `no reason to live`, `hurt myself`, `can't go on`, `better off without me`, `suicid`,
  `worthless`.
- **Persistence & privacy:** everything is **on-device** by design — surface this to the user
  and back it with local storage / encrypted local DB. Provide data **export + wipe** in
  Settings (named in the brief; not built in this prototype).

### Data fetching
None except the future Companion model call. No analytics that leave the device. No
push-notification guilt nudges (explicitly rejected by the brief).

---

## Accessibility (acceptance criteria — treat as must-pass)
- Landmarks + skip link + logical heading order; manage focus on every view change.
- Labelled inputs; `<fieldset>/<legend>` for the mood scale.
- `aria-live="polite"` on companion responses and streak/XP updates.
- `role="progressbar"` on the breathing exercise (and the focus ring conveys value too).
- AA contrast on every text/surface pair. (All token pairings above are chosen to pass AA.)
- **Icon + text always; color is never the sole signal. Sound (when added) is never the sole
  signal** — pair it with the visual + mascot.
- Full keyboard operability; hit targets ≥ 44px.
- Complete `prefers-reduced-motion` path.
- Global, persistent **mute** toggle for all audio (sound layer not built in this prototype;
  brief specifies synthesized Web-Audio chimes, default off, muteable).

---

## Assets
- **No external image/icon assets.** The mascot, mood faces, and all UI glyphs (journal,
  timer, chat, breathe, lock, flame, clock, check, ×, ±, bell, tip, send, wifi-off, heart,
  phone) are **inline SVG** generated in code. Recreate them as inline SVG / a vector icon set
  so the mascot can recolor and change expression at runtime.
- **Fonts:** Fredoka + Nunito (Google Fonts). Use the codebase's font-loading mechanism.
- If your codebase has an existing design system, map these tokens onto it rather than
  hard-coding; keep the cream `--bg`, sage `--primary`, and the calm-blue crisis surface.

## Files
- `Saathi.dc.html` — the full interactive design reference (all screens, overlays, mascot
  engine, and interaction logic). Open it in a browser to see motion and flow. The mascot SVG
  construction and the `respond()` chat seam live in its embedded logic class.
- `support.js` — runtime the prototype loads (no need to read it; included so the HTML opens).
- **`tokens.css`** — the design system as CSS custom properties (light theme + dark scaffold +
  reduced-motion rule). Drop in directly, or map onto your existing system's variables.
- **`tokens.json`** — the same design system, machine-readable (W3C-ish design-tokens shape)
  for Style Dictionary / Tailwind config / Figma Tokens / theming pipelines.

## Notes & open items (not yet designed)
- **Dashboard / Insights** (mood trend + top stress triggers; every chart paired with a data
  table) and **Settings** (exam + exam-date countdown, mute, reduced-motion override, data
  export + wipe) are named in the brief but **not built** in this prototype — design or
  implement them to match these tokens and constraints.
- A **dark theme** (warm-neutral dark bg, lifted surfaces, same sage primary) is intended for
  late-night studying — plan token aliases accordingly.
- The optional **sound layer** (synthesized, muteable, never sole signal) is specified but not
  implemented here.
