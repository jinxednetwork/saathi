/**
 * engine.js — PURE analysis backbone. No DOM, no I/O, no globals.
 *
 * `analyze(entries, opts) -> insights` is the tested heart of Saathi. It turns
 * raw journal entries + mood logs into the structured `insights` object that
 * grounds the LLM prompt, drives the dashboard, powers gamification, and gates
 * the crisis-safety path. Everything is deterministic and unit-tested.
 *
 * Efficiency note (Round-2 focus): `analyze` is pure. The app calls it through
 * `memoize(analyze, analysisKey)` so it recomputes only when entries (or opts)
 * change — never on every render. Complexity is O(n·k): n = entries,
 * k = lexicon size. See README "State complexity".
 */

import {
  TRIGGER_LEXICON,
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  CRISIS_PHRASES
} from './lexicons.js';

const DAY_MS = 86400000;

/** Lowercase + collapse whitespace. The single normalization used everywhere. */
export function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** UTC day index — deterministic, timezone-free integer for streak/day math. */
export function dayIndex(ts) {
  return Math.floor(Number(ts) / DAY_MS);
}

/** YYYY-MM-DD label for a timestamp (UTC), used by the mood-trend series. */
export function dateKey(ts) {
  return new Date(Number(ts)).toISOString().slice(0, 10);
}

/**
 * Whole-word match for single terms, substring match for multi-word phrases.
 * Multi-word lexicon entries ("not enough time") are intentionally matched as
 * substrings; single words use \b boundaries so "fail" doesn't hit "failsafe".
 */
function containsTerm(normText, term) {
  if (term.includes(' ')) return normText.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(normText);
}

/**
 * Aggregate trigger themes across all entries.
 * @returns {{theme:string,count:number,examples:string[]}[]} sorted desc by count
 */
export function extractTriggers(entries) {
  const tally = new Map(); // theme -> { count, examples:Set }
  for (const entry of entries) {
    const norm = normalize(entry.text);
    if (!norm) continue;
    for (const [theme, terms] of Object.entries(TRIGGER_LEXICON)) {
      const hit = terms.some((t) => containsTerm(norm, t));
      if (!hit) continue;
      if (!tally.has(theme)) tally.set(theme, { count: 0, examples: [] });
      const rec = tally.get(theme);
      rec.count += 1;
      if (rec.examples.length < 3) rec.examples.push(snippet(entry.text));
    }
  }
  return [...tally.entries()]
    .map(([theme, rec]) => ({ theme, count: rec.count, examples: rec.examples }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

/** First ~80 chars of an entry, for showing the user where a trigger came from. */
function snippet(text) {
  const t = String(text || '').trim();
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

/**
 * Sentiment of a single text, from -1 (negative) to +1 (positive).
 * @returns {{score:number,label:'negative'|'neutral'|'positive'}}
 */
export function scoreSentiment(text) {
  const norm = normalize(text);
  if (!norm) return { score: 0, label: 'neutral' };
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) if (containsTerm(norm, w)) pos += 1;
  for (const w of NEGATIVE_WORDS) if (containsTerm(norm, w)) neg += 1;
  const total = pos + neg;
  const score = total === 0 ? 0 : (pos - neg) / total;
  return { score, label: labelFor(score) };
}

function labelFor(score) {
  if (score > 0.15) return 'positive';
  if (score < -0.15) return 'negative';
  return 'neutral';
}

/** Overall sentiment = mean of per-entry sentiment scores. */
function aggregateSentiment(entries) {
  if (entries.length === 0) return { score: 0, label: 'neutral' };
  const mean =
    entries.reduce((sum, e) => sum + scoreSentiment(e.text).score, 0) /
    entries.length;
  return { score: round2(mean), label: labelFor(mean) };
}

/**
 * Mood-trend time series + direction.
 * Entries on the same day are averaged. Direction compares the mean of the
 * later half of points against the earlier half.
 * @returns {{points:{date:string,mood:number}[],direction:'up'|'down'|'flat'}}
 */
export function computeMoodTrend(entries) {
  const byDay = new Map(); // dateKey -> { sum, n }
  for (const e of entries) {
    const key = dateKey(e.ts);
    const rec = byDay.get(key) || { sum: 0, n: 0 };
    rec.sum += Number(e.mood);
    rec.n += 1;
    byDay.set(key, rec);
  }
  const points = [...byDay.entries()]
    .map(([date, rec]) => ({ date, mood: round2(rec.sum / rec.n) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let direction = 'flat';
  if (points.length >= 2) {
    const mid = Math.floor(points.length / 2);
    const earlier = mean(points.slice(0, mid).map((p) => p.mood));
    const later = mean(points.slice(mid).map((p) => p.mood));
    const delta = later - earlier;
    if (delta > 0.3) direction = 'up';
    else if (delta < -0.3) direction = 'down';
  }
  return { points, direction };
}

/**
 * Human-readable patterns surfaced to the user. Conservative: only emits when
 * there is enough data (>= 3 entries) so we don't over-claim from noise.
 * @returns {string[]}
 */
export function detectPatterns(entries, triggers, moodTrend) {
  const out = [];
  if (entries.length < 3) return out;

  // 1) Dominant trigger.
  if (triggers.length > 0 && triggers[0].count >= 2) {
    out.push(`“${triggers[0].theme}” comes up most often in your entries.`);
  }

  // 2) Trigger ↔ mood correlation for the top theme.
  if (triggers.length > 0) {
    const theme = triggers[0].theme;
    const withTheme = [];
    const without = [];
    for (const e of entries) {
      const norm = normalize(e.text);
      const terms = TRIGGER_LEXICON[theme] || [];
      (terms.some((t) => containsTerm(norm, t)) ? withTheme : without).push(
        Number(e.mood)
      );
    }
    if (withTheme.length >= 2 && without.length >= 1) {
      const diff = mean(withTheme) - mean(without);
      if (diff <= -0.5) {
        out.push(`Your mood tends to be lower when “${theme}” is on your mind.`);
      }
    }
  }

  // 3) Day-of-week dip.
  const dow = dayOfWeekMoods(entries);
  const dip = lowestDayWithSupport(dow);
  if (dip) out.push(`Your mood tends to dip on ${dip}s — plan something kind then.`);

  // 4) Overall trajectory.
  if (moodTrend.direction === 'up') {
    out.push('Your mood has been trending upward recently — keep it going. 🌱');
  } else if (moodTrend.direction === 'down') {
    out.push('Your mood has dipped lately. Be gentle with yourself this week.');
  }

  return out;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfWeekMoods(entries) {
  const buckets = WEEKDAYS.map(() => []);
  for (const e of entries) buckets[new Date(Number(e.ts)).getUTCDay()].push(Number(e.mood));
  return buckets;
}

function lowestDayWithSupport(buckets) {
  let lowest = null;
  let lowestMean = Infinity;
  const overall = mean(buckets.flat());
  buckets.forEach((moods, day) => {
    if (moods.length < 2) return; // need support to claim a pattern
    const m = mean(moods);
    if (m < lowestMean) {
      lowestMean = m;
      lowest = day;
    }
  });
  // Only report if that day is meaningfully below the overall average.
  return lowest !== null && lowestMean <= overall - 0.5 ? WEEKDAYS[lowest] : null;
}

/**
 * Streak / XP / level from the entry history.
 * - streak: consecutive calendar days ending today (or yesterday, as grace).
 * - xp: 10 per entry + 5 for substantial reflections + 5 per streak day.
 * - level: rising-cost curve; levelProgress is fraction toward the next level.
 * @returns {{streak:number,xp:number,level:number,levelProgress:number,xpIntoLevel:number,xpForNext:number}}
 */
export function computeGameState(entries, todayTs) {
  const days = new Set(entries.map((e) => dayIndex(e.ts)));
  const todayIdx = dayIndex(todayTs);

  let streak = 0;
  let cursor = days.has(todayIdx) ? todayIdx : days.has(todayIdx - 1) ? todayIdx - 1 : null;
  while (cursor !== null && days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }

  let xp = 0;
  for (const e of entries) {
    xp += 10;
    if (String(e.text || '').trim().length >= 20) xp += 5;
  }
  xp += streak * 5;

  return { ...computeLevel(xp), streak, xp };
}

/** Rising-cost level curve. Level 1 starts at 0 XP; each level costs ~40% more. */
function computeLevel(xp) {
  let level = 1;
  let acc = 0;
  let need = 100;
  while (xp >= acc + need) {
    acc += need;
    level += 1;
    need = Math.round(need * 1.4);
  }
  const xpIntoLevel = xp - acc;
  return {
    level,
    xpIntoLevel,
    xpForNext: need,
    levelProgress: need ? round2(xpIntoLevel / need) : 0
  };
}

/**
 * Deterministic crisis detection. Matches intent-bearing PHRASES (not loose
 * single words) to keep precision high and avoid flagging hyperbole like
 * "this exam is killing my schedule". Runs BEFORE any LLM call.
 * @returns {{flagged:boolean,matches:string[]}}
 */
export function detectCrisis(text) {
  const norm = normalize(text);
  const matches = CRISIS_PHRASES.filter((p) => norm.includes(p));
  return { flagged: matches.length > 0, matches };
}

/** Crisis scan across the whole history (deduplicated matches). */
function aggregateCrisis(entries) {
  const all = new Set();
  for (const e of entries) for (const m of detectCrisis(e.text).matches) all.add(m);
  return { flagged: all.size > 0, matches: [...all] };
}

/** Days until the exam, or null if no exam date is set. */
function examCountdown(examDate, todayTs) {
  if (!examDate) return null;
  const examTs = typeof examDate === 'number' ? examDate : Date.parse(examDate);
  if (Number.isNaN(examTs)) return null;
  return dayIndex(examTs) - dayIndex(todayTs);
}

/**
 * The one entry point. Pure: same inputs -> same insights.
 * @param {{text:string,mood:number,ts:number}[]} entries
 * @param {{exam?:string,examDate?:string|number,today?:number}} [opts]
 */
export function analyze(entries = [], opts = {}) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && e.ts != null) : [];
  const todayTs = opts.today != null ? Number(opts.today) : Date.now();

  const triggers = extractTriggers(list);
  const moodTrend = computeMoodTrend(list);
  const sentiment = aggregateSentiment(list);
  const game = computeGameState(list, todayTs);

  return {
    triggers,
    sentiment,
    moodTrend,
    patterns: detectPatterns(list, triggers, moodTrend),
    streak: game.streak,
    xp: game.xp,
    level: game.level,
    levelProgress: game.levelProgress,
    xpIntoLevel: game.xpIntoLevel,
    xpForNext: game.xpForNext,
    crisis: aggregateCrisis(list),
    examCountdown: examCountdown(opts.examDate, todayTs),
    exam: opts.exam || null,
    entryCount: list.length
  };
}

/** Stable cache key: recompute only when count, latest entry, or opts change. */
export function analysisKey(entries = [], opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  let lastTs = 0;
  for (const e of list) if (e && e.ts > lastTs) lastTs = e.ts;
  return `${list.length}:${lastTs}:${opts.exam || ''}:${opts.examDate || ''}:${opts.today || ''}`;
}

/**
 * Generic single-slot memoizer. Returns the cached result while the key is
 * unchanged, recomputes (and returns a fresh result) when it changes.
 */
export function memoize(fn, keyFn) {
  let lastKey;
  let lastVal;
  let has = false;
  return (...args) => {
    const key = keyFn(...args);
    if (has && key === lastKey) return lastVal;
    lastVal = fn(...args);
    lastKey = key;
    has = true;
    return lastVal;
  };
}

/** A ready-made memoized analyzer for the app to use. */
export function createMemoizedAnalyze() {
  return memoize(analyze, analysisKey);
}

// --- tiny numeric helpers ---
function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
