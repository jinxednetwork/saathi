/**
 * prompts.js — PURE prompt construction + safety gating. No DOM, no I/O.
 *
 * Turns the engine's `insights` into the grounding the LLM needs, and enforces
 * the crisis-safety boundary: the deterministic crisis check ALWAYS runs before
 * the model, and when it fires we short-circuit to a calm, helpline-first reply
 * instead of letting the model improvise a crisis response.
 */

import { detectCrisis } from './engine.js';
import { HELPLINES } from './lexicons.js';
import { examContextLine } from './exam-context.js';

/**
 * The companion's persona + hard safety rules. Returned as a single system
 * message. The safety clause is non-negotiable and asserted by tests.
 */
export function buildSystemPrompt() {
  return [
    'You are Saathi, a warm, encouraging wellness companion for students in India',
    'preparing for high-stakes exams (NEET, JEE, CUET, CAT, GATE, UPSC).',
    'You listen without judgement, validate feelings first, then offer one or two',
    'small, practical coping steps (breathing, study breaks, sleep, reframing).',
    'Keep replies short, kind, and concrete. Write in plain text only — no markdown,',
    'no code, no HTML. Never diagnose.',
    'For factual exam details (dates, cutoffs, syllabus, eligibility), do not state',
    'them — gently point the student to the official source. Your role is emotional',
    'support, not exam information.',
    '',
    'SAFETY RULES (absolute):',
    '- You are NOT a substitute for professional help and you say so when relevant.',
    '- You must NEVER encourage, instruct, or normalise self-harm or suicide.',
    '- If a student expresses thoughts of self-harm or suicide, do not counsel them',
    '  yourself: gently urge them to contact a helpline or a trusted person right now,',
    '  and defer to the crisis resources the app is showing.',
    '- Do not give medical, legal, or guaranteed-outcome advice.'
  ].join('\n');
}

/**
 * Compact grounding context built from insights, injected so the model speaks
 * to THIS student's situation rather than generically.
 * @param {object} insights output of engine.analyze
 */
export function buildContext(insights = {}) {
  const lines = [];
  if (insights.exam) {
    const cd = insights.examCountdown;
    lines.push(
      `Exam: ${insights.exam}${cd != null ? ` (${cd} day${cd === 1 ? '' : 's'} away)` : ''}.`
    );
    const examLine = examContextLine(insights.exam);
    if (examLine) lines.push(examLine);
  }
  if (insights.sentiment) {
    lines.push(`Recent overall mood: ${insights.sentiment.label}.`);
  }
  if (Array.isArray(insights.triggers) && insights.triggers.length) {
    const top = insights.triggers.slice(0, 3).map((t) => t.theme).join(', ');
    lines.push(`Recurring stress themes: ${top}.`);
  }
  if (insights.streak) {
    lines.push(`Journaling streak: ${insights.streak} day${insights.streak === 1 ? '' : 's'}.`);
  }
  if (Array.isArray(insights.patterns) && insights.patterns.length) {
    lines.push(`Noticed patterns: ${insights.patterns.join(' ')}`);
  }
  return lines.length
    ? `Context about this student (use it gently, do not recite it back):\n${lines.join('\n')}`
    : '';
}

/**
 * Assemble the chat message array for the provider.
 * @param {string} userText the new user message
 * @param {object} insights
 * @param {{role:string,content:string}[]} [history] prior turns (no system msg)
 */
export function buildMessages(userText, insights = {}, history = []) {
  const context = buildContext(insights);
  const system = context ? `${buildSystemPrompt()}\n\n${context}` : buildSystemPrompt();
  return [
    { role: 'system', content: system },
    ...history.filter((m) => m.role !== 'system'),
    { role: 'user', content: String(userText || '') }
  ];
}

/**
 * The safety gate. Runs BEFORE any model call. Returns `{ gated, reply }`.
 * When gated, the caller must show `reply` (and the helpline panel) and must
 * NOT call the LLM. Gates on either the current message or aggregated history.
 */
export function safetyGate(userText, insights = {}) {
  const flagged =
    detectCrisis(userText).flagged || (insights.crisis && insights.crisis.flagged);
  if (!flagged) return { gated: false, reply: null };
  return { gated: true, reply: crisisReply() };
}

/** A calm, deterministic, helpline-first message. Never model-generated. */
export function crisisReply() {
  const lines = HELPLINES.map((h) => `• ${h.name}: ${h.number} (${h.note})`);
  return [
    'I hear how much pain you are in right now, and I am really glad you wrote this down.',
    'You deserve support from a real person who can help you through this moment.',
    'Please reach out right now — you do not have to carry this alone:',
    '',
    ...lines,
    '',
    'If you feel you might act on these thoughts, please contact a trusted person or',
    'emergency services immediately. I am here with you, but I am not a substitute for',
    'professional help.'
  ].join('\n');
}
