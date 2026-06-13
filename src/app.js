/**
 * app.js — bootstrap & orchestration. Browser only.
 *
 * Marries the Saathi design (rendered by ui.js) to the real engine + providers:
 * storage → engine (memoized analysis) → prompts (grounding + safety) →
 * provider (local Ollama, with graceful fallback) → ui. Holds the single source
 * of truth (`state`), decides when to recompute, persist, celebrate, and gate on
 * crisis. Voice goes through the local Whisper server. No analysis/DOM logic
 * lives here — only coordination.
 */

import * as storage from './storage.js';
import { createMemoizedAnalyze, dayIndex } from './engine.js';
import { buildMessages, safetyGate, crisisReply } from './prompts.js';
import { detectProvider, LocalProvider } from './ai-provider.js';
import { detectVoice, transcribeBlob } from './voice.js';
import { createAudio } from './audio.js';
import { HELPLINES } from './lexicons.js';
import { initUI } from './ui.js';

const DAY_MS = 86400000;

const state = storage.load();
const analyze = createMemoizedAnalyze();
const audio = createAudio({ muted: state.settings.muted });
const localProvider = new LocalProvider();

let provider = localProvider; // resolved async; stays local until Ollama is found
let forcedOffline = false;
let prev = { level: 0, streak: 0 };
let lastInsights = null;
let journalCtx = {}; // { fromFocus, focusMin }

const ui = initUI({
  onFinishOnboard,
  onMascotChange,
  onJournalSave,
  onMoodPicked,
  onSendMessage,
  onSettingsChange,
  onExport,
  onWipe,
  onViewChange,
  onTranscribe,
  onFocusComplete,
  onFocusLengthChange,
  onReflectJournal,
  onReflectAsk,
  onToggleOffline,
  onRebuild
});

boot();

// --- lifecycle --------------------------------------------------------------

function boot() {
  ui.renderMascot(state.mascot);
  ui.applySettings(state.settings);
  ui.setReducedMotion(state.settings.reducedMotion);
  ui.renderChatHistory(state.chat);
  renderSuggested();

  const insights = recompute();
  prev = { level: insights.level, streak: insights.streak };

  ui.setOnboarded(state.onboarded); // shows onboarding + hides tab views when false
  if (insights.crisis.flagged) ui.showCrisis(HELPLINES);

  // Probe local Ollama; fall back to the (already-active) local provider.
  detectProvider(window.fetch.bind(window))
    .then((p) => { provider = p; syncOffline(); })
    .catch(() => { provider = localProvider; syncOffline(); });

  // Probe optional local Whisper; reveal mic only if present.
  detectVoice(window.fetch.bind(window))
    .then((ok) => { if (ok) ui.enableVoice(); })
    .catch(() => {});
}

function analyzeOpts() {
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return { exam: state.settings.exam, examDate: state.settings.examDate, sessions: state.sessions, today };
}

/** Recompute insights (memoized) and push derived state into the UI. */
function recompute() {
  const insights = analyze(state.entries, analyzeOpts());
  lastInsights = insights;
  ui.renderProgress(insights);
  ui.renderJournal(insights, journalCtx);
  ui.renderDashboard(insights);
  ui.refreshMascots(insights);
  return insights;
}

// --- onboarding -------------------------------------------------------------

function onMascotChange(cfg) {
  state.mascot = { ...state.mascot, ...cfg };
  storage.save(state);
}

function onFinishOnboard(cfg) {
  state.mascot = { ...state.mascot, ...cfg };
  state.onboarded = true;
  storage.save(state);
  ui.renderMascot(state.mascot);
  ui.setOnboarded(true);
  ui.refreshMascots(lastInsights);
  ui.setView('journal');
  audio.chime();
}

function onRebuild() {
  state.onboarded = false;
  storage.save(state);
  ui.setOnboarded(false);
  document.getElementById('view-onboarding').hidden = false;
  ui.renderMascot(state.mascot);
}

// --- journal ----------------------------------------------------------------

function onMoodPicked() {
  // Refresh the mood-aware prompt + mascot expression live.
  if (lastInsights) { ui.renderJournal(lastInsights, journalCtx); ui.refreshMascots(lastInsights); }
}

function onJournalSave({ text, mood }) {
  // SAFETY: deterministic crisis check before any reward/gamification.
  if (text && safetyGate(text, lastInsights || {}).gated) {
    ui.showCrisis(HELPLINES);
    return;
  }
  state.entries.push({ text: text || '', mood, ts: Date.now() });
  storage.save(state);

  const insights = recompute();
  ui.announce('Entry saved.');

  // Choose ONE reward moment (mirrors the design's save loop).
  let overlay = 'reward';
  if (insights.streak === 7 && prev.streak !== 7) overlay = 'mile';
  else if (insights.level > prev.level) overlay = 'level';

  if (overlay === 'level') { audio.levelUp(); ui.showOverlay('level', { level: insights.level }); }
  else if (overlay === 'mile') { audio.levelUp(); ui.showOverlay('mile', {}); }
  else { audio.chime(); ui.showOverlay('reward', { streak: insights.streak }); }

  prev = { level: insights.level, streak: insights.streak };

  // Clear the page for next time.
  document.getElementById('journal-text').value = '';
  ui.resetMood();
  journalCtx = {};
}

// --- companion / chat -------------------------------------------------------

function activeProvider() { return forcedOffline ? localProvider : provider; }

function isOffline() { return forcedOffline || activeProvider().name !== 'ollama'; }

function syncOffline() { ui.setOffline(isOffline()); renderSuggested(); }

function onToggleOffline() { forcedOffline = !forcedOffline; syncOffline(); }

function renderSuggested() {
  if (isOffline()) {
    ui.renderSuggested([
      { text: 'Try a grounding step', onClick: () => gotoBreathe() },
      { text: 'Breathe with me', onClick: () => gotoBreathe() }
    ]);
  } else {
    const prompts = ["I'm anxious about NEET", "I can't focus today", 'I keep comparing myself'];
    ui.renderSuggested(prompts.map((t) => ({ text: t, onClick: () => onSendMessage(t) })));
  }
}

function gotoBreathe() { ui.setView('breathe'); onViewChange('breathe'); }

async function onSendMessage(text) {
  const insights = lastInsights || analyze(state.entries, analyzeOpts());
  const gate = safetyGate(text, insights);

  pushChat({ role: 'me', content: text });
  ui.addChatMessage({ role: 'user', content: text });

  if (gate.gated) {
    ui.showCrisis(HELPLINES);
    ui.addChatMessage({ role: 'assistant', content: gate.reply });
    pushChat({ role: 'saathi', content: gate.reply });
    return;
  }

  ui.setTyping(true);
  ui.setChatBusy(true);
  const messages = buildMessages(text, insights, recentTurns());
  let full = '';
  let bubble = null;
  try {
    full = await activeProvider().chat(messages, {
      insights,
      onToken: (tok) => {
        if (!bubble) { ui.setTyping(false); bubble = ui.addChatMessage({ role: 'assistant', content: '' }); }
        full += tok;
        bubble.textContent = full;
        bubble.parentElement.parentElement.scrollTop = bubble.parentElement.parentElement.scrollHeight;
      }
    });
  } catch {
    full = "I'm having trouble reaching the AI right now, but I'm still here. Try a slow breath, and tell me more whenever you're ready.";
  } finally {
    ui.setTyping(false);
    ui.setChatBusy(false);
  }
  if (!bubble) ui.addChatMessage({ role: 'assistant', content: full });
  pushChat({ role: 'saathi', content: full });
}

// --- settings + data --------------------------------------------------------

function onSettingsChange(next) {
  Object.assign(state.settings, next);
  storage.save(state);
  audio.setMuted(state.settings.muted);
  ui.setReducedMotion(state.settings.reducedMotion);
  recompute();
}

function onExport() {
  const json = storage.exportJSON(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `saathi-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  ui.announce('Your data was exported.');
}

function onWipe() {
  storage.wipe();
  const fresh = storage.defaultState();
  fresh.mascot = state.mascot; // keep the companion they built
  fresh.onboarded = state.onboarded;
  Object.assign(state, fresh);
  storage.save(state);
  ui.applySettings(state.settings);
  ui.setReducedMotion(false);
  ui.renderChatHistory(state.chat);
  ui.hideOverlay();
  prev = { level: 0, streak: 0 };
  journalCtx = {};
  recompute();
  ui.announce('All your data has been wiped from this device.');
}

// --- navigation -------------------------------------------------------------

function onViewChange(view) {
  if (view !== 'breathe') ui.stopBreathing();
  if (view !== 'focus') ui.pauseFocus();
}

// --- voice ------------------------------------------------------------------

async function onTranscribe(blob) {
  return transcribeBlob(blob, { fetchFn: window.fetch.bind(window) });
}

// --- focus ------------------------------------------------------------------

function onFocusComplete(minutes) {
  state.sessions.push({ minutes, ts: Date.now() });
  storage.save(state);
  const insights = recompute();
  prev = { level: insights.level, streak: insights.streak };
  audio.levelUp();
}

function onFocusLengthChange(minutes) {
  state.settings.focusMinutes = minutes;
  storage.save(state);
}

function onReflectJournal(minutes, focusMood) {
  journalCtx = { fromFocus: true, focusMin: minutes };
  if (focusMood) ui.setMood(focusMood);
  ui.setView('journal');
  onViewChange('journal');
  ui.renderJournal(lastInsights, journalCtx);
  ui.refreshMascots(lastInsights);
  ui.announce(`You just focused for ${minutes} minutes. Jot down how it went.`);
  document.getElementById('journal-text').focus();
}

function onReflectAsk(minutes) {
  const opener = "How did that session go? If a problem's bugging you, tell me what you got stuck on — we'll untangle it together.";
  ui.addChatMessage({ role: 'assistant', content: opener });
  pushChat({ role: 'saathi', content: opener });
  ui.setView('companion');
  onViewChange('companion');
  document.getElementById('chat-input').focus();
}

// --- helpers ----------------------------------------------------------------

function pushChat(msg) {
  state.chat.push({ ...msg, ts: Date.now() });
  if (state.chat.length > 100) state.chat = state.chat.slice(-100);
  storage.save(state);
}

function recentTurns() {
  return state.chat.slice(-8).map((m) => ({ role: m.role === 'me' ? 'user' : (m.role === 'saathi' ? 'assistant' : m.role), content: m.content }));
}
