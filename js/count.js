// RESEARCH·DESIGN·INNOVATION is gradually overwritten by the visit number in
// Roman numerals, ending at the final N: visit 18 = RESEARCH·DESIGN·INNOV XVIII.
//
// The phrase never changes shape: the replaced letters stay in the line,
// invisible (so the fit and every remaining letter keep their exact
// positions), and the numeral is laid over the space they occupied, set
// with the phrase's own letter spacing and right-aligned to the final N's
// ink, so spare room shows as a gap before it. Hover or tap INNOVATION (or
// the numeral) for "Page views: N".
//
// The number is the site's total page views, kept in Supabase: each page
// view calls count_page_view(site), which adds one and returns the new
// total (the table itself is locked; that function is all visitors can
// use). Each site is counted separately. Off the live domains (e.g.
// localhost), or if Supabase can't be reached, it falls back to this
// browser's own count. The last total seen is shown instantly, then
// updated when the real one arrives.
//
// Every 7th load in this browser (its 1st, 8th, 15th…) shows the full
// phrase instead (CYCLE).
//
// Testing: ?visit=1888 shows that number (without counting);
//          ?reset-visits restarts this browser's own count.

// Block scope: scripts share one global scope, so keep names private.
{
  const KEY = 'cinaedus.count'; // this browser's own page views

  // Supabase counter. The publishable key is public by design: it can only
  // call count_page_view(), never read or edit the table.
  const SUPABASE_URL = 'https://hgkqsjuqjvpkgvztbeop.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_i_7uMZRzkCTM-mEvA9gYbA_maFojd05';
  const SITES = {
    'cinaedus.com': 'cinaedus.com',
    'www.cinaedus.com': 'cinaedus.com',
    'cl.cinaedus.com': 'cl.cinaedus.com',
  };
  const site = SITES[location.hostname]; // undefined locally: no remote count
  const TOTAL_KEY = `cinaedus.total.${site}`; // last total seen, for instant display
  // The numeral always matches the page-view total, except that every 7th
  // load in this browser shows the full phrase instead.
  const CYCLE = 7;
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

  function read(key = KEY) {
    try { return parseInt(localStorage.getItem(key), 10) || 0; } catch { return 0; }
  }
  function write(n, key = KEY) {
    try { localStorage.setItem(key, String(n)); } catch { /* storage unavailable */ }
  }
  if (params.has('reset-visits')) write(0);

  // Add one to the site total and return the new total, or null.
  async function countRemote() {
    if (!site) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/count_page_view`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_site: site }),
        keepalive: true,
      });
      if (!res.ok) return null;
      const total = Number(await res.json());
      return Number.isFinite(total) && total > 0 ? total : null;
    } catch {
      return null;
    }
  }

  const preview = parseInt(params.get('visit'), 10);

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

    function show(n, fullPhrase) {
      numeralUnits = fullPhrase ? [] : romanUnits(n);
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

      // Set the numeral as a group with the phrase's own letter spacing,
      // right-aligned so its ink ends where the final N's did; any spare
      // room is left as a gap before it. If it's too long for the vacated
      // space, tighten its spacing, and only as a last resort narrow it.
      const units = numeralUnits.map(bearings);
      // Measured as a whole so kerning between letter pairs is included,
      // as the browser renders it.
      const natural = ctx.measureText(numeralUnits.join('')).width;
      const k = units.length;
      const room = x1 - x0;
      const inkAt = (gap) => natural + (k - 1) * gap - units[0].left - units[k - 1].right;
      let spacing = ls;
      let scale = 1;
      if (k > 1 && inkAt(spacing) > room) spacing = Math.max(0, (room - inkAt(0)) / (k - 1));
      if (inkAt(spacing) > room) scale = room / inkAt(spacing);
      // Ink right edge = offset + (advance of the group - right bearing) × scale.
      const offset = x1 - (natural + (k - 1) * spacing - units[k - 1].right) * scale;
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

    // One page view: count it here and on the site total, show the result.
    let latest = 0; // ignore replies to earlier page views
    function visit() {
      if (preview > 0) {
        show(preview, preview % CYCLE === 1);
        return;
      }
      const own = read() + 1;
      write(own);
      const fullPhrase = own % CYCLE === 1; // this browser's 1st, 8th, 15th…
      const cached = read(TOTAL_KEY);
      const guess = site && cached ? cached + 1 : own;
      show(guess, fullPhrase);
      const id = ++latest;
      countRemote().then((total) => {
        if (!total || id !== latest) return;
        write(total, TOTAL_KEY);
        if (total !== guess) show(total, fullPhrase);
      });
    }

    header.addEventListener('fit', place);
    visit();
    document.addEventListener('pagechange', visit); // nav.js
  }
}
