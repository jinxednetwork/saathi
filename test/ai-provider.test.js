import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectProvider,
  OllamaProvider,
  LocalProvider,
  readNdjson,
  localReply,
  lastUserContent
} from '../src/ai-provider.js';

// --- test doubles -----------------------------------------------------------

/** A fetch that resolves /api/tags with the given model list. */
function tagsFetch(modelNames) {
  return async (url) => {
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: modelNames.map((n) => ({ name: n })) }) };
    }
    throw new Error('unexpected url ' + url);
  };
}

/** A body that streams the given string chunks as a ReadableStream-like reader. */
function streamBody(chunks) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: enc.encode(chunks[i++]) };
        }
      };
    }
  };
}

// --- detectProvider ---------------------------------------------------------

test('detectProvider picks Ollama when the model is installed', async () => {
  const p = await detectProvider(tagsFetch(['gemma3:1b', 'llama3:8b']));
  assert.equal(p.name, 'ollama');
  assert.ok(p instanceof OllamaProvider);
});

test('detectProvider falls back to local when the model is absent', async () => {
  const p = await detectProvider(tagsFetch(['mistral:7b']));
  assert.equal(p.name, 'local');
  assert.ok(p instanceof LocalProvider);
});

test('detectProvider falls back to local when Ollama is unreachable', async () => {
  const p = await detectProvider(async () => {
    throw new Error('ECONNREFUSED');
  });
  assert.equal(p.name, 'local');
});

test('detectProvider falls back when the probe returns non-ok', async () => {
  const p = await detectProvider(async () => ({ ok: false, status: 500 }));
  assert.equal(p.name, 'local');
});

// --- OllamaProvider streaming ----------------------------------------------

test('OllamaProvider assembles a streamed NDJSON reply and emits tokens', async () => {
  const ndjson =
    JSON.stringify({ message: { content: 'Take ' }, done: false }) + '\n' +
    JSON.stringify({ message: { content: 'a deep ' }, done: false }) + '\n' +
    JSON.stringify({ message: { content: 'breath.' }, done: true }) + '\n';
  // Split mid-line to prove buffering works.
  const mid = Math.floor(ndjson.length / 2);
  const fetchFn = async () => ({ ok: true, status: 200, body: streamBody([ndjson.slice(0, mid), ndjson.slice(mid)]) });

  const provider = new OllamaProvider(fetchFn, { model: 'gemma3:1b' });
  const tokens = [];
  const full = await provider.chat([{ role: 'user', content: 'hi' }], { onToken: (t) => tokens.push(t) });
  assert.equal(full, 'Take a deep breath.');
  assert.deepEqual(tokens, ['Take ', 'a deep ', 'breath.']);
});

test('OllamaProvider throws on a non-ok response', async () => {
  const provider = new OllamaProvider(async () => ({ ok: false, status: 503 }), {});
  await assert.rejects(() => provider.chat([{ role: 'user', content: 'hi' }]));
});

test('readNdjson tolerates a missing body', async () => {
  let called = false;
  await readNdjson(undefined, () => { called = true; });
  assert.equal(called, false);
});

// --- LocalProvider ----------------------------------------------------------

test('LocalProvider returns a grounded reply mentioning the top trigger', async () => {
  const provider = new LocalProvider();
  const insights = { triggers: [{ theme: 'Sleep', count: 3 }], streak: 4 };
  const reply = await provider.chat([{ role: 'user', content: 'I am so tired and anxious' }], { insights });
  assert.ok(reply.includes('Sleep'));
  assert.ok(reply.includes('4 days'));
});

test('localReply adapts to sentiment', () => {
  assert.notEqual(
    localReply('I feel hopeful and calm today', {}),
    localReply('I am scared and stressed', {})
  );
});

test('lastUserContent finds the most recent user message', () => {
  assert.equal(
    lastUserContent([
      { role: 'system', content: 's' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'a' },
      { role: 'user', content: 'second' }
    ]),
    'second'
  );
});
