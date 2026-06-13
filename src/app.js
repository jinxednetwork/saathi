/**
 * app.js — bootstrap & orchestration. Browser only.
 *
 * Wires the pieces together: storage (persistence) -> engine (memoized
 * analysis) -> prompts (grounding + safety) -> provider (Ollama or fallback)
 * -> ui (DOM). Holds the single source of truth (`state`) and decides when to
 * recompute, persist, celebrate, and gate on crisis. No analysis or DOM logic
 * lives here — only coordination.
 */

import * as storage from './storage.js';
import { createMemoizedAnalyze, dayIndex } from './engine.js';
import { buildMessages, safetyGate, crisisReply } from './prompts.js';
import { detectProvider } from './ai-provider.js';
import { detectVoice, transcribeBlob } from './voice.js';
import { createAudio } from './audio.js';
import { HELPLINES } from './lexicons.js';
import { initUI } from './ui.js';

const DAY_MS = 86400000;

const state = storage.load();
const analyze = createMemoizedAnalyze();
const audio = createAudio({ muted: state.settings.muted });

let provider = null; // resolved async; null until detectProvider settles
let prev = { level: 0, streak: 0 };

const ui = initUI({
  onJournalSave,
  onSendMessage,
  onSettingsChange,
  onExport,
  onWipe,
  onViewChange,
  onTranscribe,
  onFocusComplete,
  onFocusLengthChange,
  onReflectJournal,
  onReflectAsk
});

boot();

// --- lifecycle --------------------------------------------------------------

function boot() {
  ui.applySettings(state.settings);
  applyMotionAndSound();
  ui.renderEntries(state.entries);
  ui.renderChatHistory(state.chat);
  ui.renderFocusCount(sessionsToday());
  const insights = recompute();
  prev = { level: insights.level, streak: insights.streak };
  maybeShowCrisis(insights);
  ui.setView('journal');

  // Probe the local Ollama; fall back gracefully. Uses the real fetch here.
  detectProvider(window.fetch.bind(window))
    .then((p) => {
      provider = p;
      ui.setOffline(p.name !== 'ollama');
    })
    .catch(() => {
      ui.setOffline(true);
    });

  // Probe the optional local Whisper server; reveal the mic only if present.
  detectVoice(window.fetch.bind(window))
    .then((available) => { if (available) ui.enableVoice(); })
    .catch(() => { /* no voice — typing still works */ });
}

/** Analyse current entries (memoized) and push derived state into the UI. */
function recompute() {
  const insights = analyze(state.entries, analyzeOpts());
  ui.renderProgress(insights);
  ui.renderDashboard(insights);
  ui.setMascotFromInsights(insights);
  return insights;
}

function analyzeOpts() {
  // Stable "today" (start of day) keeps memoization effective within a session.
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return { exam: state.settings.exam, examDate: state.settings.examDate, today };
}

// --- handlers ---------------------------------------------------------------

function onJournalSave({ text, mood }) {
  state.entries.push({ text, mood, ts: Date.now() });
  storage.save(state);
  ui.renderEntries(state.entries);

  const insights = recompute();
  ui.announce('Entry saved.');

  if (insights.crisis.flagged) {
    maybeShowCrisis(insights);
    audio.chime();
  } else {
    handleProgressChange(insights);
  }
  prev = { level: insights.level, streak: insights.streak };
}

async function onSendMessage(text) {
  const insights = analyze(state.entries, analyzeOpts());

  // SAFETY: deterministic gate runs BEFORE any model call.
  const gate = safetyGate(text, insights);
  pushChat({ role: 'user', content: text });
  ui.addChatMessage({ role: 'user', content: text });

  if (gate.gated) {
    maybeShowCrisis(insights, text);
    ui.addChatMessage({ role: 'assistant', content: gate.reply });
    pushChat({ role: 'assistant', content: gate.reply });
    return;
  }

  if (!provider) {
    const msg = 'Just a moment — getting ready…';
    ui.addChatMessage({ role: 'assistant', content: msg });
    return;
  }

  const node = ui.addChatMessage({ role: 'assistant', content: '' });
  ui.setChatBusy(true);
  const messages = buildMessages(text, insights, recentTurns());
  let full = '';
  try {
    full = await provider.chat(messages, {
      insights,
      onToken: (tok) => {
        full += tok;
        node.textContent = full;
        node.parentElement.parentElement.scrollTop = node.parentElement.parentElement.scrollHeight;
      }
    });
  } catch {
    full = "I'm having trouble reaching the AI right now, but I'm still here. Try a slow breath, and tell me more whenever you're ready.";
    node.textContent = full;
  } finally {
    ui.setChatBusy(false);
  }
  pushChat({ role: 'assistant', content: full });
}

function onSettingsChange(next) {
  Object.assign(state.settings, next);
  storage.save(state);
  applyMotionAndSound();
  recompute(); // exam/date can change the countdown + grounding
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
  state.entries = [];
  state.chat = [];
  state.settings = storage.defaultState().settings;
  storage.save(state);
  ui.applySettings(state.settings);
  applyMotionAndSound();
  ui.renderEntries(state.entries);
  ui.renderChatHistory(state.chat);
  ui.hideCrisis();
  prev = { level: 0, streak: 0 };
  recompute();
  ui.announce('All your data has been wiped from this device.');
}

function onViewChange(view) {
  if (view !== 'mindfulness') ui.stopBreathing();
  if (view !== 'focus') ui.pauseFocus();
}

/** Transcribe a recorded clip via the LOCAL Whisper server. Audio stays on-device. */
async function onTranscribe(blob) {
  return transcribeBlob(blob, { fetchFn: window.fetch.bind(window) });
}

/** A focus session finished: record it, celebrate, and nudge a reflection. */
function onFocusComplete(minutes) {
  state.sessions.push({ minutes, ts: Date.now() });
  storage.save(state);
  ui.renderFocusCount(sessionsToday());
  audio.levelUp();
  ui.celebrate();
}

function onFocusLengthChange(minutes) {
  state.settings.focusMinutes = minutes;
  storage.save(state);
}

/** Reflect → Journal: jump to the journal with the session pre-framed. */
function onReflectJournal(minutes) {
  ui.focusField('journal-text');
  ui.announce(`You just focused for ${minutes} minutes. Jot down how it went.`);
}

/** Reflect → Companion: jump to the live chat to ask a doubt. */
function onReflectAsk() {
  ui.focusField('chat-input');
}

// --- helpers ----------------------------------------------------------------

function handleProgressChange(insights) {
  if (insights.level > prev.level) {
    audio.levelUp();
    ui.celebrate();
    ui.announce(`Level up! You reached level ${insights.level}.`);
  } else if (insights.streak > prev.streak) {
    audio.streak();
    ui.announce(`${insights.streak}-day streak! Keep it going.`);
  } else {
    audio.chime();
  }
}

function maybeShowCrisis(insights, extraText) {
  if (insights.crisis.flagged || (extraText && safetyGate(extraText, insights).gated)) {
    ui.showCrisis(crisisReply(), HELPLINES);
  }
}

function applyMotionAndSound() {
  audio.setMuted(state.settings.muted);
  ui.setReducedMotion(state.settings.reducedMotion);
}

function pushChat(msg) {
  state.chat.push({ ...msg, ts: Date.now() });
  // Keep chat history bounded so storage stays small.
  if (state.chat.length > 100) state.chat = state.chat.slice(-100);
  storage.save(state);
}

/** Last few turns for conversational context (system message added by prompts). */
function recentTurns() {
  return state.chat.slice(-8).map(({ role, content }) => ({ role, content }));
}

/** Count of focus sessions completed today (for the gamified counter). */
function sessionsToday() {
  const today = dayIndex(Date.now());
  return state.sessions.filter((s) => dayIndex(s.ts) === today).length;
}
