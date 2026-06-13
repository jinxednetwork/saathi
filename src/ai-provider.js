/**
 * ai-provider.js — provider abstraction with graceful fallback.
 *
 * `detectProvider(fetch)` probes a local Ollama at boot:
 *   - reachable AND the model is installed  -> OllamaProvider (real GenAI)
 *   - anything else                          -> LocalProvider (grounded templates)
 *
 * `fetch` is injected so the whole module is unit-testable WITHOUT a live
 * Ollama (CI never needs one). The privacy promise: requests only ever go to
 * localhost; the journal never leaves the device.
 */

import { scoreSentiment } from './engine.js';

export const DEFAULT_BASE = 'http://localhost:11434';
export const DEFAULT_MODEL = 'gemma3:1b';

/**
 * Probe Ollama and pick a provider. Never throws — any failure falls back.
 * @param {typeof fetch} fetchFn injected fetch
 * @param {{model?:string,baseUrl?:string}} [opts]
 * @returns {Promise<OllamaProvider|LocalProvider>}
 */
export async function detectProvider(fetchFn, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const baseUrl = opts.baseUrl || DEFAULT_BASE;
  try {
    const res = await fetchFn(`${baseUrl}/api/tags`, { method: 'GET' });
    if (res && res.ok) {
      const data = await res.json();
      const names = (data.models || []).map((m) => m.name || m.model || '');
      const base = model.split(':')[0];
      const installed = names.some((n) => n === model || n.startsWith(`${base}:`) || n === base);
      if (installed) return new OllamaProvider(fetchFn, { model, baseUrl });
    }
  } catch {
    /* unreachable / CORS / parse error -> fall back */
  }
  return new LocalProvider();
}

/** Talks to a real local Ollama, streaming NDJSON tokens. */
export class OllamaProvider {
  constructor(fetchFn, { model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE } = {}) {
    this.name = 'ollama';
    this.model = model;
    this.baseUrl = baseUrl;
    this._fetch = fetchFn;
  }

  /**
   * @param {{role:string,content:string}[]} messages
   * @param {{onToken?:(t:string)=>void,signal?:AbortSignal}} [opts]
   * @returns {Promise<string>} the full assistant reply
   */
  async chat(messages, { onToken, signal } = {}) {
    const res = await this._fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal
    });
    if (!res || !res.ok) throw new Error(`Ollama HTTP ${res ? res.status : 'no response'}`);
    let full = '';
    await readNdjson(res.body, (line) => {
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        return; // tolerate the occasional partial/garbage line
      }
      const piece = obj && obj.message && obj.message.content;
      if (piece) {
        full += piece;
        if (onToken) onToken(piece);
      }
    });
    return full;
  }
}

/** Offline, deterministic, insight-grounded companion. Always available. */
export class LocalProvider {
  constructor() {
    this.name = 'local';
    this.model = 'local';
  }

  async chat(messages, { onToken, insights } = {}) {
    const reply = localReply(lastUserContent(messages), insights);
    if (onToken) for (const tok of reply.split(/(\s+)/)) onToken(tok);
    return reply;
  }
}

/** Read a streaming body line-by-line as NDJSON, buffering partial lines. */
export async function readNdjson(body, onLine) {
  if (!body || typeof body.getReader !== 'function') return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) onLine(line);
    }
  }
  const tail = (buf + decoder.decode()).trim();
  if (tail) onLine(tail);
}

/** Last user message content from a messages array. */
export function lastUserContent(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content || '';
  }
  return '';
}

const COPING_TIPS = [
  'Try a slow 4-7-8 breath: in for 4, hold for 7, out for 8 — it calms the nervous system fast.',
  'Pick the single next tiny task and do just that for 10 minutes. Momentum beats overwhelm.',
  'A short walk or some water can reset a stuck mind better than pushing harder.',
  'Protect your sleep tonight — a rested brain recalls more than a tired one ever can.',
  'Write the worry down, then ask: what is one part of this I can actually control today?'
];

/**
 * Deterministic, empathetic, grounded fallback reply. Pure and testable.
 * @param {string} userText
 * @param {object} [insights]
 */
export function localReply(userText, insights = {}) {
  const parts = ['Thank you for sharing that with me.'];
  const sentiment = scoreSentiment(userText);
  if (sentiment.label === 'negative') {
    parts.push("It sounds like this is weighing on you, and that's completely understandable under exam pressure.");
  } else if (sentiment.label === 'positive') {
    parts.push("I'm glad to hear some lightness in your words today.");
  } else {
    parts.push("I'm here and listening.");
  }

  const top = Array.isArray(insights.triggers) && insights.triggers[0];
  if (top) parts.push(`I notice “${top.theme}” keeps coming up for you lately.`);

  parts.push(COPING_TIPS[(userText || '').length % COPING_TIPS.length]);

  if (insights.streak) {
    parts.push(
      `And you have journalled ${insights.streak} day${insights.streak === 1 ? '' : 's'} in a row — that consistency really matters.`
    );
  }
  return parts.join(' ');
}
