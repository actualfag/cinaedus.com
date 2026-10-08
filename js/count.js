// RESEARCH·DESIGN·INNOVATION is gradually overwritten by the visit number in
// Roman numerals, ending at the final N: visit 18 = RESEARCH·DESIGN·INNOV XVIII.
//
// The phrase never changes shape: the replaced letters stay in the line,
// invisible (so the fit and every remaining letter keep their exact
// positions), and the numeral is laid over the space they occupied, its
// spacing set so its ink runs from the first replaced letter's ink to the
// final N's. Hover or tap INNOVATION (or the numeral) for "Page views: N".
//
// PREVIEW: the count is this browser's own page views (localStorage). A
// site-wide total would come from a small server counter instead; only
// visitNumber() would change.
//
// Testing: ?visit=1888 shows that number (without counting);
//          ?reset-visits starts the count over.

// Block scope: scripts share one global scope, so keep names private.
{
  const KEY = 'cinaedus.count';
  const header = document.querySelector('.inscription');
  const row = header.querySelector('.row--tagline');
  const line = row?.querySelector('.line');
  const params = new URLSearchParams(location.search);
  const ctx = document.createElement('canvas').getContext('2d');

  // Roman numerals as display units; over 3,999 the thousands get an
  // overline (vinculum, ×1000), a combining mark carried by its character.
  const NUMERALS = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  function roman(n) {
    let out = '';
    for (const [value, symbol] of NUMERALS) {
      while (n >= value) {
        out += symbol;
        n -= value;
      }
    }
    return out;
  }
  function romanUnits(n) {
    if (n < 4000) return [...roman(n)];
    return [...[...roman(Math.floor(n / 1000))].map((c) => `${c}̅`), ...roman(n % 1000)];
  }

  function read() {
    try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; }
  }
  function write(n) {
    try { localStorage.setItem(KEY, String(n)); } catch { /* storage unavailable */ }
  }
  if (params.has('reset-visits')) write(0);

  const preview = parseInt(params.get('visit'), 10);
  function visitNumber() {
    if (preview > 0) return preview;
    const n = read() + 1;
    write(n);
    return n;
  }

  if (line) {
    const phrase = [...line.textContent.trim()]; // RESEARCH·DESIGN·INNOVATION
    const srLabel = row.querySelector('.sr');
    const baseLabel = srLabel?.textContent || '';

    // "Page views: N" follows the pointer over INNOVATION / the numeral.
    const tip = document.createElement('span');
    tip.className = 'views-tip';
    tip.setAttribute('aria-hidden', 'true'); // the count is in the row's screen-reader label
    document.body.append(tip);
    // Where INNOVATION starts (after the last dot): the hover area.
    const lastWord = phrase.lastIndexOf('·') + 1;

    const appendUnits = (parent, units) => {
      units.forEach((unit) => {
        if (unit === '·') {
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.textContent = '·';
          parent.append(dot);
        } else {
          parent.append(unit);
        }
      });
    };

    let numeralUnits = [];

    function show(n) {
      numeralUnits = n > 1 ? romanUnits(n) : [];
      const keep = Math.max(0, phrase.length - numeralUnits.length);
      const zoneStart = Math.min(lastWord, keep);
      line.replaceChildren();
      appendUnits(line, phrase.slice(0, zoneStart));
      const zone = document.createElement('span');
      zone.className = 'views-zone';
      appendUnits(zone, phrase.slice(zoneStart, keep));
      line.append(zone);
      if (numeralUnits.length) {
        const slot = document.createElement('span');
        slot.className = 'numeral-slot';
        const ghost = document.createElement('span');
        ghost.className = 'numeral-ghost';
        appendUnits(ghost, phrase.slice(keep));
        const numeral = document.createElement('span');
        numeral.className = 'numeral';
        numeral.textContent = numeralUnits.join('');
        slot.append(ghost, numeral);
        zone.append(slot);
      }
      const views = n.toLocaleString('en-US');
      tip.textContent = `Page views: ${views}`;
      if (srLabel) srLabel.textContent = `${baseLabel}. Page views: ${views}`;
      place();
    }

    const bearings = (ch) => {
      const m = ctx.measureText(ch);
      return { width: m.width, left: -m.actualBoundingBoxLeft, right: m.width - m.actualBoundingBoxRight };
    };
    const baselineOf = (el) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0';
      el.append(probe);
      const y = probe.getBoundingClientRect().bottom;
      probe.remove();
      return y;
    };

    // Position the numeral over the vacated letters (after every fit).
    function place() {
      const slot = line.querySelector('.numeral-slot');
      if (!slot || !header.classList.contains('is-fit')) return;
      const ghost = slot.querySelector('.numeral-ghost');
      const numeral = slot.querySelector('.numeral');
      const style = getComputedStyle(line);
      const size = parseFloat(style.fontSize);
      const ls = parseFloat(style.letterSpacing) || 0;
      ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;

      // Ink span of the replaced letters, relative to the slot's left edge.
      const replaced = [...ghost.textContent];
      const first = bearings(replaced[0]);
      const last = bearings(replaced[replaced.length - 1]);
      const span = ghost.getBoundingClientRect().width;
      const x0 = first.left;
      const x1 = span - ls - last.right;

      // Spread the numeral so its ink fills exactly [x0, x1].
      const units = numeralUnits.map(bearings);
      const natural = units.reduce((sum, u) => sum + u.width, 0);
      const k = units.length;
      let offset;
      let spacing = 0;
      let scale = 1;
      if (k === 1) {
        offset = x1 - (units[0].width - units[0].right); // single character: right-aligned
      } else {
        offset = x0 - units[0].left;
        spacing = (x1 - offset - natural + units[k - 1].right) / (k - 1);
        if (spacing < 0) {
          // Doesn't fit even with no spacing: narrow it slightly instead.
          spacing = 0;
          scale = (x1 - x0) / (natural - units[0].left - units[k - 1].right);
          offset = x0 - units[0].left * scale;
        }
      }
      Object.assign(numeral.style, {
        left: `${offset}px`,
        top: '0px',
        letterSpacing: `${spacing}px`,
        transform: scale === 1 ? '' : `scaleX(${scale})`,
      });
      // Line the numeral's baseline up with the phrase's.
      numeral.style.top = `${baselineOf(ghost) - baselineOf(numeral)}px`;
    }

    // Show the tip at the pointer while it's over the zone (mouse), or where
    // the zone is tapped (touch; tapping anywhere else hides it).
    const inZone = (target) => !!target.closest?.('.views-zone');
    function showTipAt(x, y) {
      tip.classList.add('is-visible');
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let left = x + 12;
      let top = y + 16;
      if (left + w > innerWidth - 4) left = x - 12 - w; // flip near the right edge
      if (top + h > innerHeight - 4) top = y - 12 - h;  // and near the bottom
      tip.style.left = `${Math.max(4, left)}px`;
      tip.style.top = `${Math.max(4, top)}px`;
    }
    const hideTip = () => tip.classList.remove('is-visible');
    line.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        if (inZone(e.target)) showTipAt(e.clientX, e.clientY);
        else hideTip();
      }
    });
    line.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (inZone(e.target)) showTipAt(e.clientX, e.clientY);
      else hideTip();
    });
    addEventListener('scroll', hideTip, { passive: true });

    header.addEventListener('fit', place);
    show(visitNumber());
    document.addEventListener('pagechange', () => show(visitNumber())); // nav.js
  }
}
