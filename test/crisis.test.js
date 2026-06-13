import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectCrisis, analyze } from '../src/engine.js';

const TODAY = Date.UTC(2026, 5, 13);

// --- RECALL: genuine intent must flag --------------------------------------
const SHOULD_FLAG = [
  'I want to die, I cannot do this anymore',
  'sometimes I think about ending my life',
  'I feel like I should just kill myself',
  'there is no reason to live if I fail',
  'I keep thinking about self-harm',
  'everyone would be better without me',
  "I can't go on like this",
  'I have been hurting myself when I am alone'
];

for (const text of SHOULD_FLAG) {
  test(`crisis RECALL flags: "${text.slice(0, 40)}..."`, () => {
    const res = detectCrisis(text);
    assert.equal(res.flagged, true);
    assert.ok(res.matches.length >= 1);
  });
}

// --- PRECISION: hyperbole / benign exam talk must NOT flag ------------------
const SHOULD_NOT_FLAG = [
  'this exam is killing my schedule',
  "I'm dying to finish this syllabus",
  'the deadline is murder but I will manage',
  'I could kill for a good night of sleep',
  'this chapter is the death of me',
  'I am dead tired after the mock test',
  'failed the mock test but I will bounce back',
  'I am so stressed and anxious about JEE'
];

for (const text of SHOULD_NOT_FLAG) {
  test(`crisis PRECISION ignores: "${text.slice(0, 40)}..."`, () => {
    assert.equal(detectCrisis(text).flagged, false);
  });
}

test('detectCrisis is case-insensitive', () => {
  assert.equal(detectCrisis('I WANT TO DIE').flagged, true);
});

test('analyze surfaces aggregated crisis flag across history', () => {
  const entries = [
    { text: 'studied physics today, felt ok', mood: 3, ts: TODAY - 86400000 },
    { text: 'I just want to die, nothing matters', mood: 1, ts: TODAY }
  ];
  const insights = analyze(entries, { today: TODAY });
  assert.equal(insights.crisis.flagged, true);
  assert.ok(insights.crisis.matches.includes('want to die'));
});

test('analyze reports no crisis for ordinary stressed entries', () => {
  const entries = [
    { text: 'so anxious about my rank, parents are disappointed', mood: 2, ts: TODAY }
  ];
  assert.equal(analyze(entries, { today: TODAY }).crisis.flagged, false);
});
