/**
 * ui.js — DOM rendering + event wiring. Browser only.
 *
 * The only module that touches the DOM. All dynamic text is written with
 * textContent (never innerHTML), so neither LLM output nor journal text can
 * inject markup — this is the core of the CSP/XSS posture. app.js owns state
 * and logic; this module owns presentation and emits user intents via the
 * `handlers` callbacks passed to `initUI`.
 */

import { createMascot, expressionFor } from './mascot.js';
import { createRecorder } from './voice.js';

const MOODS = [
  { value: 1, emoji: '😣', label: 'Awful' },
  { value: 2, emoji: '🙁', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' }
];

const VIEWS = ['journal', 'companion', 'mindfulness', 'focus', 'dashboard', 'settings'];

export function initUI(handlers = {}) {
  const $ = (id) => document.getElementById(id);
  const announce = (text) => { $('live-region').textContent = text; };

  const mascot = createMascot({ state: 'idle' });
  $('mascot-mount').appendChild(mascot.element);

  buildMoodOptions($('mood-options'));
  wireTabs($, handlers);
  wireJournal($, handlers);
  wireChat($, handlers);
  wireSettings($, handlers);
  wireData($, handlers);
  wireCrisis($);
  const breathing = createBreathing($);
  const focus = createFocusTimer($, handlers, announce);
  const voice = createVoiceUI($, handlers);

  return {
    setView: (view) => setView($, view),
    focusField: (field) => focusField($, field),
    renderProgress: (g) => renderProgress($, g),
    renderEntries: (entries) => renderEntries($, entries),
    renderDashboard: (insights) => renderDashboard($, insights),
    renderChatHistory: (chat) => renderChatHistory($, chat),
    addChatMessage: (msg) => addChatMessage($, msg),
    setChatBusy: (busy) => { $('chat-send').disabled = busy; $('chat-input').disabled = busy; },
    showCrisis: (message, helplines) => showCrisis($, message, helplines),
    hideCrisis: () => { $('crisis-panel').hidden = true; },
    setOffline: (offline, text) => setOffline($, offline, text),
    announce,
    celebrate: () => celebrate($),
    setMascot: (expr) => mascot.setExpression(expr),
    setMascotFromInsights: (insights) => mascot.setExpression(expressionFor(insights)),
    applySettings: (settings) => { applySettings($, settings); focus.setLength(settings.focusMinutes); },
    setReducedMotion: (on) => document.body.classList.toggle('reduced-motion', !!on),
    stopBreathing: () => breathing.stop(),
    pauseFocus: () => focus.pause(),
    renderFocusCount: (n) => { $('focus-count').textContent = String(n); },
    enableVoice: () => voice.enable()
  };
}

// --- builders & wiring ------------------------------------------------------

function buildMoodOptions(root) {
  MOODS.forEach((m, i) => {
    const id = `mood-${m.value}`;
    const label = document.createElement('label');
    label.className = 'mood__option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'mood';
    input.value = String(m.value);
    input.id = id;
    if (i === 2) input.checked = true; // default to "Okay"
    const face = document.createElement('span');
    face.className = 'mood__emoji';
    face.textContent = m.emoji;
    const text = document.createElement('span');
    text.className = 'mood__text';
    text.textContent = m.label;
    label.append(input, face, text);
    root.appendChild(label);
  });
}

function wireTabs($, handlers) {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      setView($, view);
      if (handlers.onViewChange) handlers.onViewChange(view);
    });
  });
}

function setView($, view) {
  if (!VIEWS.includes(view)) view = 'journal';
  document.body.dataset.view = view;
  VIEWS.forEach((v) => {
    const section = $(`view-${v}`);
    if (section) section.hidden = v !== view;
  });
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.view === view));
  });
  $('main').focus();
}

/** Switch to the view that owns a field, then focus it (used by the reflect loop). */
function focusField($, field) {
  const owner = field === 'chat-input' ? 'companion' : 'journal';
  setView($, owner);
  const el = $(field);
  if (el) el.focus();
}

function wireJournal($, handlers) {
  $('journal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('journal-text').value.trim();
    if (!text) return;
    const checked = document.querySelector('input[name="mood"]:checked');
    const mood = checked ? Number(checked.value) : 3;
    if (handlers.onJournalSave) handlers.onJournalSave({ text, mood });
    $('journal-text').value = '';
  });
}

function wireChat($, handlers) {
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('chat-input').value.trim();
    if (!text) return;
    $('chat-input').value = '';
    if (handlers.onSendMessage) handlers.onSendMessage(text);
  });
}

function wireSettings($, handlers) {
  const emit = () => {
    if (!handlers.onSettingsChange) return;
    handlers.onSettingsChange({
      exam: $('set-exam').value,
      examDate: $('set-examdate').value,
      muted: $('set-muted').checked,
      reducedMotion: $('set-reduced').checked
    });
  };
  ['set-exam', 'set-examdate', 'set-muted', 'set-reduced'].forEach((id) =>
    $(id).addEventListener('change', emit)
  );
}

function wireData($, handlers) {
  $('export-btn').addEventListener('click', () => handlers.onExport && handlers.onExport());
  $('wipe-btn').addEventListener('click', () => {
    if (window.confirm('Permanently erase all your journal entries, chats and settings on this device?')) {
      handlers.onWipe && handlers.onWipe();
    }
  });
}

function wireCrisis($) {
  $('crisis-dismiss').addEventListener('click', () => {
    $('crisis-panel').hidden = true;
  });
}

// --- voice (mic) UI ---------------------------------------------------------

/**
 * Wires the mic buttons once voice is available. Owns the recorder + recording
 * state; delegates the actual transcription to handlers.onTranscribe(blob),
 * which app.js fulfils against the local Whisper server.
 */
function createVoiceUI($, handlers) {
  const recorder = createRecorder();
  const TARGETS = [
    { mic: 'journal-mic', status: 'journal-voice-status', field: 'journal-text' },
    { mic: 'chat-mic', status: null, field: 'chat-input' }
  ];

  function enable() {
    document.querySelectorAll('[data-feature="voice"]').forEach((el) => { el.hidden = false; });
    TARGETS.forEach(wire);
  }

  function wire(t) {
    const btn = $(t.mic);
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => toggle(t, btn));
  }

  function setStatus(t, text) {
    if (t.status) $(t.status).textContent = text;
    else $('live-region').textContent = text;
  }

  async function toggle(t, btn) {
    if (recorder.isRecording()) return finish(t, btn);
    try {
      await recorder.start();
      btn.setAttribute('aria-pressed', 'true');
      setStatus(t, '🎙️ Listening… tap again to stop.');
    } catch {
      setStatus(t, 'Microphone unavailable — you can type instead.');
    }
  }

  async function finish(t, btn) {
    btn.setAttribute('aria-pressed', 'false');
    btn.disabled = true;
    setStatus(t, 'Transcribing on your device…');
    try {
      const blob = await recorder.stop();
      const text = await handlers.onTranscribe(blob);
      if (text) {
        appendToField($, t.field, text);
        setStatus(t, 'Added — edit it however you like.');
      } else {
        setStatus(t, "Didn't catch that — try again or type.");
      }
    } catch {
      setStatus(t, 'Transcription failed — you can type instead.');
    } finally {
      btn.disabled = false;
    }
  }

  return { enable };
}

function appendToField($, fieldId, text) {
  const el = $(fieldId);
  if (!el) return;
  el.value = el.value ? `${el.value.trim()} ${text}` : text;
  el.focus();
}

// --- rendering --------------------------------------------------------------

function renderProgress($, g) {
  $('hud-streak').textContent = String(g.streak);
  $('hud-level').textContent = String(g.level);
  $('hud-xp').textContent = String(g.xp);
  const pct = Math.round((g.levelProgress || 0) * 100);
  $('hud-xpbar').style.width = `${pct}%`;
}

function renderEntries($, entries) {
  const root = $('journal-recent');
  root.textContent = '';
  const recent = [...entries].sort((a, b) => b.ts - a.ts).slice(0, 8);
  if (recent.length === 0) {
    const li = document.createElement('li');
    li.className = 'entries__empty';
    li.textContent = 'No entries yet — your first reflection starts your streak. ✨';
    root.appendChild(li);
    return;
  }
  for (const e of recent) {
    const li = document.createElement('li');
    li.className = 'entry';
    const meta = document.createElement('div');
    meta.className = 'entry__meta';
    const mood = MOODS.find((m) => m.value === e.mood) || MOODS[2];
    meta.textContent = `${mood.emoji} ${mood.label} · ${formatDate(e.ts)}`;
    const body = document.createElement('p');
    body.className = 'entry__text';
    body.textContent = e.text;
    li.append(meta, body);
    root.appendChild(li);
  }
}

function renderChatHistory($, chat) {
  const log = $('chat-log');
  log.textContent = '';
  if (chat.length === 0) {
    addChatMessage($, {
      role: 'assistant',
      content: "Hi, I'm Saathi 💙 I'm here whenever exam stress feels heavy. What's on your mind?"
    });
    return;
  }
  for (const m of chat) addChatMessage($, m);
}

/** Append a chat bubble; returns the text node element so callers can stream into it. */
function addChatMessage($, msg) {
  const log = $('chat-log');
  const bubble = document.createElement('div');
  bubble.className = `bubble bubble--${msg.role === 'user' ? 'user' : 'saathi'}`;
  const who = document.createElement('span');
  who.className = 'bubble__who';
  who.textContent = msg.role === 'user' ? 'You' : 'Saathi';
  const text = document.createElement('p');
  text.className = 'bubble__text';
  text.textContent = msg.content || '';
  bubble.append(who, text);
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return text; // stream by appending to text.textContent
}

function renderDashboard($, insights) {
  const summary = $('dash-summary');
  if (insights.entryCount === 0) {
    summary.textContent = 'Write a few journal entries and your insights will appear here.';
  } else {
    const cd = insights.examCountdown;
    const examBit = insights.exam && cd != null ? ` ${insights.exam} is ${cd} day${cd === 1 ? '' : 's'} away.` : '';
    summary.textContent = `${insights.entryCount} entries · overall mood ${insights.sentiment.label} · ${insights.streak}-day streak.${examBit}`;
  }

  renderTrend($('dash-trend'), insights.moodTrend);
  renderTriggers($('dash-triggers'), insights.triggers);

  const patterns = $('dash-patterns');
  patterns.textContent = '';
  if (insights.patterns.length === 0) {
    const li = document.createElement('li');
    li.textContent = insights.entryCount === 0 ? '—' : 'No clear patterns yet — keep journalling.';
    patterns.appendChild(li);
  } else {
    for (const p of insights.patterns) {
      const li = document.createElement('li');
      li.textContent = p;
      patterns.appendChild(li);
    }
  }
}

/** Mood trend as an accessible bar visual + a real data table (not colour-only). */
function renderTrend(root, trend) {
  root.textContent = '';
  if (!trend.points.length) {
    root.textContent = 'No mood data yet.';
    return;
  }
  const chart = document.createElement('div');
  chart.className = 'trend__bars';
  chart.setAttribute('aria-hidden', 'true');
  for (const p of trend.points.slice(-14)) {
    const bar = document.createElement('div');
    bar.className = `trend__bar mood-${Math.round(p.mood)}`;
    bar.style.height = `${(p.mood / 5) * 100}%`;
    bar.title = `${p.date}: ${p.mood}`;
    chart.appendChild(bar);
  }

  const table = document.createElement('table');
  table.className = 'trend__table';
  const caption = document.createElement('caption');
  caption.textContent = `Mood by day (1 low – 5 great). Trend: ${trend.direction}.`;
  table.appendChild(caption);
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Date', 'Mood (1–5)'].forEach((h) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  const tbody = document.createElement('tbody');
  for (const p of trend.points.slice(-14)) {
    const tr = document.createElement('tr');
    const d = document.createElement('td');
    d.textContent = p.date;
    const m = document.createElement('td');
    m.textContent = String(p.mood);
    tr.append(d, m);
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  root.append(chart, table);
}

function renderTriggers(root, triggers) {
  root.textContent = '';
  if (!triggers.length) {
    root.textContent = 'No recurring themes detected yet.';
    return;
  }
  const max = triggers[0].count || 1;
  for (const t of triggers.slice(0, 6)) {
    const row = document.createElement('div');
    row.className = 'trigger';
    const name = document.createElement('span');
    name.className = 'trigger__name';
    name.textContent = t.theme;
    const meter = document.createElement('span');
    meter.className = 'trigger__meter';
    const fill = document.createElement('span');
    fill.className = 'trigger__fill';
    fill.style.width = `${Math.round((t.count / max) * 100)}%`;
    meter.appendChild(fill);
    const count = document.createElement('span');
    count.className = 'trigger__count';
    count.textContent = `${t.count}×`;
    row.append(name, meter, count);
    root.appendChild(row);
  }
}

function showCrisis($, message, helplines) {
  $('crisis-message').textContent = message;
  const list = $('crisis-helplines');
  list.textContent = '';
  for (const h of helplines) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = h.name;
    const num = document.createElement('span');
    num.textContent = ` — ${h.number} (${h.note})`;
    li.append(strong, num);
    list.appendChild(li);
  }
  $('crisis-panel').hidden = false;
  $('crisis-panel').scrollIntoView({ block: 'start' });
  $('crisis-dismiss').focus();
}

function setOffline($, offline, text) {
  const banner = $('offline-banner');
  banner.hidden = !offline;
  if (text) $('offline-banner-text').textContent = text;
}

function applySettings($, s) {
  $('set-exam').value = s.exam || '';
  $('set-examdate').value = s.examDate || '';
  $('set-muted').checked = !!s.muted;
  $('set-reduced').checked = !!s.reducedMotion;
}

// --- confetti (CSS-transform particles, respects reduced-motion via CSS) -----

function celebrate($) {
  if (document.body.classList.contains('reduced-motion') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const root = $('confetti-root');
  const colors = ['#ffd166', '#7c5cff', '#ff9bb3', '#06d6a0', '#4cc9f0'];
  for (let i = 0; i < 28; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.25}s`;
    bit.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    root.appendChild(bit);
    setTimeout(() => bit.remove(), 1600);
  }
}

// --- breathing exercise -----------------------------------------------------

function createBreathing($) {
  const PHASES = [
    { name: 'Breathe in', ms: 4000, cls: 'inhale' },
    { name: 'Hold', ms: 4000, cls: 'hold' },
    { name: 'Breathe out', ms: 4000, cls: 'exhale' }
  ];
  const TOTAL_CYCLES = 4;
  let timer = null;
  let cycle = 0;
  let phaseIdx = 0;

  const circle = $('breath-circle');
  const phaseEl = $('breath-phase');
  const status = $('breath-status');
  const startBtn = $('breath-start');
  const stopBtn = $('breath-stop');

  function setProgress(pct) {
    status.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function runPhase() {
    if (cycle >= TOTAL_CYCLES) return finish();
    const phase = PHASES[phaseIdx];
    phaseEl.textContent = phase.name;
    status.textContent = `${phase.name} — cycle ${cycle + 1} of ${TOTAL_CYCLES}`;
    circle.classList.remove('inhale', 'hold', 'exhale');
    void circle.offsetWidth; // restart transition
    circle.classList.add(phase.cls);

    const totalSteps = PHASES.length * TOTAL_CYCLES;
    const doneSteps = cycle * PHASES.length + phaseIdx;
    setProgress((doneSteps / totalSteps) * 100);

    timer = setTimeout(() => {
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      if (phaseIdx === 0) cycle += 1;
      runPhase();
    }, phase.ms);
  }

  function start() {
    stop();
    cycle = 0;
    phaseIdx = 0;
    startBtn.hidden = true;
    stopBtn.hidden = false;
    runPhase();
  }

  function finish() {
    stop();
    phaseEl.textContent = 'Well done 💙';
    status.textContent = 'Cycle complete. Notice how you feel now.';
    setProgress(100);
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    circle.classList.remove('inhale', 'hold', 'exhale');
    startBtn.hidden = false;
    stopBtn.hidden = true;
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', () => {
    stop();
    phaseEl.textContent = 'Stopped';
    status.textContent = 'Paused. Start again whenever you like.';
  });

  return { start, stop };
}

// --- focus / pomodoro timer -------------------------------------------------

/**
 * Circular Pomodoro timer. On completion it celebrates, reports the session up
 * to app.js (handlers.onFocusComplete), and reveals a reflection prompt that
 * routes the student to Journal (to log the session) or the Companion (to ask a
 * live doubt) — closing the study → reflect → resolve loop.
 *
 * Accessibility: role="timer" with aria-live="off" so it does NOT announce
 * every second; meaningful moments are announced once via the live region.
 */
function createFocusTimer($, handlers, announce) {
  const CIRC = 339.292; // 2πr, r = 54 (matches the SVG)
  const MIN = 5;
  const MAX = 60;

  let lengthMin = 25;
  let remaining = lengthMin * 60; // seconds
  let running = false;
  let ticker = null;

  const timeEl = $('focus-time');
  const lengthEl = $('focus-length');
  const ring = $('focus-progress');
  const status = $('focus-status');
  const startBtn = $('focus-start');
  const pauseBtn = $('focus-pause');
  const resetBtn = $('focus-reset');
  const minusBtn = $('focus-minus');
  const plusBtn = $('focus-plus');
  const reflect = $('focus-reflect');

  // Mascot lives in the centre of the ring.
  const buddy = createMascot({ state: 'happy' });
  $('focus-mascot').appendChild(buddy.element);

  function fmt(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function render() {
    timeEl.textContent = fmt(remaining);
    lengthEl.textContent = String(lengthMin);
    const total = lengthMin * 60;
    const frac = total ? (total - remaining) / total : 0;
    ring.style.strokeDashoffset = String(CIRC * (1 - frac));
    ring.classList.toggle('is-running', running);
  }

  function setLength(min) {
    const n = Number(min);
    if (!Number.isFinite(n)) return;
    lengthMin = Math.min(MAX, Math.max(MIN, Math.round(n / 5) * 5 || 25));
    if (!running) remaining = lengthMin * 60;
    render();
  }

  function adjust(delta) {
    if (running) return; // don't change a session mid-flight
    setLength(lengthMin + delta);
    if (handlers.onFocusLengthChange) handlers.onFocusLengthChange(lengthMin);
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      render();
      return complete();
    }
    render();
  }

  function start() {
    if (running) return;
    reflect.hidden = true;
    if (remaining <= 0) remaining = lengthMin * 60;
    running = true;
    startBtn.hidden = true;
    pauseBtn.hidden = false;
    resetBtn.hidden = false;
    buddy.setExpression('cheer');
    status.textContent = `Focusing — ${fmt(remaining)} to go. You've got this.`;
    announce(`Focus session started: ${lengthMin} minutes.`);
    ticker = setInterval(tick, 1000);
    render();
  }

  function pause() {
    if (!running) return;
    clearInterval(ticker);
    ticker = null;
    running = false;
    startBtn.hidden = false;
    startBtn.textContent = 'Resume';
    pauseBtn.hidden = true;
    buddy.setExpression('idle');
    status.textContent = `Paused at ${fmt(remaining)}.`;
    render();
  }

  function reset() {
    clearInterval(ticker);
    ticker = null;
    running = false;
    remaining = lengthMin * 60;
    startBtn.hidden = false;
    startBtn.textContent = 'Start';
    pauseBtn.hidden = true;
    resetBtn.hidden = true;
    reflect.hidden = true;
    buddy.setExpression('happy');
    status.textContent = 'Set your timer and press start.';
    render();
  }

  function complete() {
    clearInterval(ticker);
    ticker = null;
    running = false;
    startBtn.hidden = false;
    startBtn.textContent = 'Start';
    pauseBtn.hidden = true;
    resetBtn.hidden = true;
    buddy.setExpression('cheer');
    status.textContent = 'Session complete! 🎉';
    announce(`Focus session complete. ${lengthMin} minutes done — well done!`);
    reflect.hidden = false;
    if (handlers.onFocusComplete) handlers.onFocusComplete(lengthMin);
  }

  minusBtn.addEventListener('click', () => adjust(-5));
  plusBtn.addEventListener('click', () => adjust(5));
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);
  $('reflect-journal').addEventListener('click', () => {
    reflect.hidden = true;
    if (handlers.onReflectJournal) handlers.onReflectJournal(lengthMin);
  });
  $('reflect-ask').addEventListener('click', () => {
    reflect.hidden = true;
    if (handlers.onReflectAsk) handlers.onReflectAsk(lengthMin);
  });

  render();
  return { setLength, pause };
}

// --- helpers ----------------------------------------------------------------

function formatDate(ts) {
  const d = new Date(Number(ts));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
