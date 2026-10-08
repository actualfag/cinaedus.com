// Sizes every .line so it spans the full width of .inscription.
// Measures the real rendered text at 100px, then scales to fit; also trims
// the side bearings of the first and last letters so ink sits flush with
// the edges. Content lives in index.html — this file needs no editing.

const MIN = 9;   // px; below this a line wraps instead of shrinking
const MAX = 400; // px
const REF = 100;
// Every link underline uses the thickness this line's underline would have
// (3.5% of its font size), so underlines are the same weight everywhere.
const RULE_LINE = '.row--capabilities .line';
const RULE_RATIO = 0.035;

const root = document.querySelector('.inscription');
const lines = [...root.querySelectorAll('.line')];
const ctx = document.createElement('canvas').getContext('2d');

// Visible text only (skips screen-reader labels).
function visibleText(line) {
  let text = '';
  const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    if (!walk.currentNode.parentElement.closest('.sr')) text += walk.currentNode.textContent;
  }
  return text.trim();
}

// Space before the first letter's ink and after the last, in em.
function bearings(line, style) {
  const text = visibleText(line);
  if (!text) return { left: 0, right: 0 };
  ctx.font = `${style.fontWeight} ${REF}px ${style.fontFamily}`;
  const first = ctx.measureText(text[0]);
  const last = ctx.measureText(text[text.length - 1]);
  return {
    left: -first.actualBoundingBoxLeft / REF,
    right: (last.width - last.actualBoundingBoxRight) / REF,
  };
}

let lastWidth = 0;

function fit() {
  const width = root.clientWidth;
  lastWidth = width;
  if (!width) return;

  for (const line of lines) {
    line.classList.remove('is-wrapped');
    line.style.fontSize = `${REF}px`;
    line.style.margin = '0';
  }

  const measured = lines.map((line) => {
    const style = getComputedStyle(line);
    return {
      line,
      w: line.getBoundingClientRect().width / REF,
      ls: parseFloat(style.letterSpacing) / REF || 0,
      b: bearings(line, style),
    };
  });

  for (const { line, w, ls, b } of measured) {
    const units = Math.max(0.01, w - ls - b.left - b.right);
    let size = Math.min(MAX, width / units);
    if (size < MIN) {
      line.classList.add('is-wrapped');
      line.style.fontSize = `${MIN}px`;
      continue;
    }
    line.style.fontSize = `${size}px`;
    line.style.marginLeft = `${-b.left}em`;
    line.style.marginRight = `${-(ls + b.right)}em`;
  }

  // Underline thickness and its gap below the letters both come from the
  // reference line, then apply to every link (CSS: --rule, --gap, --ascent).
  const ruleLine = root.querySelector(RULE_LINE);
  if (ruleLine) {
    const size = parseFloat(ruleLine.style.fontSize);
    const style = getComputedStyle(ruleLine);
    ctx.font = `${style.fontWeight} ${REF}px ${style.fontFamily}`;
    const m = ctx.measureText('H');
    const ascent = m.fontBoundingBoxAscent / REF;
    const descent = m.fontBoundingBoxDescent / REF;
    const rule = Math.max(1, size * RULE_RATIO);
    // Matches the original placement on the reference line: underline bottom
    // 0.1em above the bottom of the text box.
    const gap = (descent - 0.1) * size - rule;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--rule', `${rule}px`);
    rootStyle.setProperty('--gap', `${gap}px`);
    rootStyle.setProperty('--ascent', ascent);

    // Exact baseline of each link (from its top), so the gap is identical
    // to the pixel on every line regardless of font-size rounding.
    for (const a of root.querySelectorAll('a')) {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0';
      a.append(probe);
      a.style.setProperty('--base', `${probe.getBoundingClientRect().bottom - a.getBoundingClientRect().top}px`);
      probe.remove();
    }
  }

  root.classList.add('is-fit');
  root.dispatchEvent(new Event('fit'));
}

// Don't measure until Forum is in (or 3s pass), otherwise sizes are computed
// from the fallback font. Then refit on resize and whenever fonts settle.
let started = false;
function start() {
  started = true;
  fit();
}

new ResizeObserver(() => {
  if (started && root.clientWidth !== lastWidth) requestAnimationFrame(fit);
}).observe(root);

Promise.race([
  document.fonts.load(`400 ${REF}px Forum`, 'CANAEDVS·').then(() => document.fonts.ready),
  new Promise((r) => setTimeout(r, 3000)),
]).then(start, start);
document.fonts.addEventListener('loadingdone', () => started && fit());
window.addEventListener('load', () => started && fit());
