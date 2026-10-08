// Inner pages: when the current menu line scrolls up to the top of the
// window, a copy of it is pinned there while the rest of the menu scrolls
// away. Clicking the pinned page title scrolls back to the top instead of
// reloading. The copy is decorative (aria-hidden); the real menu stays in
// the page for keyboard and screen-reader users.

const row = document.querySelector('.inscription .row--current');

if (row) {
  const bar = document.createElement('div');
  bar.className = 'stuck-bar';
  bar.setAttribute('aria-hidden', 'true');
  const inner = document.createElement('div');
  inner.className = 'stuck-bar-inner';
  const copy = row.cloneNode(true);
  copy.style.marginTop = '0';
  copy.querySelectorAll('.sr').forEach((el) => el.remove());
  copy.querySelectorAll('a').forEach((a) => { a.tabIndex = -1; });
  copy.querySelector('a[aria-current="page"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  });
  inner.append(copy);
  bar.append(inner);
  document.body.append(bar);

  const update = () => {
    document.body.classList.toggle('is-stuck', row.getBoundingClientRect().top <= 0);
  };

  // Mirror the fitted size and edge trims of the original line.
  const sync = () => {
    const src = row.querySelectorAll('.line');
    copy.querySelectorAll('.line').forEach((line, i) => { line.style.cssText = src[i].style.cssText; });
    const links = row.querySelectorAll('a');
    copy.querySelectorAll('a').forEach((a, i) => { a.style.setProperty('--base', links[i].style.getPropertyValue('--base')); });
    update();
  };

  document.querySelector('.inscription').addEventListener('fit', sync);
  addEventListener('scroll', update, { passive: true });
  if (document.querySelector('.inscription.is-fit')) sync();
}
