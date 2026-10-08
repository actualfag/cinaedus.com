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

// The line's own text (skips screen-reader labels and the visit numeral,
// which is laid over the line and must not affect its fit; see count.js).
function visibleText(line) {
  let text = '';
  const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    if (!walk.currentNode.parentElement.closest('.sr, .numeral')) text += walk.currentNode.textContent;
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

// Size every line to `width`.
function fitLines(width) {
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
}

function fit() {
  // Start from the CSS maximum width (--max-width), then fit.
  root.style.maxWidth = '';
  let width = root.clientWidth;
  if (!width) return;
  fitLines(width);

  // Never taller than the window. Every line scales with the width, so the
  // menu's height is a fixed proportion of it: if it's too tall, shrink the
  // width by exactly that proportion and fit again.
  const body = getComputedStyle(document.body);
  const available = document.documentElement.clientHeight
    - parseFloat(body.paddingTop) - parseFloat(body.paddingBottom);
  const height = root.getBoundingClientRect().height;
  if (available > 0 && height > available) {
    root.style.maxWidth = `${Math.floor((width * available) / height)}px`;
    width = root.clientWidth;
    fitLines(width);
  }
  lastWidth = width;
  // Page content uses the same width as the menu (CSS: --menu-width).
  document.documentElement.style.setProperty('--menu-width', `${width}px`);

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

// Don't measure until the font is in (or 3s pass), otherwise sizes are computed
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
  document.fonts.load(`400 ${REF}px "Times New Roman"`, 'CINAEDVS·').then(() => document.fonts.ready),
  new Promise((r) => setTimeout(r, 3000)),
]).then(start, start);
document.fonts.addEventListener('loadingdone', () => started && fit());
window.addEventListener('load', () => started && fit());
// Window height changes don't resize .inscription, so watch the window too.
window.addEventListener('resize', () => started && requestAnimationFrame(fit));
