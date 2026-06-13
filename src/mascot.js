/**
 * mascot.js — Saathi, the user-built companion creature.
 *
 * Ported from the design handoff's mascot engine. A geometric (culturally
 * neutral) creature on a 120×120 viewBox, built with createElementNS (no
 * innerHTML, no external assets — CSP-clean) so it recolours and swaps
 * expression at runtime. Config: { shape, color, accessory, name }.
 *
 * The geometry helpers (shade, bodyPoints, MASCOT_MOUTHS, MOOD_MOUTHS) are pure
 * and unit-tested; the DOM builders use them.
 */

const SVG = 'http://www.w3.org/2000/svg';

export const SHAPES = ['pentagon', 'circle', 'squircle', 'hexagon', 'triangle'];
export const ACCESSORIES = ['none', 'sprout', 'sparkle', 'cap', 'specs'];
export const PALETTE = [
  ['#639922', 'sage'], ['#5B8DB8', 'blue'], ['#E08A5B', 'terracotta'],
  ['#9B86C4', 'lavender'], ['#E0A93E', 'gold'], ['#4FA399', 'teal']
];
const INK = '#2C2C2A';

/** Polygon point strings for the polygon-based body shapes. Pure. */
export const bodyPoints = {
  hexagon: '60,19 96,40 96,80 60,101 24,80 24,40',
  triangle: '60,26 95,93 25,93',
  pentagon: '60,21 97,49 83,95 37,95 23,49'
};

/** Mouth path by mascot expression. Pure. */
export const MASCOT_MOUTHS = {
  idle: 'M50,74 Q60,82 70,74',
  happy: 'M46,72 Q60,88 74,72',
  cheer: 'M48,71 Q60,91 72,71 Z',
  concerned: 'M52,77 Q60,80 68,77'
};

/** Mouth path by mood level 1–5 (40×40 viewBox). Pure. */
export const MOOD_MOUTHS = {
  1: 'M12,30 Q20,23 28,30',
  2: 'M13,29 Q20,25 27,29',
  3: 'M13,27 L27,27',
  4: 'M13,25 Q20,31 27,25',
  5: 'M11,24 Q20,34 29,24'
};

/** Lighten (p>0) or darken (p<0) a #rrggbb hex by p percent. Pure. */
export function shade(hex, p) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (p / 100) * 255)));
  return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
}

function el(name, attrs, kids) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  if (kids) for (const c of kids) if (c) node.appendChild(c);
  return node;
}

function bodyShape(shape, col) {
  const s = { fill: col, stroke: col, 'stroke-width': 12, 'stroke-linejoin': 'round' };
  if (shape === 'circle') return el('circle', { cx: 60, cy: 60, r: 42, fill: col });
  if (shape === 'squircle') return el('rect', { x: 20, y: 20, width: 80, height: 80, rx: 28, fill: col });
  if (shape === 'hexagon') return el('polygon', { points: bodyPoints.hexagon, ...s });
  if (shape === 'triangle') return el('polygon', { points: bodyPoints.triangle, ...s });
  return el('polygon', { points: bodyPoints.pentagon, ...s });
}

function face(expr) {
  const out = [];
  const ly = 58, lx = 46, rx = 74;
  if (expr === 'happy' || expr === 'cheer') {
    out.push(el('path', { d: `M${lx - 7},${ly + 1} Q${lx},${ly - 8} ${lx + 7},${ly + 1}`, stroke: INK, 'stroke-width': 4.5, fill: 'none', 'stroke-linecap': 'round' }));
    out.push(el('path', { d: `M${rx - 7},${ly + 1} Q${rx},${ly - 8} ${rx + 7},${ly + 1}`, stroke: INK, 'stroke-width': 4.5, fill: 'none', 'stroke-linecap': 'round' }));
    out.push(el('ellipse', { cx: 38, cy: 69, rx: 5, ry: 3, fill: '#E8907A', opacity: 0.5 }));
    out.push(el('ellipse', { cx: 82, cy: 69, rx: 5, ry: 3, fill: '#E8907A', opacity: 0.5 }));
  } else {
    out.push(el('circle', { cx: lx, cy: ly, r: 4.6, fill: INK }));
    out.push(el('circle', { cx: rx, cy: ly, r: 4.6, fill: INK }));
  }
  if (expr === 'concerned') {
    out.push(el('line', { x1: lx - 8, y1: ly - 12, x2: lx + 5, y2: ly - 9, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    out.push(el('line', { x1: rx + 8, y1: ly - 12, x2: rx - 5, y2: ly - 9, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }));
  }
  const m = MASCOT_MOUTHS[expr] || MASCOT_MOUTHS.idle;
  if (expr === 'cheer') out.push(el('path', { d: m, fill: INK }));
  else out.push(el('path', { d: m, stroke: INK, 'stroke-width': expr === 'concerned' ? 4 : 4.5, fill: 'none', 'stroke-linecap': 'round' }));
  return out;
}

function accessory(acc, col) {
  const out = [];
  if (acc === 'sprout') {
    out.push(el('path', { d: 'M60,22 L60,8', stroke: shade(col, -22), 'stroke-width': 3, 'stroke-linecap': 'round' }));
    out.push(el('ellipse', { cx: 53, cy: 7, rx: 7, ry: 4, fill: '#7DB23A', transform: 'rotate(-32 53 7)' }));
    out.push(el('ellipse', { cx: 67, cy: 7, rx: 7, ry: 4, fill: '#7DB23A', transform: 'rotate(32 67 7)' }));
  } else if (acc === 'sparkle') {
    out.push(el('path', { d: 'M93,12 L96,22 L106,25 L96,28 L93,38 L90,28 L80,25 L90,22 Z', fill: '#EF9F27' }));
    out.push(el('circle', { cx: 78, cy: 16, r: 2.5, fill: '#EF9F27' }));
  } else if (acc === 'cap') {
    out.push(el('rect', { x: 42, y: 4, width: 36, height: 15, rx: 7, fill: '#5B8DB8' }));
    out.push(el('rect', { x: 37, y: 17, width: 46, height: 5, rx: 2.5, fill: '#4A7AA0' }));
  } else if (acc === 'specs') {
    out.push(el('circle', { cx: 46, cy: 58, r: 11, fill: 'none', stroke: INK, 'stroke-width': 3 }));
    out.push(el('circle', { cx: 74, cy: 58, r: 11, fill: 'none', stroke: INK, 'stroke-width': 3 }));
    out.push(el('line', { x1: 57, y1: 58, x2: 63, y2: 58, stroke: INK, 'stroke-width': 3 }));
  }
  return out;
}

/**
 * Build the mascot SVG element.
 * @param {{shape?:string,color?:string,accessory?:string,expr?:string,size?:number}} o
 * @returns {SVGSVGElement}
 */
export function makeMascot(o = {}) {
  const col = o.color || '#639922';
  const shape = o.shape || 'pentagon';
  const expr = o.expr || 'idle';
  const acc = o.accessory || 'none';
  const size = o.size || 120;
  const kids = [el('ellipse', { cx: 60, cy: 114, rx: 28, ry: 5, fill: 'rgba(44,44,42,.07)' })];
  if (expr === 'cheer') {
    kids.push(el('path', { d: 'M34,74 Q15,64 11,45', stroke: INK, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }));
    kids.push(el('path', { d: 'M86,74 Q105,64 109,45', stroke: INK, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }));
    kids.push(el('circle', { cx: 11, cy: 45, r: 4, fill: INK }));
    kids.push(el('circle', { cx: 109, cy: 45, r: 4, fill: INK }));
  }
  kids.push(bodyShape(shape, col));
  face(expr).forEach((e) => kids.push(e));
  accessory(acc, col).forEach((e) => kids.push(e));
  const svg = el('svg', { viewBox: '0 0 120 120', width: size, height: size, role: 'img' }, kids);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  svg.dataset.expression = expr;
  const title = el('title', {});
  title.textContent = o.name ? `${o.name}, your companion` : 'Your companion';
  svg.insertBefore(title, svg.firstChild);
  return svg;
}

/** Small shape preview glyph for the builder's shape chooser. */
export function shapeIcon(shape, col) {
  return el('svg', { viewBox: '0 0 120 120', width: 34, height: 34, 'aria-hidden': 'true' }, [bodyShape(shape, col)]);
}

/** Mood face icon for level 1–5 (mouth-curve encodes the level; never colour alone). */
export function moodIcon(level, col) {
  const ink = col || INK;
  return el('svg', { viewBox: '0 0 40 40', width: 30, height: 30, 'aria-hidden': 'true' }, [
    el('circle', { cx: 14, cy: 16, r: 2.4, fill: ink }),
    el('circle', { cx: 26, cy: 16, r: 2.4, fill: ink }),
    el('path', { d: MOOD_MOUTHS[level] || MOOD_MOUTHS[3], stroke: ink, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
  ]);
}

/**
 * Map insights to a mascot expression. Crisis / low recent mood → concerned;
 * long streak → cheer; positive → happy; otherwise idle. Pure.
 */
export function expressionFor(insights = {}) {
  if (insights.crisis && insights.crisis.flagged) return 'concerned';
  const last = insights.moodTrend && insights.moodTrend.points && insights.moodTrend.points.slice(-1)[0];
  if (last && last.mood <= 2) return 'concerned';
  if (insights.streak >= 7) return 'cheer';
  if (insights.sentiment && insights.sentiment.label === 'positive') return 'happy';
  return 'idle';
}
