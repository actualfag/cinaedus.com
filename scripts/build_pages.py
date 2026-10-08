#!/usr/bin/env python3
"""Copy the homepage menu into every inner page.

The menu lives in index.html. After changing it, run:

    python3 scripts/build_pages.py

Each page keeps its own content (everything inside <main class="page-body">);
only the head and the menu are rewritten. On each page its own menu item is
marked current (stays underlined, pins to the top when scrolling).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PAGES = {
    "contact": "Contact",
    "business-inquiries": "Business inquiries",
    "portfolio": "Portfolio",
    "capabilities": "Capabilities",
    "about": "About",
}

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{label} · Cinaedus</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Forum&display=swap">
  <link rel="stylesheet" href="/css/site.css">
  <script>document.documentElement.classList.add('js');</script>
  <script src="/js/fit.js" defer></script>
  <script src="/js/sticky.js" defer></script>
  <script src="/js/nav.js" defer></script>
  <script src="/js/count.js" defer></script>
</head>
<body>
  <!-- Menu copied from index.html by scripts/build_pages.py; edit it there. -->
  <header class="inscription">
{menu}
  </header>

  <main class="page-body">
    <h1 class="sr">{label}</h1>
{content}
  </main>
</body>
</html>
"""


def home_menu():
    home = (ROOT / "index.html").read_text()
    m = re.search(r'  <header class="inscription">\n(.*?)\n  </header>', home, re.S)
    if not m:
        raise SystemExit('index.html: could not find <header class="inscription">')
    return m.group(1)


def menu_for(slug, menu):
    # Only this page's own menu item is marked current (not CINAEDVS/home).
    menu = menu.replace(' aria-current="page"', "")
    href = f'href="/{slug}/"'
    if href not in menu:
        raise SystemExit(f"index.html has no link to /{slug}/")
    menu = menu.replace(href, f'{href} aria-current="page"', 1)
    i = menu.index(href)
    j = menu.rfind('<p class="row ', 0, i)
    return menu[:j] + menu[j:].replace('<p class="row ', '<p class="row row--current ', 1)


def existing_content(path):
    if not path.exists():
        return "    <p>Coming soon.</p>"
    m = re.search(r'<main class="page-body">\n(.*?)\n  </main>', path.read_text(), re.S)
    if not m:
        return "    <p>Coming soon.</p>"
    lines = [l for l in m.group(1).split("\n") if '<h1 class="sr">' not in l]
    return "\n".join(lines)


def main():
    menu = home_menu()
    for slug, label in PAGES.items():
        path = ROOT / slug / "index.html"
        path.parent.mkdir(exist_ok=True)
        content = existing_content(path)
        path.write_text(TEMPLATE.format(label=label, menu=menu_for(slug, menu), content=content))
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
