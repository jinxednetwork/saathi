/**
 * storage.js — thin, guarded localStorage persistence. Browser only.
 *
 * Privacy-by-design: everything Saathi knows lives in the browser on this
 * device. Nothing is sent anywhere except the local Ollama (if running).
 * Every access is wrapped so a disabled/blocked/quota-full storage degrades
 * gracefully instead of throwing.
 */

const KEY = 'saathi.v1';

/** The empty, valid app state. */
export function defaultState() {
  return {
    version: 1,
    entries: [], // { text, mood:1..5, ts }
    chat: [], // { role, content, ts }
    sessions: [], // completed focus sessions: { minutes, ts }
    settings: {
      exam: '',
      examDate: '',
      muted: false,
      reducedMotion: false, // user override; OS preference is also honoured
      focusMinutes: 25 // default Pomodoro length
    }
  };
}

/** Load persisted state, merged over defaults. Never throws. */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      chat: Array.isArray(parsed.chat) ? parsed.chat : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      settings: { ...base.settings, ...(parsed.settings || {}) }
    };
  } catch {
    return defaultState();
  }
}

/** Persist state. Returns true on success, false if storage rejected it. */
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // quota exceeded / storage disabled
  }
}

/** Pretty-printed JSON for the user's export download. */
export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

/** Erase everything Saathi has stored on this device. */
export function wipe() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
