/**
 * icons.js — inline SVG icon set. Browser only.
 *
 * Ported from the design handoff's `icon()` to vanilla createElementNS (no
 * innerHTML, no external assets — CSP-clean). Each call returns a fresh <svg>
 * element so callers can size/recolour per use.
 */

const SVG = 'http://www.w3.org/2000/svg';

function el(name, attrs, kids) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  if (kids) for (const c of kids) if (c) node.appendChild(c);
  return node;
}

/**
 * @param {string} name icon key
 * @param {{size?:number,color?:string,sw?:number}} [o]
 * @returns {SVGSVGElement}
 */
export function icon(name, o = {}) {
  const c = o.color || '#2C2C2A';
  const sz = o.size || 22;
  const sw = o.sw || 2;
  const ln = (d, extra) =>
    el('path', { d, stroke: c, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none', ...(extra || {}) });
  const wrap = (kids) => el('svg', { viewBox: '0 0 24 24', width: sz, height: sz, fill: 'none', 'aria-hidden': 'true' }, kids);

  switch (name) {
    case 'journal':
      return wrap([ln('M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4Z'), ln('M9 9h6'), ln('M9 13h4')]);
    case 'focus':
      return wrap([el('circle', { cx: 12, cy: 13, r: 8, stroke: c, 'stroke-width': sw, fill: 'none' }), ln('M12 13V9'), ln('M12 13l3 2'), ln('M9 3h6')]);
    case 'companion':
      return wrap([ln('M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-1-2V6Z')]);
    case 'breathe':
      return wrap([el('circle', { cx: 12, cy: 12, r: 3.4, stroke: c, 'stroke-width': sw, fill: 'none' }), el('circle', { cx: 12, cy: 12, r: 8, stroke: c, 'stroke-width': sw, fill: 'none', opacity: 0.5 })]);
    case 'chart':
      return wrap([ln('M5 19V5'), ln('M5 19h14'), ln('M9 16v-4'), ln('M13 16V8'), ln('M17 16v-6')]);
    case 'gear':
      return wrap([el('circle', { cx: 12, cy: 12, r: 3, stroke: c, 'stroke-width': sw, fill: 'none' }), ln('M12 4v2'), ln('M12 18v2'), ln('M4 12h2'), ln('M18 12h2'), ln('M6.3 6.3l1.4 1.4'), ln('M16.3 16.3l1.4 1.4'), ln('M17.7 6.3l-1.4 1.4'), ln('M7.7 16.3l-1.4 1.4')]);
    case 'lock':
      return wrap([el('rect', { x: 5, y: 11, width: 14, height: 9, rx: 2, stroke: c, 'stroke-width': sw, fill: 'none' }), ln('M8 11V8a4 4 0 0 1 8 0v3')]);
    case 'clock':
      return wrap([el('circle', { cx: 12, cy: 12, r: 8, stroke: c, 'stroke-width': sw, fill: 'none' }), ln('M12 8v4l3 2')]);
    case 'flame':
      return wrap([el('path', { d: 'M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 .5 2 2 2 2 4', fill: c, stroke: 'none' })]);
    case 'check':
      return wrap([ln('M5 12.5 10 17 19 7')]);
    case 'x':
      return wrap([ln('M7 7l10 10'), ln('M17 7L7 17')]);
    case 'minus':
      return wrap([ln('M6 12h12', { 'stroke-width': 2.4 })]);
    case 'plus':
      return wrap([ln('M12 6v12', { 'stroke-width': 2.4 }), ln('M6 12h12', { 'stroke-width': 2.4 })]);
    case 'bell':
      return wrap([ln('M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z'), ln('M10 20a2 2 0 0 0 4 0')]);
    case 'tip':
      return wrap([el('circle', { cx: 12, cy: 12, r: 8, stroke: c, 'stroke-width': sw, fill: 'none' }), ln('M12 11v5'), el('circle', { cx: 12, cy: 8, r: 0.6, fill: c, stroke: c })]);
    case 'mic':
      return wrap([el('rect', { x: 9, y: 3, width: 6, height: 11, rx: 3, stroke: c, 'stroke-width': sw, fill: 'none' }), ln('M5 11a7 7 0 0 0 14 0'), ln('M12 18v3')]);
    case 'send':
      return wrap([el('path', { d: 'M4 12l16-7-7 16-2-7-7-2Z', fill: '#fff', stroke: 'none' })]);
    case 'wifiOff':
      return wrap([ln('M3 8a16 16 0 0 1 18 0'), ln('M6.5 11.5a10 10 0 0 1 11 0'), ln('M9.5 15a5 5 0 0 1 5 0'), el('circle', { cx: 12, cy: 18.5, r: 1, fill: c, stroke: c }), ln('M3 3l18 18', { stroke: '#0C447C' })]);
    case 'heart':
      return wrap([el('path', { d: 'M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5C19 15.5 12 20 12 20Z', fill: '#0C447C', stroke: 'none' })]);
    case 'phone':
      return wrap([el('path', { d: 'M6 4h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2.2 2A15 15 0 0 1 4 6.2 2 2 0 0 1 6 4Z', fill: c, stroke: 'none' })]);
    case 'download':
      return wrap([ln('M12 4v10'), ln('M8 11l4 4 4-4'), ln('M5 19h14')]);
    case 'trash':
      return wrap([ln('M5 7h14'), ln('M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'), ln('M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12')]);
    case 'none':
      return wrap([el('circle', { cx: 12, cy: 12, r: 8, stroke: c, 'stroke-width': sw, fill: 'none', opacity: 0.5 }), ln('M7 17 17 7', { opacity: 0.5 })]);
    default:
      return wrap([]);
  }
}
