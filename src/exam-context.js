/**
 * exam-context.js — PURE data. No DOM, no I/O.
 *
 * A tiny, factual-LIGHT map of the *emotional texture* of each exam Saathi
 * supports. This is NOT exam information (no dates, cutoffs, syllabus): the
 * on-device model would only hallucinate those, and stating them wrong to a
 * stressed aspirant is harmful. These lines exist so the companion speaks to
 * the *feeling* of the journey, not its facts.
 *
 * Keys must match the exact strings stored by the Settings dropdown
 * (index.html → #set-exam → settings.exam in storage.js).
 */
export const EXAM_CONTEXT = {
  NEET:
    'NEET feels make-or-break and single-shot; medical-aspirant pressure often comes wrapped in family hopes and relentless biology revision.',
  JEE:
    'JEE is a long problem-solving grind; rank obsession, coaching-class intensity, and comparison with peers are common weights.',
  CUET:
    'CUET is newer and uncertain, juggling many subjects on top of board exams — the ambiguity itself can be stressful.',
  CAT:
    'CAT mixes students and working professionals; percentile anxiety and squeezing prep around a job or college load are usual strains.',
  GATE:
    'GATE means a vast syllabus and one annual attempt, often balanced against final-year studies or a job — endurance matters more than sprinting.',
  UPSC:
    'UPSC is a multi-year journey with a very low success rate; self-worth can get tangled in the result, and the long haul brings isolation and repeated attempts.',
  'Board exams':
    'Board exams carry parental and school pressure and feel like the foundation for everything next — the stakes can feel larger than they are.',
  Other:
    'High-stakes exam pressure can feel isolating and all-consuming, whatever the exam.'
};

/**
 * Return the one-line emotional context for an exam, or '' if unknown/empty.
 * @param {string} exam value of settings.exam
 * @returns {string}
 */
export function examContextLine(exam) {
  if (!exam) return '';
  return EXAM_CONTEXT[exam] || '';
}
