// Inscription renderer and fitting engine, shared by the public page and the
// dev editor. Each line is real HTML text; its width is measured in the
// browser at a reference size and the font size is solved to fill the row.

import { findFont, familyStack, ensureFont } from './fonts.js';

export const DOT = '·';
const REF = 100; // reference font size (px) used for measurement
const SEPARATORS = /[\s·•⋅‧|]+/;
const ELEMENTS = new Set(['p', 'h1', 'h2', 'div']);
const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' };

export const GLOBAL_DEFAULTS = {
  font: 'della-respira',
  fontWeight: 400,
  maxWidth: 620,
  pageAlign: 'center',
  topOffset: 8,
  letterSpacing: 0.04,
  minFontSize: 15,
  maxFontSize: 160,
  lineHeight: 0.9,
  rowGap: 0.4,
  clearance: 0.05,
  allowOverlap: false,
  opticalEdges: true,
  background: '#f2eee3',
  color: '#262420',
  padding: { min: 16, fluid: 6, max: 72 },
  dot: { char: DOT, scale: 1, shift: 0, space: 0 },
  navLabel: 'Site',
  experimentalStretch: false,
  stretchLimit: 1.2,
};

// Per-row layout overrides. Content keys (items, element, label, id) are separate.
export const ROW_OVERRIDES = [
  'fit', 'fontSize', 'width', 'align', 'font', 'fontWeight', 'letterSpacing',
  'minFontSize', 'maxFontSize', 'lineHeight', 'spaceBefore', 'spaceAfter',
  'offsetX', 'offsetY', 'allowOverlap', 'stretch', 'mobile',
];

const isSet = (v) => v !== undefined && v !== null && v !== '';
const num = (v, fallback) => (isSet(v) && Number.isFinite(+v) ? +v : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function resolveGlobal(g = {}) {
  const d = GLOBAL_DEFAULTS;
  return {
    ...d,
    ...g,
    padding: { ...d.padding, ...g.padding },
    dot: { ...d.dot, ...g.dot },
  };
}

export function resolveRow(row, g) {
  const min = num(row.minFontSize, g.minFontSize);
  return {
    fit: row.fit === 'fixed' ? 'fixed' : 'auto',
    fontSize: num(row.fontSize, 48),
    width: clamp(num(row.width, 100), 5, 100),
    align: JUSTIFY[row.align] ? row.align : 'center',
    font: row.font || g.font,
    fontWeight: num(row.fontWeight, g.fontWeight),
    letterSpacing: num(row.letterSpacing, g.letterSpacing),
    min,
    max: Math.max(min, num(row.maxFontSize, g.maxFontSize)),
    lineHeight: num(row.lineHeight, g.lineHeight),
    spaceBefore: num(row.spaceBefore, 0),
    spaceAfter: num(row.spaceAfter, 0),
    offsetX: num(row.offsetX, 0),
    offsetY: num(row.offsetY, 0),
    allowOverlap: !!row.allowOverlap || !!g.allowOverlap,
    stretch: !!g.experimentalStretch && !!row.stretch,
    breaks: Array.isArray(row.mobile?.breaks) ? row.mobile.breaks : [],
  };
}

// Display words: explicit display text if given, else the readable label.
// Uppercased; spaces and dots become word boundaries. No letter substitution.
export function wordsOf(item) {
  const src = (item.display || '').trim() || item.label || '';
  return src.toUpperCase().split(SEPARATORS).filter(Boolean);
}

// Tokens are the smallest units a row may wrap between. A link (with its
// numeral) is one token; plain text breaks between words.
export function tokenize(row) {
  const tokens = [];
  (row.items || []).forEach((item, itemIndex) => {
    const words = wordsOf(item);
    const numeral = (item.numeral || '').trim().toUpperCase();
    const label = (item.label || '').trim() || words.join(' ');
    if (item.href) {
      if (words.length || numeral) tokens.push({ link: true, item, itemIndex, words, numeral, label });
    } else {
      words.forEach((w, i) => tokens.push({
        link: false, item, itemIndex, words: [w], numeral: i === 0 ? numeral : '', label: i === 0 ? label : '',
      }));
    }
  });
  return tokens;
}

export function displayText(tokens, dotChar = DOT) {
  return tokens.map((t) => [t.numeral, ...t.words].filter(Boolean).join(dotChar)).join(dotChar);
}

export function applyPage(page, config) {
  const g = resolveGlobal(config.global);
  const p = g.padding;
  page.style.setProperty('--page-bg', g.background);
  page.style.setProperty('--page-fg', g.color);
  page.style.setProperty('--page-pad', `clamp(${p.min}px, ${p.fluid}cqw, ${p.max}px)`);
  page.style.setProperty('--top-offset', `${g.topOffset}vh`);
  page.dataset.align = g.pageAlign;
}

// ---------------------------------------------------------------- metrics

const ctx = document.createElement('canvas').getContext('2d');
const metricCache = new Map();

function canvasMetrics(font, text) {
  const key = `${font}|${text}`;
  let m = metricCache.get(key);
  if (!m) {
    ctx.font = font;
    const t = ctx.measureText(text);
    m = {
      left: t.actualBoundingBoxLeft / REF,
      right: t.actualBoundingBoxRight / REF,
      width: t.width / REF,
      ascent: t.actualBoundingBoxAscent / REF,
      descent: t.actualBoundingBoxDescent / REF,
      fontAscent: (t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent * 1.3) / REF,
      fontDescent: (t.fontBoundingBoxDescent ?? t.actualBoundingBoxAscent * 0.3) / REF,
    };
    metricCache.set(key, m);
  }
  return m;
}

// Side bearings of the first and last glyph, in em, so ink can sit flush
// with the inscription edges instead of the glyph advance boxes.
function bearings(font, text) {
  if (!text) return { lsb: 0, rsb: 0 };
  const first = canvasMetrics(font, text[0]);
  const last = canvasMetrics(font, text[text.length - 1]);
  return { lsb: -first.left, rsb: last.width - last.right };
}

// ---------------------------------------------------------------- engine

export class Inscription {
  constructor(root, { registry = [], onReport = null } = {}) {
    this.root = root;
    this.registry = registry;
    this.onReport = onReport;
    this.debug = false;
    this.version = 0;
    this.lastWidth = 0;
    root.classList.add('inscription');
    this.ro = new ResizeObserver(() => {
      if (this.root.clientWidth !== this.lastWidth) this.scheduleFit();
    });
    this.ro.observe(root);
    this.onFonts = () => this.scheduleFit(true);
    document.fonts.addEventListener('loadingdone', this.onFonts);
  }

  destroy() {
    this.ro.disconnect();
    document.fonts.removeEventListener('loadingdone', this.onFonts);
    cancelAnimationFrame(this.raf);
  }

  setDebug(on) {
    this.debug = on;
    this.root.classList.toggle('insc-debug', on);
    this.fit();
  }

  async setConfig(config) {
    const version = ++this.version;
    this.config = config;
    this.g = resolveGlobal(config.global);
    this.render();
    const faces = new Map();
    for (const m of this.model) faces.set(`${m.s.font}|${m.s.fontWeight}`, m);
    await Promise.all([...faces.values()].map((m) => ensureFont(m.entry, m.s.fontWeight)));
    if (version !== this.version) return;
    metricCache.clear();
    this.fit();
  }

  scheduleFit(clearMetrics = false) {
    if (clearMetrics) metricCache.clear();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.fit());
  }

  render() {
    const { root, g } = this;
    root.replaceChildren();
    root.style.maxWidth = `${g.maxWidth}px`;
    root.style.setProperty('--dot-scale', g.dot.scale);
    root.style.setProperty('--dot-shift', g.dot.shift);
    root.style.setProperty('--dot-space', g.dot.space);
    let nav = null;
    this.model = (this.config.rows || []).map((row, index) => {
      const s = resolveRow(row, g);
      const entry = findFont(this.registry, s.font);
      const tokens = tokenize(row);
      const tag = ELEMENTS.has(row.element) ? row.element : 'p';
      const el = document.createElement(tag);
      el.className = 'insc-row';
      el.dataset.row = index;
      const hasLinks = tokens.some((t) => t.link);
      // Consecutive link rows share one navigation landmark.
      if (hasLinks && !tag.startsWith('h')) {
        if (!nav) {
          nav = document.createElement('nav');
          nav.className = 'insc-nav';
          nav.setAttribute('aria-label', g.navLabel);
          root.append(nav);
        }
        nav.append(el);
      } else {
        nav = null;
        root.append(el);
      }
      const m = {
        index, row, s, entry, tokens, el, hasLinks,
        fontCss: `${s.fontWeight} ${REF}px ${familyStack(entry)}`,
        srText: row.label || (row.items || []).map((i) => i.label || wordsOf(i).join(' ')).filter(Boolean).join(', '),
      };
      this.arrange(m, [tokens]);
      return m;
    });
  }

  arrange(m, groups) {
    const { el, s, entry, hasLinks } = m;
    el.replaceChildren();
    if (!hasLinks && m.srText) el.append(sr(m.srText));
    m.lines = groups.filter((t) => t.length).map((tokens) => {
      const box = document.createElement('span');
      box.className = 'insc-linebox';
      const line = document.createElement('span');
      line.className = 'insc-line';
      if (!hasLinks) line.setAttribute('aria-hidden', 'true');
      Object.assign(line.style, {
        fontFamily: familyStack(entry),
        fontWeight: s.fontWeight,
        letterSpacing: `${s.letterSpacing}em`,
        lineHeight: s.lineHeight,
      });
      line.style.setProperty('--ls', s.letterSpacing);
      tokens.forEach((t, i) => {
        if (i) line.append(dot(this.g.dot.char, 'insc-sep'));
        line.append(this.tokenEl(t, hasLinks));
      });
      box.append(line);
      el.append(box);
      return { box, line, tokens, text: displayText(tokens, this.g.dot.char) };
    });
    m.key = groups.map((t) => t.length).join(',');
  }

  tokenEl(t, perTokenLabels) {
    const g = document.createElement('span');
    g.className = 'insc-tok';
    const numeral = [];
    if (t.numeral) {
      const n = document.createElement('span');
      n.className = 'insc-num';
      n.setAttribute('aria-hidden', 'true');
      n.textContent = t.numeral;
      numeral.push(n, dot(this.g.dot.char));
    }
    const shown = document.createElement('span');
    shown.setAttribute('aria-hidden', 'true');
    t.words.forEach((w, i) => {
      if (i) shown.append(dot(this.g.dot.char));
      shown.append(w);
    });
    if (t.link) {
      const a = document.createElement('a');
      a.href = t.item.href;
      if (t.item.newTab) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      // Numeral sits inside the link so the hover underline spans the whole
      // entry; it stays aria-hidden, so the link is still announced by label.
      a.append(sr(t.label), ...numeral, shown);
      g.append(a);
    } else {
      if (perTokenLabels && t.label) g.append(sr(t.label));
      g.append(...numeral, shown);
    }
    return g;
  }

  // ------------------------------------------------------------ fitting

  measure(models) {
    for (const m of models) {
      for (const L of m.lines) {
        L.line.style.fontSize = `${REF}px`;
        L.line.style.margin = '0';
        L.line.style.transform = '';
      }
    }
    for (const m of models) {
      for (const L of m.lines) {
        L.w = L.line.getBoundingClientRect().width / REF;
        L.tokW = [...L.line.querySelectorAll(':scope > .insc-tok')].map((e) => e.getBoundingClientRect().width / REF);
        const sep = L.line.querySelector(':scope > .insc-sep');
        if (sep) m.sepW = sep.getBoundingClientRect().width / REF;
      }
    }
  }

  // Width per px of font size, after removing trailing tracking and (if
  // enabled) the outer side bearings.
  unit(m, w, text) {
    const b = this.g.opticalEdges ? bearings(m.fontCss, text) : { lsb: 0, rsb: 0 };
    return { u: Math.max(0.01, w - m.s.letterSpacing - b.lsb - b.rsb), ...b };
  }

  // `final` caps a fixed size that would overflow the inscription (after
  // wrapping has been tried), so a manual enlargement never breaks narrow screens.
  solve(s, u, W, final = false) {
    const target = (W * s.width) / 100;
    let F;
    let status;
    let capped = false;
    if (s.fit === 'fixed') {
      F = s.fontSize;
      status = 'fixed';
      if (final && F * u > W + 0.5) {
        F = Math.max(s.min, W / u);
        capped = true;
      }
    } else {
      const exact = target / u;
      F = clamp(exact, s.min, s.max);
      status = exact < s.min - 0.01 ? 'min' : exact > s.max + 0.01 ? 'max' : 'fit';
    }
    const actual = F * u;
    const overflow = actual > W + 0.5;
    return { F, status, target, actual, overflow, capped, needsWrap: s.fit === 'fixed' ? overflow : status === 'min' };
  }

  // Choose line breaks between tokens [from, to). Fewest lines that keep
  // every line at or above its minimum size; among those, the most even.
  partition(m, from, to, W) {
    const { s } = m;
    const n = to - from;
    const tw = m.lines[0].tokW;
    const lineU = (i, j) => {
      let w = (j - i - 1) * (m.sepW || 0);
      for (let k = i; k < j; k++) w += tw[k];
      return this.unit(m, w, displayText(m.tokens.slice(i, j), this.g.dot.char)).u;
    };
    const target = (W * s.width) / 100;
    const score = (u) => (s.fit === 'fixed' ? (s.fontSize * u <= W + 0.5 ? -u : -Infinity) : target / u);
    const ok = (sc) => (s.fit === 'fixed' ? sc > -Infinity : sc >= s.min - 0.01);
    if (n <= 14) {
      for (let k = 2; k <= n; k++) {
        let best = null;
        let bestScore = -Infinity;
        for (let mask = 0; mask < 1 << (n - 1); mask++) {
          if (popcount(mask) !== k - 1) continue;
          let start = from;
          let worst = Infinity;
          const groups = [];
          for (let b = 0; b < n; b++) {
            if (b === n - 1 || mask & (1 << b)) {
              const end = from + b + 1;
              worst = Math.min(worst, score(lineU(start, end)));
              groups.push([start, end]);
              start = end;
            }
          }
          if (ok(worst) && worst > bestScore) {
            bestScore = worst;
            best = groups;
          }
        }
        if (best) return best;
      }
    } else {
      // Greedy fallback for very long rows.
      const groups = [];
      let start = from;
      for (let j = from + 1; j <= to; j++) {
        if (j > start + 1 && !ok(score(lineU(start, j)))) {
          groups.push([start, j - 1]);
          start = j - 1;
        }
      }
      groups.push([start, to]);
      return groups;
    }
    return Array.from({ length: n }, (_, i) => [from + i, from + i + 1]);
  }

  wrapGroups(m, W) {
    const n = m.tokens.length;
    const breaks = [...new Set(m.s.breaks)].filter((b) => b > 0 && b < n).sort((a, b) => a - b);
    if (!breaks.length) return { mode: 'auto', ranges: this.partition(m, 0, n, W) };
    const ranges = [];
    let start = 0;
    for (const b of [...breaks, n]) {
      ranges.push([start, b]);
      start = b;
    }
    // A configured line that still cannot fit is split again automatically.
    const tw = m.lines[0].tokW;
    const out = [];
    for (const [i, j] of ranges) {
      let w = (j - i - 1) * (m.sepW || 0);
      for (let k = i; k < j; k++) w += tw[k];
      const { u } = this.unit(m, w, displayText(m.tokens.slice(i, j), this.g.dot.char));
      if (j - i > 1 && this.solve(m.s, u, W).needsWrap) out.push(...this.partition(m, i, j, W));
      else out.push([i, j]);
    }
    return { mode: 'mobile', ranges: out };
  }

  fit() {
    const { root, g } = this;
    if (!this.model) return;
    const W = root.clientWidth;
    this.lastWidth = W;
    if (W <= 0) return;

    // Pass 1: every row as a single line.
    for (const m of this.model) {
      if (m.key !== String(m.tokens.length)) this.arrange(m, [m.tokens]);
      m.mode = null;
    }
    this.measure(this.model);

    // Pass 2: rows that cannot fit on one line wrap between tokens.
    const rewrapped = [];
    for (const m of this.model) {
      const L = m.lines[0];
      if (!L || m.tokens.length < 2) continue;
      const { u } = this.unit(m, L.w, L.text);
      if (!this.solve(m.s, u, W).needsWrap) continue;
      const { mode, ranges } = this.wrapGroups(m, W);
      this.arrange(m, ranges.map(([i, j]) => m.tokens.slice(i, j)));
      m.mode = mode;
      rewrapped.push(m);
    }
    if (rewrapped.length) this.measure(rewrapped);

    // Pass 3: write sizes, then stack lines with collision guards.
    const flat = [];
    for (const m of this.model) {
      m.lines.forEach((L, li) => {
        const { u, lsb, rsb } = this.unit(m, L.w, L.text);
        const r = this.solve(m.s, u, W, true);
        const { s } = m;
        let sx = 1;
        if (s.stretch && r.actual < r.target - 0.5) sx = Math.min(r.target / r.actual, g.stretchLimit);
        const opt = g.opticalEdges;
        Object.assign(L.line.style, {
          fontSize: `${r.F}px`,
          marginLeft: `${opt ? -lsb : 0}em`,
          marginRight: `${-(s.letterSpacing + (opt ? rsb : 0))}em`,
          transform: s.offsetX || s.offsetY || sx !== 1
            ? `translate(${s.offsetX}px, ${s.offsetY}px)${sx !== 1 ? ` scaleX(${sx})` : ''}`
            : '',
          transformOrigin: s.align,
        });
        L.box.style.justifyContent = JUSTIFY[s.align];
        const vm = canvasMetrics(m.fontCss, L.text);
        const h = s.lineHeight * r.F;
        const base = (h - (vm.fontAscent + vm.fontDescent) * r.F) / 2 + vm.fontAscent * r.F;
        flat.push({
          m, L, r, sx, h, first: li === 0, last: li === m.lines.length - 1,
          inkTop: base - vm.ascent * r.F,
          inkBottom: base + vm.descent * r.F,
        });
      });
    }

    const pct = W / 100;
    let prev = null;
    for (const f of flat) {
      const { s } = f.m;
      let gap = !prev ? s.spaceBefore * pct
        : f.first ? (g.rowGap + prev.m.s.spaceAfter + s.spaceBefore) * pct
        : g.rowGap * pct;
      f.guard = 0;
      if (prev && !s.allowOverlap && !prev.m.s.allowOverlap) {
        const clear = g.clearance * Math.min(prev.r.F, f.r.F);
        const need = clear - (prev.h - prev.inkBottom) - f.inkTop - (s.offsetY - prev.m.s.offsetY);
        if (gap < need) {
          f.guard = need - gap;
          gap = need;
        }
      }
      f.L.box.style.marginTop = `${gap}px`;
      f.L.box.style.marginBottom = f === flat[flat.length - 1] ? `${s.spaceAfter * pct}px` : '0';
      prev = f;
    }

    this.drawDebug(flat, W);
    root.classList.add('insc-ready');

    this.report = {
      width: W,
      rows: this.model.map((m) => ({
        index: m.index,
        mode: m.mode,
        lines: flat.filter((f) => f.m === m).map((f) => ({
          fontSize: f.r.F,
          status: f.r.status,
          target: f.r.target,
          actual: f.r.actual * f.sx,
          overflow: f.r.overflow,
          capped: f.r.capped,
          guard: f.guard,
          stretch: f.sx,
        })),
      })),
    };
    this.onReport?.(this.report);
  }

  drawDebug(flat, W) {
    this.root.querySelectorAll('.insc-dbg').forEach((e) => e.remove());
    if (!this.debug) return;
    for (const f of flat) {
      const { s } = f.m;
      const left = s.align === 'left' ? 0 : s.align === 'right' ? W - f.r.target : (W - f.r.target) / 2;
      const target = div('insc-dbg insc-dbg-target');
      Object.assign(target.style, { left: `${left}px`, width: `${f.r.target}px` });
      const ink = div('insc-dbg insc-dbg-ink');
      Object.assign(ink.style, { top: `${f.inkTop + s.offsetY}px`, height: `${f.inkBottom - f.inkTop}px` });
      const flags = [
        f.r.status === 'min' ? 'MIN' : f.r.status === 'max' ? 'MAX' : f.r.status === 'fixed' ? 'FIXED' : 'fit',
        f.m.mode && `wrap:${f.m.mode}`,
        f.r.capped && 'CAPPED',
        f.r.overflow && 'OVERFLOW',
        f.guard > 0.5 && `guard+${f.guard.toFixed(0)}`,
        f.sx !== 1 && `scaleX ${f.sx.toFixed(2)}`,
      ].filter(Boolean);
      const label = div('insc-dbg insc-dbg-label');
      label.textContent = `${f.r.F.toFixed(1)}px · ${Math.round(f.r.actual * f.sx)}/${Math.round(f.r.target)} · ${flags.join(' ')}`;
      if (f.r.status === 'min' || f.r.status === 'max' || f.r.overflow || f.r.capped) label.classList.add('is-limited');
      f.L.box.append(target, ink, label);
    }
  }
}

function popcount(x) {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
}

function dot(char, extra) {
  const d = document.createElement('span');
  d.className = extra ? `insc-dot ${extra}` : 'insc-dot';
  d.setAttribute('aria-hidden', 'true');
  d.textContent = char || DOT;
  return d;
}

function sr(text) {
  const s = document.createElement('span');
  s.className = 'insc-sr';
  s.textContent = text;
  return s;
}

function div(cls) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
