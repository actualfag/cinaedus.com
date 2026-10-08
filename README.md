# canaedus.com

An inscription-style homepage: rows of Roman capitals, each fitted to the
full width.

## The site

| File | What it is |
| --- | --- |
| `index.html` | The homepage. All text and links are here. |
| `contact/`, `business-inquiries/`, `portfolio/`, `capabilities/`, `about/` | One page each (`index.html` inside). Put content in its `<main class="page-body">`. |
| `css/site.css` | Colours, font, spacing, dots, link underline. Values at the top. |
| `js/fit.js` | Sizes each line to the full width. No need to edit. |
| `js/sticky.js` | Inner pages: pins the current menu line, inverted, when scrolling. |
| `scripts/build_pages.py` | Copies the menu from `index.html` into every inner page. |

**Changing the menu:** edit it in `index.html`, then run
`python3 scripts/build_pages.py`. Every inner page gets the new menu; each
page's own content (inside `<main class="page-body">`) is left alone. To add
a page, add its link to the menu and its slug to `PAGES` in the script.

To change text: edit `index.html`. Each row looks like

```html
<a href="#contact"><span class="sr">Contact</span><span aria-hidden="true">I<span class="dot">·</span>CONTACT</span></a>
```

`sr` is what screen readers hear; the `aria-hidden` part is what people see.

To change the look: edit the variables at the top of `css/site.css`.

Preview locally:

```bash
python3 -m http.server 8000
```

then open http://localhost:8000/.

**Deploy** `index.html`, the five page folders, `css/site.css` and `js/fit.js`.
Links use site-root paths (`/about/`), so serve the site from the domain root.

## Design sandbox (optional)

`dev/`, `js/inscription.js`, `js/fonts.js`, `css/inscription.css`,
`content/inscription.json`, `fonts/fonts.json` and `scripts/dev_server.py`
are the layout editor used to design the homepage. It no longer controls the
homepage. To try ideas in it, run `python3 scripts/dev_server.py` and open
http://localhost:8000/dev/, then copy anything you like into the files above.
