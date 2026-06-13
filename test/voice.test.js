/**
 * voice.test.js — the pure, network-facing parts of voice journaling.
 * No microphone and no Whisper server are needed: fetch is mocked, so this
 * runs anywhere (including CI).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVoice,
  pickMimeType,
  extractTranscript,
  transcribeBlob,
  VOICE_BASE
} from '../src/voice.js';

test('detectVoice is true only when the server responds ok', async () => {
  assert.equal(await detectVoice(async () => ({ ok: true })), true);
  assert.equal(await detectVoice(async () => ({ ok: false })), false);
  assert.equal(await detectVoice(async () => { throw new Error('refused'); }), false);
});

test('detectVoice probes the /health endpoint of the given base', async () => {
  let seen = null;
  await detectVoice(async (url) => { seen = url; return { ok: true }; }, 'http://localhost:9999');
  assert.equal(seen, 'http://localhost:9999/health');
});

test('pickMimeType returns the first supported candidate, or empty string', () => {
  const supportsWebm = { isTypeSupported: (t) => t.startsWith('audio/webm') };
  assert.equal(pickMimeType(supportsWebm), 'audio/webm;codecs=opus');

  const supportsNone = { isTypeSupported: () => false };
  assert.equal(pickMimeType(supportsNone), '');

  assert.equal(pickMimeType(null), ''); // unsupported environment
  assert.equal(pickMimeType({}), '');
});

test('extractTranscript trims and defends against bad shapes', () => {
  assert.equal(extractTranscript({ text: '  hello there  ' }), 'hello there');
  assert.equal(extractTranscript({}), '');
  assert.equal(extractTranscript(null), '');
  assert.equal(extractTranscript({ text: 42 }), '');
});

test('transcribeBlob POSTs the audio to /transcribe and returns the text', async () => {
  const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ text: '  I felt calm today.  ' }) };
  };

  const text = await transcribeBlob(blob, { fetchFn });
  assert.equal(text, 'I felt calm today.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${VOICE_BASE}/transcribe`);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.body, blob); // raw blob body, not multipart
});

test('transcribeBlob throws on a non-ok response', async () => {
  const blob = new Blob(['x'], { type: 'audio/webm' });
  await assert.rejects(
    () => transcribeBlob(blob, { fetchFn: async () => ({ ok: false, status: 500 }) }),
    /transcribe HTTP 500/
  );
});
