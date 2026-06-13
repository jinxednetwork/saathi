import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyze,
  analysisKey,
  memoize,
  createMemoizedAnalyze,
  extractTriggers,
  scoreSentiment,
  computeMoodTrend,
  computeGameState,
  detectPatterns,
  dayIndex
} from '../src/engine.js';

const DAY = 86400000;
// A fixed "today" so day math is deterministic regardless of when tests run.
const TODAY = Date.UTC(2026, 5, 13); // 2026-06-13
const day = (offset) => TODAY + offset * DAY;

test('extractTriggers surfaces and ranks themes by frequency', () => {
  const entries = [
    { text: 'I am so behind on the syllabus, no time left', mood: 2, ts: day(-2) },
    { text: 'Running out of time again, deadline pressure', mood: 2, ts: day(-1) },
    { text: 'Everyone is a topper, my rank is falling behind', mood: 2, ts: day(0) }
  ];
  const triggers = extractTriggers(entries);
  assert.equal(triggers[0].theme, 'Time pressure');
  assert.equal(triggers[0].count, 2);
  assert.ok(triggers.some((t) => t.theme === 'Comparison & rank'));
  assert.ok(triggers[0].examples.length >= 1, 'includes example snippets');
});

test('scoreSentiment polarity', () => {
  assert.equal(scoreSentiment('I feel calm, confident and hopeful').label, 'positive');
  assert.equal(scoreSentiment('I am anxious, stressed and scared').label, 'negative');
  assert.equal(scoreSentiment('Studied chapters today').label, 'neutral');
  assert.ok(scoreSentiment('happy great proud').score > 0);
  assert.ok(scoreSentiment('hate awful terrible').score < 0);
});

test('whole-word matching does not over-trigger on substrings', () => {
  // "failsafe" must not count as the self-doubt term "fail".
  const triggers = extractTriggers([{ text: 'the failsafe worked fine', mood: 4, ts: day(0) }]);
  assert.equal(triggers.find((t) => t.theme === 'Self-doubt'), undefined);
});

test('computeMoodTrend builds a series and detects direction', () => {
  const up = computeMoodTrend([
    { text: 'low', mood: 1, ts: day(-3) },
    { text: 'low', mood: 2, ts: day(-2) },
    { text: 'ok', mood: 4, ts: day(-1) },
    { text: 'good', mood: 5, ts: day(0) }
  ]);
  assert.equal(up.direction, 'up');
  assert.equal(up.points.length, 4);
  assert.deepEqual(up.points.map((p) => p.mood), [1, 2, 4, 5]);

  const down = computeMoodTrend([
    { text: 'good', mood: 5, ts: day(-1) },
    { text: 'bad', mood: 2, ts: day(0) }
  ]);
  assert.equal(down.direction, 'down');
});

test('computeMoodTrend averages multiple entries on the same day', () => {
  const trend = computeMoodTrend([
    { text: 'morning', mood: 2, ts: day(0) },
    { text: 'evening', mood: 4, ts: day(0) + 3600000 }
  ]);
  assert.equal(trend.points.length, 1);
  assert.equal(trend.points[0].mood, 3);
});

test('computeGameState: streak counts consecutive days ending today', () => {
  const entries = [
    { text: 'a', mood: 3, ts: day(-2) },
    { text: 'b', mood: 3, ts: day(-1) },
    { text: 'c', mood: 3, ts: day(0) }
  ];
  const gs = computeGameState(entries, TODAY);
  assert.equal(gs.streak, 3);
});

test('computeGameState: a gap breaks the streak', () => {
  const entries = [
    { text: 'a', mood: 3, ts: day(-5) },
    { text: 'b', mood: 3, ts: day(-1) },
    { text: 'c', mood: 3, ts: day(0) }
  ];
  assert.equal(computeGameState(entries, TODAY).streak, 2);
});

test('computeGameState: yesterday-only still counts as an active streak (grace)', () => {
  const gs = computeGameState([{ text: 'a', mood: 3, ts: day(-1) }], TODAY);
  assert.equal(gs.streak, 1);
});

test('computeGameState: XP and level grow with entries', () => {
  const few = computeGameState([{ text: 'short', mood: 3, ts: day(0) }], TODAY);
  const many = computeGameState(
    Array.from({ length: 12 }, (_, i) => ({
      text: 'a longer reflection about my studying today',
      mood: 3,
      ts: day(-i)
    })),
    TODAY
  );
  assert.ok(many.xp > few.xp);
  assert.ok(many.level >= few.level);
  assert.ok(many.levelProgress >= 0 && many.levelProgress <= 1);
});

test('detectPatterns stays quiet with too little data', () => {
  assert.deepEqual(detectPatterns([{ text: 'fail fail', mood: 1, ts: day(0) }], [], { direction: 'flat' }), []);
});

test('analyze returns the full insights contract', () => {
  const entries = [
    { text: 'so tired, cant sleep, exhausted before the exam', mood: 2, ts: day(-1) },
    { text: 'parents expectations are crushing, scared to disappoint', mood: 2, ts: day(0) }
  ];
  const insights = analyze(entries, { exam: 'NEET', examDate: '2026-07-01', today: TODAY });
  assert.ok(Array.isArray(insights.triggers));
  assert.ok(insights.moodTrend.points.length >= 1);
  assert.equal(typeof insights.streak, 'number');
  assert.equal(typeof insights.level, 'number');
  assert.equal(insights.crisis.flagged, false);
  assert.equal(insights.exam, 'NEET');
  assert.equal(insights.examCountdown, 18); // 2026-06-13 -> 2026-07-01
});

test('analyze tolerates empty / malformed input', () => {
  const insights = analyze([], { today: TODAY });
  assert.equal(insights.entryCount, 0);
  assert.equal(insights.streak, 0);
  assert.equal(insights.examCountdown, null);
});

test('memoize recomputes only when the key changes', () => {
  let calls = 0;
  const fn = memoize(
    (entries, opts) => {
      calls += 1;
      return analyze(entries, opts);
    },
    analysisKey
  );
  const entries = [{ text: 'hi', mood: 3, ts: day(0) }];
  const a = fn(entries, { today: TODAY });
  const b = fn(entries, { today: TODAY });
  assert.equal(a, b, 'same object returned from cache');
  assert.equal(calls, 1, 'not recomputed for identical input');

  const entries2 = [...entries, { text: 'new', mood: 4, ts: day(1) }];
  fn(entries2, { today: TODAY });
  assert.equal(calls, 2, 'recomputed when entries change');
});

test('createMemoizedAnalyze produces a working memoized analyzer', () => {
  const a = createMemoizedAnalyze();
  const entries = [{ text: 'hi', mood: 3, ts: day(0) }];
  assert.equal(a(entries, { today: TODAY }), a(entries, { today: TODAY }));
});

test('dayIndex is timezone-free and stable', () => {
  assert.equal(dayIndex(TODAY), dayIndex(TODAY + 3600000));
  assert.equal(dayIndex(TODAY + DAY), dayIndex(TODAY) + 1);
});
