/**
 * ui.js — DOM rendering + event wiring. Browser only.
 *
 * The only module that touches the DOM. Dynamic text uses textContent (never
 * innerHTML), so neither LLM output nor journal text can inject markup. app.js
 * owns state/logic + the real engine/provider; this module renders the design
 * (mascot builder, journal, focus, companion, breathe, overlays) and emits user
 * intents via the `handlers` callbacks. Visuals follow the Saathi design system.
 */

import { makeMascot, shapeIcon, moodIcon, expressionFor, SHAPES, ACCESSORIES, PALETTE } from './mascot.js';
import { icon } from './icons.js';
import { createRecorder } from './voice.js';

const VIEWS = ['journal', 'focus', 'companion', 'breathe', 'dashboard', 'settings'];
const MOOD_LABELS = { 1: 'Low', 2: 'Meh', 3: 'Okay', 4: 'Good', 5: 'Great' };

export function initUI(handlers = {}) {
  const $ = (id) => document.getElementById(id);
  const announce = (t) => { $('live-region').textContent = t; };

  // Working copy of the mascot config (live-edited in the builder).
  let cfg = { shape: 'pentagon', color: '#639922', accessory: 'sprout', name: 'Pip' };
  let mood = 0;        // selected journal mood (0 = none)
  let focusMood = 0;   // selected post-focus mood

  setStaticIcons($);
  buildOnboarding($, handlers, () => cfg, (next) => { cfg = { ...cfg, ...next }; renderBuilder($, cfg); if (handlers.onMascotChange) handlers.onMascotChange(cfg); });
  wireTabs($, handlers);
  wireHeaderNav($, handlers);
  wireJournal($, handlers, () => mood, (m) => { mood = m; });
  wireChat($, handlers);
  wireSettings($, handlers);
  wireData($, handlers);
  wireOverlays($);
  const breathing = createBreathing($, announce);
  const focus = createFocusTimer($, handlers, announce, () => cfg, (m) => { focusMood = m; }, () => focusMood);
  const voice = createVoiceUI($, handlers);

  return {
    setOnboarded: (on) => {
      $('view-onboarding').hidden = on;
      $('tabbar').hidden = !on;
      if (on) setView($, 'journal');
      else VIEWS.forEach((v) => { const s = $(`view-${v}`); if (s) s.hidden = true; });
    },
    renderMascot: (config) => { cfg = { ...cfg, ...config }; renderBuilder($, cfg); renderNames($, cfg); },
    refreshMascots: (insights) => refreshMascots($, cfg, insights, mood),
    setView: (view) => setView($, view),
    focusField: (field) => focusField($, field),
    renderJournal: (insights, ctx) => renderJournal($, insights, ctx, mood),
    setMood: (m) => { mood = m; renderMoodPicker($, mood, () => {}); },
    resetMood: () => { mood = 0; },
    renderProgress: (insights) => renderProgress($, insights),
    renderDashboard: (insights) => renderDashboard($, insights),
    renderChatHistory: (chat) => renderChatHistory($, chat, cfg),
    addChatMessage: (msg) => addChatMessage($, msg, cfg),
    setTyping: (on) => setTyping($, on, cfg),
    setChatBusy: (busy) => { $('chat-send').disabled = busy; $('chat-input').disabled = busy; },
    renderSuggested: (list) => renderSuggested($, list, handlers),
    setOffline: (offline) => setChatOffline($, offline, cfg),
    showOverlay: (kind, data) => showOverlay($, kind, data, cfg),
    showCrisis: (helplines) => showCrisis($, helplines),
    hideOverlay: () => hideOverlay($),
    announce,
    applySettings: (settings) => { applySettings($, settings); focus.setLength(settings.focusMinutes); },
    setReducedMotion: (on) => document.body.classList.toggle('reduced-motion', !!on),
    stopBreathing: () => breathing.stop(),
    pauseFocus: () => focus.pause(),
    enableVoice: () => voice.enable(),
    resetFocus: () => focus.reset()
  };
}

// --- static one-time icons ---------------------------------------------------

function setStaticIcons($) {
  mount($('jhead-lock'), icon('lock', { size: 13, color: '#888780' }));
  mount($('streak-flame'), icon('flame', { size: 18, color: '#EF9F27' }));
  mount($('open-settings'), icon('gear', { size: 20, color: '#5F5E5A' }));
  mount($('ob-lock-icon'), icon('lock', { size: 14, color: '#888780' }));
  mount($('focus-bell'), icon('bell', { size: 16, color: '#3B6D11' }));
  mount($('focus-tip-icon'), icon('tip', { size: 20, color: '#639922' }));
  mount($('focus-minus'), icon('minus', { size: 22, color: '#3B6D11' }));
  mount($('focus-plus'), icon('plus', { size: 22, color: '#3B6D11' }));
  mount($('chat-send'), icon('send', { size: 22 }));
  mount($('chat-offline-icon'), icon('wifiOff', { size: 20, color: '#0C447C' }));
  mount($('crisis-heart'), icon('heart', { size: 24 }));
  mount($('crisis-close'), icon('x', { size: 20, color: '#0C447C' }));
  mount($('insights-back'), icon('journal', { size: 20, color: '#5F5E5A' }));
  mount($('settings-back'), icon('journal', { size: 20, color: '#5F5E5A' }));
  mount($('journal-mic-icon'), icon('mic', { size: 18, color: '#3B6D11' }));
  mount($('chat-mic'), icon('mic', { size: 20, color: '#3B6D11' }));
  mount($('export-icon'), icon('download', { size: 18, color: '#3B6D11' }));
  mount($('wipe-icon'), icon('trash', { size: 18, color: '#b3174f' }));
  mount($('tabicon-journal'), icon('journal', { size: 23, color: '#9b9788' }));
  mount($('tabicon-focus'), icon('focus', { size: 23, color: '#9b9788' }));
  mount($('tabicon-companion'), icon('companion', { size: 23, color: '#9b9788' }));
  mount($('tabicon-breathe'), icon('breathe', { size: 23, color: '#9b9788' }));
  mount($('streak-big-flame'), icon('flame', { size: 48, color: '#EF9F27' }));
}

// --- onboarding (mascot builder) --------------------------------------------

function buildOnboarding($, handlers, getCfg, setCfg) {
  // Shape chooser
  const shapesRoot = $('ob-shapes');
  SHAPES.forEach((sh) => {
    const b = document.createElement('button');
    b.className = 'choice choice--shape';
    b.dataset.shape = sh;
    b.setAttribute('aria-label', sh);
    b.addEventListener('click', () => setCfg({ shape: sh }));
    shapesRoot.appendChild(b);
  });
  // Colour chooser
  const colorsRoot = $('ob-colors');
  PALETTE.forEach(([hex, label]) => {
    const b = document.createElement('button');
    b.className = 'choice choice--color';
    b.dataset.color = hex;
    b.setAttribute('aria-label', label);
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = hex;
    b.appendChild(sw);
    b.addEventListener('click', () => setCfg({ color: hex }));
    colorsRoot.appendChild(b);
  });
  // Accessory chooser
  const accRoot = $('ob-accs');
  const accLabels = { none: 'None', sprout: 'Sprout', sparkle: 'Spark', cap: 'Cap', specs: 'Specs' };
  ACCESSORIES.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'choice choice--acc';
    b.dataset.acc = a;
    b.setAttribute('aria-label', accLabels[a]);
    const lab = document.createElement('span');
    lab.textContent = accLabels[a];
    b.dataset.labelSlot = '1';
    b._label = lab;
    b.addEventListener('click', () => setCfg({ accessory: a }));
    accRoot.appendChild(b);
  });
  // Name
  $('ob-name').addEventListener('input', (e) => setCfg({ name: (e.target.value || '').slice(0, 14) }));
  $('ob-finish').addEventListener('click', () => handlers.onFinishOnboard && handlers.onFinishOnboard(getCfg()));
}

function renderBuilder($, cfg) {
  // Live preview
  mount($('ob-preview'), makeMascot({ ...cfg, expr: 'happy', size: 150 }));
  // Shape glyphs + selection
  for (const b of $('ob-shapes').children) {
    const sel = b.dataset.shape === cfg.shape;
    b.setAttribute('aria-pressed', String(sel));
    mount(b, shapeIcon(b.dataset.shape, sel ? cfg.color : '#c7c2b3'));
  }
  for (const b of $('ob-colors').children) {
    b.setAttribute('aria-pressed', String(b.dataset.color === cfg.color));
  }
  for (const b of $('ob-accs').children) {
    const sel = b.dataset.acc === cfg.accessory;
    b.setAttribute('aria-pressed', String(sel));
    b.textContent = '';
    const glyph = b.dataset.acc === 'none'
      ? icon('none', { size: 22, color: sel ? '#3B6D11' : '#888780' })
      : makeMascot({ shape: 'circle', color: cfg.color, accessory: b.dataset.acc, expr: 'idle', size: 30 });
    b.appendChild(glyph);
    b.appendChild(b._label);
  }
  const name = cfg.name || 'Pip';
  if ($('ob-name').value !== cfg.name) $('ob-name').value = cfg.name || '';
  $('ob-finish').textContent = `Meet ${name}`;
}

// --- mascot mounts across views ---------------------------------------------

function renderNames($, cfg) {
  const name = cfg.name || 'Saathi';
  $('tab-companion-label').textContent = name;
  $('companion-h').textContent = name;
  document.querySelectorAll('.reflect-name, .ov-name').forEach((s) => { s.textContent = name; });
  $('chat-input').placeholder = `Tell ${name} anything…`;
}

function refreshMascots($, cfg, insights, mood) {
  const homeExpr = mood >= 4 ? 'happy' : (mood === 1 || mood === 2 ? 'concerned' : expressionFor(insights || {}));
  mount($('home-mascot'), makeMascot({ ...cfg, expr: homeExpr, size: 64 }));
  mount($('chat-mascot'), makeMascot({ ...cfg, expr: 'idle', size: 42 }));
  mount($('focus-mascot'), makeMascot({ ...cfg, expr: 'idle', size: 70 }));
  renderNames($, cfg);
}

// --- tabs + header nav -------------------------------------------------------

function wireTabs($, handlers) {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      setView($, view);
      if (handlers.onViewChange) handlers.onViewChange(view);
    });
  });
}

function wireHeaderNav($, handlers) {
  $('open-insights').addEventListener('click', () => { setView($, 'dashboard'); handlers.onViewChange && handlers.onViewChange('dashboard'); });
  $('open-settings').addEventListener('click', () => { setView($, 'settings'); handlers.onViewChange && handlers.onViewChange('settings'); });
  $('insights-back').addEventListener('click', () => { setView($, 'journal'); handlers.onViewChange && handlers.onViewChange('journal'); });
  $('settings-back').addEventListener('click', () => { setView($, 'journal'); handlers.onViewChange && handlers.onViewChange('journal'); });
}

function setView($, view) {
  if (!VIEWS.includes(view)) view = 'journal';
  document.body.dataset.view = view;
  VIEWS.forEach((v) => { const s = $(`view-${v}`); if (s) s.hidden = v !== view; });
  // Bottom-nav active state (only the 4 primary tabs).
  document.querySelectorAll('.tab').forEach((b) => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  recolorTabs($, view);
  $('main').focus();
}

function recolorTabs($, view) {
  const map = { journal: 'tabicon-journal', focus: 'tabicon-focus', companion: 'tabicon-companion', breathe: 'tabicon-breathe' };
  for (const [v, id] of Object.entries(map)) {
    const active = v === view;
    mount($(id), icon(v, { size: 23, color: active ? '#639922' : '#9b9788', sw: active ? 2.3 : 2 }));
  }
}

function focusField($, field) {
  const owner = field === 'chat-input' ? 'companion' : 'journal';
  setView($, owner);
  const el = $(field);
  if (el) el.focus();
}

// --- journal -----------------------------------------------------------------

function wireJournal($, handlers, getMood, setMood) {
  buildMoodPicker($('mood-options'), 'mood__btn', true, (m) => {
    setMood(m);
    refreshMoodSelection($('mood-options'), m);
    $('journal-save').disabled = m === 0;
    if (handlers.onMoodPicked) handlers.onMoodPicked(m);
  });
  $('journal-save').addEventListener('click', () => {
    const text = $('journal-text').value.trim();
    const m = getMood();
    if (m === 0) return;
    if (handlers.onJournalSave) handlers.onJournalSave({ text, mood: m });
  });
}

function buildMoodPicker(root, btnClass, withLabel, onPick) {
  root.textContent = '';
  [1, 2, 3, 4, 5].forEach((level) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = withLabel ? `${btnClass}` : `${btnClass} mood__btn--compact`;
    b.dataset.level = String(level);
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', MOOD_LABELS[level]);
    b.appendChild(moodIcon(level, '#5F5E5A'));
    if (withLabel) {
      const lab = document.createElement('span');
      lab.className = 'mood__btn-label';
      lab.textContent = MOOD_LABELS[level];
      b.appendChild(lab);
    }
    b.addEventListener('click', () => onPick(level));
    root.appendChild(b);
  });
}

function refreshMoodSelection(root, selected) {
  for (const b of root.children) {
    const level = Number(b.dataset.level);
    const sel = level === selected;
    b.setAttribute('aria-pressed', String(sel));
    mount(b, moodIcon(level, sel ? '#3B6D11' : '#5F5E5A'), true);
  }
}

function renderMoodPicker($, selected, onPick) {
  // mood-options is built once in wireJournal; this just refreshes selection.
  if ($('mood-options').children.length) refreshMoodSelection($('mood-options'), selected);
}

function renderJournal($, insights, ctx, mood) {
  ctx = ctx || {};
  // greeting context line
  const cd = insights.examCountdown;
  const examBit = insights.exam && cd != null ? ` · ${insights.exam} in ${cd} day${cd === 1 ? '' : 's'}` : '';
  $('jhead-context').textContent = `On your device${examBit}`;
  $('streak-num').textContent = String(insights.streak || 0);

  // day dots
  const dotsRoot = $('day-dots');
  dotsRoot.textContent = '';
  (insights.weekDots || []).forEach((d) => {
    const wrap = document.createElement('div');
    wrap.className = 'day-dot';
    const l = document.createElement('span');
    l.className = 'day-dot__l';
    l.textContent = d.label;
    const c = document.createElement('span');
    c.className = `day-dot__c day-dot__c--${d.state}`;
    if (d.state === 'done') c.appendChild(icon('check', { size: 18, color: '#fff', sw: 2.4 }));
    else if (d.state === 'today') c.textContent = '•';
    wrap.append(l, c);
    dotsRoot.appendChild(wrap);
  });

  // focus context chip
  const chip = $('focus-ctx-chip');
  if (ctx.fromFocus) {
    chip.textContent = '';
    chip.appendChild(icon('clock', { size: 14, color: '#3B6D11' }));
    const t = document.createElement('span');
    t.textContent = ` After a ${ctx.focusMin}-min focus session`;
    chip.appendChild(t);
    chip.hidden = false;
  } else {
    chip.hidden = true;
  }

  // prompt bubble (mood-aware)
  $('prompt-bubble').textContent = promptText(ctx, mood);
}

function promptText(ctx, mood) {
  if (ctx.fromFocus) return `You just focused for ${ctx.focusMin} minutes — how are you feeling now?`;
  if (mood >= 4) return 'Love that for you. What made today a little brighter?';
  if (mood && mood <= 2) return "Thanks for being honest with me. What's weighing on you?";
  return "However today went, it's worth a few words. I'm listening.";
}

function renderProgress($, insights) {
  $('streak-num').textContent = String(insights.streak || 0);
}

// --- chat --------------------------------------------------------------------

function wireChat($, handlers) {
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('chat-input').value.trim();
    if (!text) return;
    $('chat-input').value = '';
    if (handlers.onSendMessage) handlers.onSendMessage(text);
  });
  $('chat-offline-toggle').addEventListener('click', () => handlers.onToggleOffline && handlers.onToggleOffline());
}

function renderChatHistory($, chat, cfg) {
  const log = $('chat-log');
  log.textContent = '';
  if (!chat.length) {
    addChatMessage($, { role: 'assistant', content: `Hi, I'm here with you. No pressure — what's on your mind today?` }, cfg);
    return;
  }
  for (const m of chat) addChatMessage($, { role: m.role === 'me' ? 'user' : m.role, content: m.content || m.text }, cfg);
}

function addChatMessage($, msg, cfg) {
  const log = $('chat-log');
  const me = msg.role === 'user';
  const row = document.createElement('div');
  row.className = `chat__row chat__row--${me ? 'me' : 'saathi'}`;
  const bubble = document.createElement('div');
  bubble.className = `chat__bubble chat__bubble--${me ? 'me' : 'saathi'} saFade`;
  bubble.textContent = msg.content || '';
  row.appendChild(bubble);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  return bubble; // stream into bubble.textContent
}

function setTyping($, on, cfg) {
  const log = $('chat-log');
  let t = $('typing-indicator');
  if (on && !t) {
    t = document.createElement('div');
    t.id = 'typing-indicator';
    t.className = 'typing';
    for (let i = 0; i < 3; i++) t.appendChild(document.createElement('span'));
    log.appendChild(t);
    log.scrollTop = log.scrollHeight;
  } else if (!on && t) {
    t.remove();
  }
}

function setChatOffline($, offline, cfg) {
  $('chat-status-dot').className = `status-dot${offline ? ' status-dot--offline' : ''}`;
  $('chat-status-text').textContent = offline ? 'Offline · fallback mode' : 'Here with you';
  $('chat-offline-toggle').textContent = offline ? 'Go online' : 'Test offline';
  const banner = $('chat-offline-banner');
  banner.hidden = !offline;
  if (offline) $('chat-offline-text').textContent = `${($('companion-h').textContent) || 'Saathi'}'s AI companion is offline. You can still try a grounding step below, or breathe together.`;
}

function renderSuggested($, list, handlers) {
  const root = $('chat-suggested');
  root.textContent = '';
  list.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = s.text;
    b.addEventListener('click', s.onClick);
    root.appendChild(b);
  });
}

// --- settings + data ---------------------------------------------------------

function wireSettings($, handlers) {
  const emit = () => handlers.onSettingsChange && handlers.onSettingsChange({
    exam: $('set-exam').value,
    examDate: $('set-examdate').value,
    muted: $('set-muted').checked,
    reducedMotion: $('set-reduced').checked
  });
  ['set-exam', 'set-examdate', 'set-muted', 'set-reduced'].forEach((id) => $(id).addEventListener('change', emit));
  $('set-rebuild').addEventListener('change', (e) => {
    if (e.target.checked) { e.target.checked = false; handlers.onRebuild && handlers.onRebuild(); }
  });
}

function wireData($, handlers) {
  $('export-btn').addEventListener('click', () => handlers.onExport && handlers.onExport());
  $('wipe-btn').addEventListener('click', () => {
    if (window.confirm('Permanently erase all your journal entries, chats and settings on this device?')) {
      handlers.onWipe && handlers.onWipe();
    }
  });
}

function applySettings($, s) {
  $('set-exam').value = s.exam || '';
  $('set-examdate').value = s.examDate || '';
  $('set-muted').checked = !!s.muted;
  $('set-reduced').checked = !!s.reducedMotion;
}

// --- dashboard (re-skinned; redesign owned by parallel session) --------------

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
  if (!insights.patterns.length) {
    const li = document.createElement('li');
    li.textContent = insights.entryCount === 0 ? '—' : 'No clear patterns yet — keep journalling.';
    patterns.appendChild(li);
  } else {
    insights.patterns.forEach((p) => { const li = document.createElement('li'); li.textContent = p; patterns.appendChild(li); });
  }
}

function renderTrend(root, trend) {
  root.textContent = '';
  if (!trend.points.length) { root.textContent = 'No mood data yet.'; return; }
  const chart = document.createElement('div');
  chart.className = 'trend__bars';
  chart.setAttribute('aria-hidden', 'true');
  for (const p of trend.points.slice(-14)) {
    const bar = document.createElement('div');
    bar.className = `trend__bar mood-${Math.round(p.mood)}`;
    bar.style.height = `${(p.mood / 5) * 100}%`;
    chart.appendChild(bar);
  }
  const table = document.createElement('table');
  table.className = 'trend__table';
  const caption = document.createElement('caption');
  caption.textContent = `Mood by day (1 low – 5 great). Trend: ${trend.direction}.`;
  table.appendChild(caption);
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Date', 'Mood (1–5)'].forEach((h) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = h; hr.appendChild(th); });
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  for (const p of trend.points.slice(-14)) {
    const tr = document.createElement('tr');
    const d = document.createElement('td'); d.textContent = p.date;
    const m = document.createElement('td'); m.textContent = String(p.mood);
    tr.append(d, m); tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  root.append(chart, table);
}

function renderTriggers(root, triggers) {
  root.textContent = '';
  if (!triggers.length) { root.textContent = 'No recurring themes detected yet.'; return; }
  const max = triggers[0].count || 1;
  for (const t of triggers.slice(0, 6)) {
    const row = document.createElement('div');
    row.className = 'trigger';
    const name = document.createElement('span'); name.className = 'trigger__name'; name.textContent = t.theme;
    const meter = document.createElement('span'); meter.className = 'trigger__meter';
    const fill = document.createElement('span'); fill.className = 'trigger__fill'; fill.style.width = `${Math.round((t.count / max) * 100)}%`;
    meter.appendChild(fill);
    const count = document.createElement('span'); count.className = 'trigger__count'; count.textContent = `${t.count}×`;
    row.append(name, meter, count);
    root.appendChild(row);
  }
}

// --- overlays ----------------------------------------------------------------

function wireOverlays($) {
  document.querySelectorAll('.overlay-dismiss').forEach((b) => {
    b.addEventListener('click', () => hideOverlay($));
  });
  $('crisis-close').addEventListener('click', () => hideOverlay($));
  $('crisis-ok').addEventListener('click', () => hideOverlay($));
}

function showOverlay($, kind, data, cfg) {
  hideOverlay($);
  data = data || {};
  if (kind === 'reward') {
    mount($('reward-mascot'), makeMascot({ ...cfg, expr: 'happy', size: 104 }));
    $('reward-streak').textContent = String(data.streak || 0);
    confetti($('reward-confetti'));
    open($, 'overlay-reward');
  } else if (kind === 'level') {
    mount($('level-mascot'), makeMascot({ ...cfg, expr: 'cheer', size: 120 }));
    $('level-num').textContent = String(data.level || 1);
    confetti($('level-confetti'));
    open($, 'overlay-level');
  } else if (kind === 'mile') {
    mount($('mile-mascot'), makeMascot({ ...cfg, expr: 'cheer', size: 104 }));
    confetti($('mile-confetti'));
    open($, 'overlay-mile');
  } else if (kind === 'streak') {
    mount($('streak-mascot'), makeMascot({ ...cfg, expr: 'happy', size: 96 }));
    $('streak-big-num').textContent = String(data.streak || 0);
    open($, 'overlay-streak');
  }
}

function open($, id) {
  const ov = $(id);
  ov.hidden = false;
  const btn = ov.querySelector('button');
  if (btn) btn.focus();
}

function hideOverlay($) {
  ['overlay-reward', 'overlay-level', 'overlay-mile', 'overlay-streak', 'overlay-crisis'].forEach((id) => { $(id).hidden = true; });
}

function showCrisis($, helplines) {
  const root = $('crisis-lines');
  root.textContent = '';
  for (const h of helplines) {
    const a = document.createElement('a');
    a.className = 'crisis__line';
    a.href = `tel:${(h.number || '').replace(/[^+\d]/g, '')}`;
    const left = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'crisis__line-name'; nm.textContent = h.name;
    const note = document.createElement('div'); note.className = 'crisis__line-note'; note.textContent = h.note;
    left.append(nm, note);
    const num = document.createElement('div'); num.className = 'crisis__line-num';
    num.appendChild(icon('phone', { size: 16, color: '#0C447C' }));
    const ns = document.createElement('span'); ns.textContent = h.number; num.appendChild(ns);
    a.append(left, num);
    root.appendChild(a);
  }
  const ov = $('overlay-crisis');
  ov.hidden = false;
  $('crisis-close').focus();
}

function confetti(root) {
  root.textContent = '';
  if (document.body.classList.contains('reduced-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = ['#EF9F27', '#639922', '#5B8DB8', '#9B86C4', '#E0A93E', '#E8907A'];
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('span');
    s.className = 'confetti';
    const w = 6 + Math.random() * 6;
    s.style.left = `${Math.random() * 100}%`;
    s.style.width = `${w}px`;
    s.style.height = `${w * 0.62}px`;
    s.style.background = cols[i % 6];
    s.style.transform = `rotate(${Math.random() * 360}deg)`;
    s.style.animationDelay = `${Math.random() * 0.3}s`;
    s.style.animationDuration = `${1.7 + Math.random() * 1.1}s`;
    root.appendChild(s);
    setTimeout(() => s.remove(), 3000);
  }
}

// --- voice (mic) -------------------------------------------------------------

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
  function setStatus(t, text) { if (t.status) $(t.status).textContent = text; else $('live-region').textContent = text; }
  async function toggle(t, btn) {
    if (recorder.isRecording()) return finish(t, btn);
    try { await recorder.start(); btn.setAttribute('aria-pressed', 'true'); setStatus(t, '🎙️ Listening… tap again to stop.'); }
    catch { setStatus(t, 'Microphone unavailable — you can type instead.'); }
  }
  async function finish(t, btn) {
    btn.setAttribute('aria-pressed', 'false'); btn.disabled = true; setStatus(t, 'Transcribing on your device…');
    try {
      const blob = await recorder.stop();
      const text = await handlers.onTranscribe(blob);
      if (text) { appendToField($, t.field, text); setStatus(t, 'Added — edit it however you like.'); }
      else setStatus(t, "Didn't catch that — try again or type.");
    } catch { setStatus(t, 'Transcription failed — you can type instead.'); }
    finally { btn.disabled = false; }
  }
  return { enable };
}

function appendToField($, fieldId, text) {
  const el = $(fieldId);
  if (!el) return;
  el.value = el.value ? `${el.value.trim()} ${text}` : text;
  el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// --- breathing ---------------------------------------------------------------

function createBreathing($, announce) {
  const SEQ = [{ n: 'Breathe in', sc: 1.0 }, { n: 'Hold', sc: 1.0 }, { n: 'Breathe out', sc: 0.62 }];
  let timer = null;
  let on = false;
  let i = 0;
  let count = 0;
  const inner = $('breath-inner');
  const phase = $('breath-phase');
  const reduced = () => document.body.classList.contains('reduced-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick() {
    const ph = SEQ[i % 3];
    phase.textContent = ph.n;
    inner.style.transform = `scale(${reduced() ? 0.85 : ph.sc})`;
    if (i > 0 && i % 3 === 0) { count = Math.min(5, count + 1); $('breath-count').textContent = String(count); $('breath-progress').setAttribute('aria-valuenow', String(count)); }
    i++;
  }
  function start() {
    if (on) return;
    on = true; i = 0; count = 0;
    $('breath-count').textContent = '0'; $('breath-progress').setAttribute('aria-valuenow', '0');
    $('breath-toggle').textContent = 'Stop';
    $('breath-sub').textContent = reduced() ? 'Reduced-motion: follow the words at your own pace.' : 'Follow the circle and the words.';
    tick();
    timer = setInterval(tick, 3800);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (on) { on = false; phase.textContent = 'Ready'; inner.style.transform = 'scale(.72)'; $('breath-toggle').textContent = 'Begin'; $('breath-sub').textContent = 'Find a comfortable seat. Ready when you are.'; }
  }
  $('breath-toggle').addEventListener('click', () => (on ? stop() : start()));
  return { start, stop };
}

// --- focus timer -------------------------------------------------------------

function createFocusTimer($, handlers, announce, getCfg, setFocusMood, getFocusMood) {
  const R = 104, C = 2 * Math.PI * R;
  let lengthMin = 25, remaining = lengthMin * 60, running = false, ticker = null;

  // Build the ring once.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ring = document.createElementNS(SVGNS, 'svg');
  ring.setAttribute('viewBox', '0 0 236 236'); ring.setAttribute('width', '236'); ring.setAttribute('height', '236'); ring.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVGNS, 'circle');
  track.setAttribute('cx', '118'); track.setAttribute('cy', '118'); track.setAttribute('r', String(R)); track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#EFEBDD'); track.setAttribute('stroke-width', '12');
  const prog = document.createElementNS(SVGNS, 'circle');
  prog.setAttribute('cx', '118'); prog.setAttribute('cy', '118'); prog.setAttribute('r', String(R)); prog.setAttribute('fill', 'none'); prog.setAttribute('stroke', '#639922'); prog.setAttribute('stroke-width', '12'); prog.setAttribute('stroke-linecap', 'round');
  prog.setAttribute('stroke-dasharray', String(C)); prog.setAttribute('stroke-dashoffset', String(C)); prog.style.transition = 'stroke-dashoffset 1s linear';
  ring.append(track, prog);
  $('focus-ring-mount').appendChild(ring);

  // Post-focus mood picker (icons only).
  buildMoodPicker($('focus-mood-options'), 'mood__btn', false, (m) => { setFocusMood(m); refreshMoodSelection($('focus-mood-options'), m); });

  function fmt(s) { const m = Math.floor(s / 60); const x = s % 60; return `${m}:${x < 10 ? '0' : ''}${x}`; }
  function render() {
    $('focus-time').textContent = fmt(remaining);
    $('focus-min').textContent = String(lengthMin);
    const total = lengthMin * 60;
    const frac = total ? (total - remaining) / total : 0;
    prog.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
  }
  function setLength(min) {
    const n = Number(min); if (!Number.isFinite(n)) return;
    lengthMin = Math.min(60, Math.max(5, Math.round(n / 5) * 5 || 25));
    if (!running) remaining = lengthMin * 60;
    render();
  }
  function adjust(d) { if (running) return; setLength(lengthMin + d); if (handlers.onFocusLengthChange) handlers.onFocusLengthChange(lengthMin); }
  function showActive(active) { $('focus-active').hidden = !active; $('focus-complete').hidden = active; }
  function tick() {
    remaining -= 1;
    if (remaining <= 0) { remaining = 0; render(); return complete(); }
    render();
  }
  function start() {
    if (running) return;
    if (remaining <= 0) remaining = lengthMin * 60;
    running = true;
    $('focus-stepper-wrap').hidden = true;
    $('focus-toggle').textContent = 'Pause';
    $('focus-skip').hidden = false;
    $('focus-mode').textContent = 'in progress';
    $('focus-status').textContent = 'Stay with one task. You’ve got this.';
    announce(`Focus session started: ${lengthMin} minutes.`);
    ticker = setInterval(tick, 1000);
    render();
  }
  function pause() {
    if (!running) return;
    clearInterval(ticker); ticker = null; running = false;
    $('focus-toggle').textContent = 'Resume';
    $('focus-skip').hidden = true;
    $('focus-status').textContent = `Paused at ${fmt(remaining)}.`;
  }
  function reset() {
    clearInterval(ticker); ticker = null; running = false;
    remaining = lengthMin * 60;
    $('focus-stepper-wrap').hidden = false;
    $('focus-toggle').textContent = 'Start focus';
    $('focus-skip').hidden = true;
    $('focus-mode').textContent = 'pomodoro';
    $('focus-status').textContent = 'Set a length and start when you’re ready.';
    showActive(true);
    render();
  }
  function complete() {
    clearInterval(ticker); ticker = null; running = false;
    const done = lengthMin;
    $('focus-done-min').textContent = String(done);
    mount($('focus-done-mascot'), makeMascot({ ...getCfg(), expr: 'cheer', size: 118 }));
    setFocusMood(0); refreshMoodSelection($('focus-mood-options'), 0);
    showActive(false);
    announce(`Focus session complete. ${done} minutes done — well done!`);
    if (handlers.onFocusComplete) handlers.onFocusComplete(done);
  }

  $('focus-minus').addEventListener('click', () => adjust(-5));
  $('focus-plus').addEventListener('click', () => adjust(5));
  $('focus-toggle').addEventListener('click', () => (running ? pause() : start()));
  $('focus-skip').addEventListener('click', () => complete());
  $('reflect-journal').addEventListener('click', () => { reset(); handlers.onReflectJournal && handlers.onReflectJournal(lengthMin, getFocusMood()); });
  $('reflect-ask').addEventListener('click', () => { reset(); handlers.onReflectAsk && handlers.onReflectAsk(lengthMin); });
  $('reflect-later').addEventListener('click', () => reset());

  render();
  return { setLength, pause, reset };
}

// --- helpers -----------------------------------------------------------------

/** Replace the children of `el` with a single node (or clear + append). */
function mount(el, node, keepLast) {
  if (!el) return;
  el.textContent = '';
  if (node) el.appendChild(node);
}
