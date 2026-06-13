/**
 * audio.js — synthesized sound effects via the Web Audio API. Browser only.
 *
 * No audio files: every sound is generated, so the repo stays tiny and the CSP
 * needs no media sources. Sound is never the sole signal for anything (the UI
 * always also shows text/visuals), and it is fully muteable. The AudioContext
 * is created lazily on first use so we don't trip browser autoplay policies.
 */

export function createAudio({ muted = false } = {}) {
  let ctx = null;
  let isMuted = muted;

  function ensureCtx() {
    if (isMuted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** Play one short tone. */
  function tone(freq, startGain, durationMs, type = 'sine', delayMs = 0) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delayMs / 1000;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(startGain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000);
  }

  return {
    /** Gentle confirmation after saving a journal entry. */
    chime() {
      tone(660, 0.18, 220, 'sine');
      tone(880, 0.14, 260, 'sine', 70);
    },
    /** Bright triad for levelling up. */
    levelUp() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 260, 'triangle', i * 90));
    },
    /** Warm two-note flourish for extending a streak. */
    streak() {
      tone(587, 0.16, 200, 'sine');
      tone(784, 0.16, 320, 'sine', 120);
    },
    setMuted(value) {
      isMuted = !!value;
      if (isMuted && ctx) ctx.suspend().catch(() => {});
    },
    get muted() {
      return isMuted;
    }
  };
}
