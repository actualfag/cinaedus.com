// Remembers, in this browser only (localStorage, never sent anywhere), which
// menu links someone has used, for effects the browser's own :visited can't
// do:
//   - CINAEDVS turns purple only after it's clicked from another page
//     (just arriving on the homepage doesn't count).
//   - Menu items turn purple once their page has been opened (also via
//     normal :visited in CSS).
//   - RESEARCH·DESIGN·INNOVATION turns purple once every other menu link has
//     been used.
// Add ?reset-visits to any page's address to clear the record.

// Block scope: scripts share one global scope, so keep names private.
{
  const KEY = 'cinaedus.visits';
  const header = document.querySelector('.inscription');

  const read = () => {
    try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { return new Set(); }
  };
  const write = (set) => {
    try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* storage unavailable */ }
  };

  if (new URLSearchParams(location.search).has('reset-visits')) write(new Set());

  // One key per menu link: 'home' for CINAEDVS, the path for site pages,
  // the full address for external links (LinkedIn).
  const keyOf = (a) => {
    if (a.origin !== location.origin) return a.href;
    return a.pathname === '/' ? 'home' : a.pathname;
  };

  function record(key) {
    const seen = read();
    if (!seen.has(key)) {
      seen.add(key);
      write(seen);
    }
    paint();
  }

  function paint() {
    const seen = read();
    const links = [...header.querySelectorAll('a[href]')];
    for (const a of links) a.classList.toggle('is-visited', seen.has(keyOf(a)));
    const done = links.length > 0 && links.every((a) => seen.has(keyOf(a)));
    header.querySelector('.row--tagline')?.classList.toggle('is-complete', done);
    // Keep the pinned copy (sticky.js) in step.
    document.querySelectorAll('.stuck-bar a[href]').forEach((a) => a.classList.toggle('is-visited', seen.has(keyOf(a))));
  }

  // Opening a page counts as visiting it (homepage excluded: arriving there
  // isn't the same as clicking CINAEDVS).
  const recordPage = () => (location.pathname === '/' ? paint() : record(location.pathname));

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || !a.closest('.inscription, .stuck-bar')) return;
    const key = keyOf(a);
    if (key === 'home') {
      if (location.pathname !== '/') record('home'); // clicked from another page
    } else if (a.origin !== location.origin) {
      record(key); // external (LinkedIn): clicking is the only signal
    }
  });

  document.addEventListener('pagechange', recordPage); // nav.js swapped pages
  recordPage();
}
