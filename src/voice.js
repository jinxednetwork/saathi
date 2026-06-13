/**
 * voice.js — optional, privacy-preserving voice journaling.
 *
 * The browser records a short clip with MediaRecorder and POSTs the raw audio
 * blob to a LOCAL Whisper server (transcribe-server.py on localhost:5005). The
 * audio never leaves the device — same privacy promise as the local Ollama.
 *
 * Design for testability: the network + recorder primitives are injected, so
 * the pure pieces (detect, mime selection, transcript extraction, the POST
 * contract) are unit-tested with mocks — no microphone or server needed in CI.
 * If the server isn't running, the UI simply hides the mic and users type.
 */

export const VOICE_BASE = 'http://localhost:5005';

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4'
];

/** Probe the local Whisper server. Never throws — returns false on any failure. */
export async function detectVoice(fetchFn, baseUrl = VOICE_BASE) {
  try {
    const res = await fetchFn(`${baseUrl}/health`, { method: 'GET' });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

/** Pick the best MediaRecorder mime type the browser supports, or '' if none. */
export function pickMimeType(MR) {
  if (!MR || typeof MR.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((t) => MR.isTypeSupported(t)) || '';
}

/** Pull a trimmed transcript string out of the server's JSON, defensively. */
export function extractTranscript(data) {
  if (!data || typeof data.text !== 'string') return '';
  return data.text.trim();
}

/**
 * POST an audio blob to the local Whisper server and return the transcript.
 * @param {Blob} blob recorded audio
 * @param {{fetchFn:typeof fetch, baseUrl?:string, signal?:AbortSignal}} opts
 * @returns {Promise<string>}
 */
export async function transcribeBlob(blob, { fetchFn, baseUrl = VOICE_BASE, signal } = {}) {
  const res = await fetchFn(`${baseUrl}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
    signal
  });
  if (!res || !res.ok) throw new Error(`transcribe HTTP ${res ? res.status : 'no response'}`);
  const data = await res.json();
  return extractTranscript(data);
}

/**
 * Create a microphone recorder. Browser-only (uses getUserMedia +
 * MediaRecorder), so this thin wrapper isn't unit-tested; the pure helpers
 * above are. Dependencies are injectable for flexibility.
 *
 * @returns {{start:()=>Promise<void>, stop:()=>Promise<Blob>, cancel:()=>void, isRecording:()=>boolean}}
 */
export function createRecorder({
  mediaDevices = (typeof navigator !== 'undefined' ? navigator.mediaDevices : null),
  MediaRecorderImpl = (typeof window !== 'undefined' ? window.MediaRecorder : null)
} = {}) {
  let recorder = null;
  let stream = null;
  let chunks = [];

  async function start() {
    if (!mediaDevices || !MediaRecorderImpl) throw new Error('Recording is not supported in this browser.');
    stream = await mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType(MediaRecorderImpl);
    recorder = mimeType ? new MediaRecorderImpl(stream, { mimeType }) : new MediaRecorderImpl(stream);
    chunks = [];
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });
    recorder.start();
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!recorder) return reject(new Error('Not recording.'));
      recorder.addEventListener('stop', () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        releaseStream();
        resolve(blob);
      }, { once: true });
      recorder.stop();
    });
  }

  function cancel() {
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* ignore */ }
    }
    releaseStream();
    chunks = [];
  }

  function releaseStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  return {
    start,
    stop,
    cancel,
    isRecording: () => !!recorder && recorder.state === 'recording'
  };
}
