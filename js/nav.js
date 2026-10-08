// Moves between the site's pages without reloading: the menu stays in place
// and only <main class="page-body"> is swapped for the new page's content.
// The address bar, tab title and back/forward work as usual, and every page
// is still a complete HTML file, so direct links and no-JS visits work too.

// Block scope: scripts share one global scope, so keep names private.
{
  const header = document.querySelector('.inscription');
  const pages = new Map(); // pathname -> Promise<Document>
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  history.scrollRestoration = 'manual';

  function load(path) {
    if (!pages.has(path)) {
      pages.set(path, fetch(path)
        .then((res) => {
          if (!res.ok) throw new Error(`${path}: ${res.status}`);
          return res.text();
        })
        .then((html) => new DOMParser().parseFromString(html, 'text/html'))
        .catch((err) => {
          pages.delete(path);
          throw err;
        }));
    }
    return pages.get(path);
  }

  const isSiteLink = (a) => a && a.origin === location.origin && !a.target && !a.hasAttribute('download');

  // Underline the menu item for `path` (CINAEDVS is current on the homepage
  // but never underlined, since only nav rows get .row--current).
  function markCurrent(path) {
    header.querySelectorAll('a[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
    header.querySelectorAll('.row--current').forEach((row) => row.classList.remove('row--current'));
    for (const a of header.querySelectorAll('a')) {
      if (isSiteLink(a) && a.pathname === path) {
        a.setAttribute('aria-current', 'page');
        a.closest('nav .row')?.classList.add('row--current');
      }
    }
  }

  async function go(url, { push = true } = {}) {
    const target = new URL(url, location.href);
    let doc;
    try {
      doc = await load(target.pathname);
    } catch {
      location.href = target.href; // fall back to a normal page load
      return;
    }
    const next = doc.querySelector('main.page-body');
    const current = document.querySelector('main.page-body');
    if (!next || !current) {
      location.href = target.href;
      return;
    }

    current.replaceWith(next);
    document.title = doc.title;
    if (push) history.pushState(null, '', target.href);
    markCurrent(target.pathname);
    document.dispatchEvent(new Event('pagechange'));

    // If the menu had scrolled away, bring the new page in from the top.
    if (scrollY > header.offsetTop + header.offsetHeight) scrollTo(0, 0);

    // Screen readers: land on the new page's heading.
    const h1 = next.querySelector('h1');
    if (h1) {
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!isSiteLink(a)) return;
    if (a.pathname === location.pathname && a.hash) return; // in-page anchor
    e.preventDefault();
    if (a.pathname === location.pathname) {
      scrollTo({ top: 0, behavior: smooth() });
      return;
    }
    go(a.href);
  });

  addEventListener('popstate', () => go(location.href, { push: false }));

  // Start fetching a page as soon as the pointer or focus reaches its link,
  // so the swap is usually instant by the time it's clicked.
  for (const type of ['pointerover', 'focusin']) {
    document.addEventListener(type, (e) => {
      const a = e.target.closest?.('a[href]');
      if (isSiteLink(a) && a.pathname !== location.pathname) load(a.pathname).catch(() => {});
    });
  }
}
