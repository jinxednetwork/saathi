/**
 * lexicons.js — PURE DATA. No DOM, no I/O.
 *
 * The word lists that ground Saathi's analysis engine. Keeping these as data
 * (rather than logic) makes the engine small, testable, and easy to tune
 * without touching code. Everything here is lowercase; the engine normalizes
 * input the same way before matching.
 *
 * Audience: Indian entrance/board exam students (NEET, JEE, CUET, CAT, GATE,
 * UPSC). The trigger themes below reflect the stressors that are common and
 * specific to that context.
 */

/**
 * Themed exam-stress trigger lexicon. Each theme maps to keyword stems that,
 * when found in a journal entry, count toward that theme. Stems are matched as
 * whole words (word-boundary), so "fail" matches "fail"/"failed"/"failing"
 * only via the explicit variants listed — we list variants rather than do
 * fuzzy stemming, to keep matching deterministic and easy to reason about.
 */
export const TRIGGER_LEXICON = {
  'Time pressure': [
    'time', 'deadline', 'syllabus', 'late', 'rushing', 'rushed',
    'hurry', 'cram', 'cramming', 'backlog', 'pending', 'running out',
    'not enough time', 'too much to cover', 'behind on'
  ],
  'Self-doubt': [
    'fail', 'failed', 'failing', 'failure', 'stupid', 'dumb', 'useless',
    'not good enough', 'cant do', "can't do", 'doubt', 'doubting', 'hopeless',
    'worthless', 'inadequate', 'not smart', 'give up', 'giving up'
  ],
  'Comparison & rank': [
    'everyone', 'others', 'topper', 'toppers', 'rank', 'ranking', 'percentile',
    'compare', 'comparing', 'compared', 'better than me', 'ahead of me',
    'falling behind', 'leftout', 'left out', 'jealous'
  ],
  'Sleep': [
    'tired', 'exhausted', 'insomnia', 'awake', 'cant sleep', "can't sleep",
    'no sleep', 'sleepless', 'sleepy', 'fatigue', 'fatigued', 'drowsy',
    'up all night', 'late night', 'restless'
  ],
  'Family & expectations': [
    'parents', 'father', 'mother', 'mom', 'dad', 'family', 'expectations',
    'disappoint', 'disappointed', 'disappointing', 'pressure from', 'their hopes',
    'let them down', 'relatives', 'society', 'log kya kahenge'
  ],
  'Health': [
    'headache', 'sick', 'unwell', 'pain', 'nausea', 'dizzy', 'eyes hurt',
    'back pain', 'stomach', 'appetite', 'not eating', 'skipping meals'
  ],
  'Burnout': [
    'burnout', 'burnt out', 'burned out', 'overwhelmed', 'overwhelm', 'drained',
    'no motivation', 'demotivated', 'cant focus', "can't focus", 'distracted',
    'numb', 'empty', 'monotonous', 'same routine', 'no energy'
  ],
  'Isolation': [
    'alone', 'lonely', 'loneliness', 'no friends', 'isolated', 'nobody',
    'no one understands', 'cut off', 'withdrawn', 'avoiding everyone'
  ]
};

/**
 * Sentiment word lists. Used to score an entry from -1 (very negative) to
 * +1 (very positive). Small, transparent, and tuned for the journaling tone of
 * stressed students rather than general-purpose sentiment.
 */
export const POSITIVE_WORDS = [
  'happy', 'calm', 'relaxed', 'confident', 'hopeful', 'proud', 'grateful',
  'good', 'great', 'better', 'progress', 'improving', 'improved', 'motivated',
  'focused', 'productive', 'achieved', 'accomplished', 'rested', 'refreshed',
  'positive', 'excited', 'peaceful', 'content', 'capable', 'ready', 'win',
  'won', 'solved', 'understood', 'clear', 'enjoyed', 'love', 'thankful'
];

export const NEGATIVE_WORDS = [
  'sad', 'anxious', 'anxiety', 'stress', 'stressed', 'stressful', 'worried',
  'worry', 'scared', 'afraid', 'fear', 'panic', 'panicking', 'nervous',
  'tense', 'angry', 'frustrated', 'frustrating', 'upset', 'crying', 'cry',
  'depressed', 'depressing', 'hopeless', 'helpless', 'overwhelmed', 'tired',
  'exhausted', 'hate', 'terrible', 'awful', 'bad', 'worse', 'worst', 'fail',
  'failing', 'lost', 'stuck', 'confused', 'guilty', 'ashamed', 'pressure',
  'cant', "can't", 'difficult', 'hard', 'impossible'
];

/**
 * Crisis phrases — deterministic self-harm / suicidal-ideation signals.
 *
 * IMPORTANT: these are matched as PHRASES (substring of normalized text), and
 * the engine deliberately requires a deliberate intent phrase, not a single
 * loose word like "die" or "kill". This avoids over-flagging benign hyperbole
 * such as "this exam is killing my schedule" or "I'm dying to finish this".
 * The crisis check runs BEFORE any LLM call; on a match the UI surfaces India
 * helplines. We err toward clear, intent-bearing phrases for precision.
 */
export const CRISIS_PHRASES = [
  'kill myself', 'killing myself', 'end my life', 'ending my life',
  'end it all', 'take my life', 'taking my life', 'want to die',
  'wish i was dead', 'wish i were dead', 'better off dead', 'no reason to live',
  'nothing to live for', 'dont want to live', "don't want to live",
  'cant go on', "can't go on", 'cant take it anymore', "can't take it anymore",
  'self harm', 'self-harm', 'hurt myself', 'hurting myself', 'cut myself',
  'cutting myself', 'suicidal', 'suicide', 'commit suicide', 'no point living',
  'disappear forever', 'better without me', 'better off without me'
];

/**
 * India mental-health helplines, surfaced whenever a crisis signal is detected.
 * Kept as data so the UI and the prompt-safety layer reference one source.
 */
export const HELPLINES = [
  { name: 'Tele-MANAS (Govt. of India)', number: '14416', note: '24x7, toll-free' },
  { name: 'KIRAN Mental Health', number: '1800-599-0019', note: '24x7, 13 languages' },
  { name: 'iCall (TISS)', number: '+91-9152987821', note: 'Mon–Sat, 8am–10pm' }
];
