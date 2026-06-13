/**
 * mascot.js — Saathi, the companion creature. Browser only.
 *
 * A single inline SVG (no external assets) whose expression reacts to the
 * student's mood and streak: idle / happy / cheer / concerned. Built with
 * createElementNS (not innerHTML) and updated by swapping a few attributes, so
 * it stays cheap to animate and CSP-clean.
 */

const SVG = 'http://www.w3.org/2000/svg';

const MOUTHS = {
  idle: 'M 38 64 Q 50 70 62 64',
  happy: 'M 36 62 Q 50 78 64 62',
  cheer: 'M 34 60 Q 50 84 66 60',
  concerned: 'M 38 70 Q 50 60 62 70'
};

const EYE_RY = { idle: 6, happy: 5, cheer: 4, concerned: 7 };

/**
 * @param {{state?:string}} [opts]
 * @returns {{element:SVGSVGElement, setExpression:(state:string)=>void}}
 */
export function createMascot({ state = 'idle' } = {}) {
  const svg = el('svg', { viewBox: '0 0 100 100', width: '120', height: '120', role: 'img' });
  const title = el('title', {});
  title.textContent = 'Saathi, your companion';
  svg.appendChild(title);

  // Body.
  svg.appendChild(el('circle', { cx: 50, cy: 52, r: 38, fill: 'var(--mascot-body, #7c5cff)' }));
  // Cheeks.
  svg.appendChild(el('circle', { cx: 32, cy: 60, r: 6, fill: 'var(--mascot-cheek, #ff9bb3)', opacity: 0.7 }));
  svg.appendChild(el('circle', { cx: 68, cy: 60, r: 6, fill: 'var(--mascot-cheek, #ff9bb3)', opacity: 0.7 }));
  // Eyes.
  const leftEye = el('ellipse', { cx: 40, cy: 48, rx: 5, ry: EYE_RY[state], fill: '#1a1130' });
  const rightEye = el('ellipse', { cx: 60, cy: 48, rx: 5, ry: EYE_RY[state], fill: '#1a1130' });
  svg.appendChild(leftEye);
  svg.appendChild(rightEye);
  // Mouth.
  const mouth = el('path', { d: MOUTHS[state] || MOUTHS.idle, stroke: '#1a1130', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' });
  svg.appendChild(mouth);
  // Sparkles (only shown when cheering).
  const sparkles = el('g', { opacity: 0 });
  sparkles.appendChild(el('circle', { cx: 16, cy: 24, r: 3, fill: 'var(--accent, #ffd166)' }));
  sparkles.appendChild(el('circle', { cx: 84, cy: 28, r: 3, fill: 'var(--accent, #ffd166)' }));
  sparkles.appendChild(el('circle', { cx: 80, cy: 76, r: 2.5, fill: 'var(--accent, #ffd166)' }));
  svg.appendChild(sparkles);

  function setExpression(next) {
    const s = MOUTHS[next] ? next : 'idle';
    mouth.setAttribute('d', MOUTHS[s]);
    leftEye.setAttribute('ry', EYE_RY[s]);
    rightEye.setAttribute('ry', EYE_RY[s]);
    sparkles.setAttribute('opacity', s === 'cheer' ? 1 : 0);
    svg.dataset.expression = s;
  }
  setExpression(state);

  return { element: svg, setExpression };
}

/**
 * Map insights to an expression. Crisis/low mood -> concerned; long streak or
 * level-up moments -> cheer; positive -> happy; otherwise idle.
 */
export function expressionFor(insights = {}) {
  if (insights.crisis && insights.crisis.flagged) return 'concerned';
  const mood = insights.moodTrend && insights.moodTrend.points.slice(-1)[0];
  if (mood && mood.mood <= 2) return 'concerned';
  if (insights.streak >= 3) return 'cheer';
  if (insights.sentiment && insights.sentiment.label === 'positive') return 'happy';
  return 'idle';
}

function el(name, attrs) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
