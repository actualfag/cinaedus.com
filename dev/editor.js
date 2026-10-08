// Development-only inscription editor. Not linked from or loaded by the
// public homepage. Edits content/inscription.json through scripts/dev_server.py
// (or download/upload JSON when that server isn't running).

import {
  Inscription, applyPage, resolveGlobal, tokenize, displayText, wordsOf,
  GLOBAL_DEFAULTS, ROW_OVERRIDES,
} from '../js/inscription.js';
import { loadRegistry, findFont } from '../js/fonts.js';

const CONTENT_URL = '../content/inscription.json';
const FONTS_URL = '../fonts/fonts.json';
const DRAFT_KEY = 'canaedvs.editor.draft';
const PREFS_KEY = 'canaedvs.editor.prefs';
const PREVIEW_WIDTHS = ['full', 1440, 1024, 768, 390, 320];

const SPECIMEN_ROWS = [
  { items: [{ label: 'Canaedus', display: 'CANAEDVS' }] },
  { items: [{ label: 'Research' }, { label: 'Design' }, { label: 'Innovation' }] },
  { items: [{ label: 'Lincoln Neiger' }] },
  {
    items: [
      { numeral: 'I', label: 'Contact', href: '#' },
      { numeral: 'II', label: 'About', display: 'ABOVT', href: '#' },
      { numeral: 'III', label: 'LinkedIn', href: '#' },
    ],
  },
];

const state = {
  config: null,
  savedText: '',
  registry: [],
  server: false,
  report: null,
  prefs: { debug: false, specimen: false, previewWidth: 'full', open: [] },
};

const page = document.getElementById('page');
const frame = document.getElementById('frame');
const panel = document.getElementById('panel');
const auditionEl = document.getElementById('audition');
const preview = new Inscription(document.getElementById('inscription'), {
  onReport: (r) => {
    state.report = r;
    updateBadges();
    refresh(document.activeElement);
  },
});

// ---------------------------------------------------------------- helpers

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const isSet = (v) => v !== undefined && v !== null && v !== '';
const round = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  if (isSet(value)) o[keys.at(-1)] = value;
  else delete o[keys.at(-1)];
}
const uid = () => `row-${Math.random().toString(36).slice(2, 7)}`;

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable: editor still works, just no draft */ }
}
function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('is-error', isError);
  t.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('is-on'), 2600);
}

function normalize(config) {
  config.global = { ...structuredClone(GLOBAL_DEFAULTS), ...config.global };
  config.rows = Array.isArray(config.rows) ? config.rows : [];
  for (const row of config.rows) {
    row.id ||= uid();
    row.items = Array.isArray(row.items) ? row.items : [];
  }
  return config;
}

const G = () => resolveGlobal(state.config.global);

// ---------------------------------------------------------------- fields

// Every control registers a sync() so values and inherited placeholders stay
// current when something else changes (e.g. a global default).
const syncs = new Map();
function register(el, sync) {
  syncs.set(el, sync);
  sync();
  return el;
}
function refresh(source) {
  for (const [el, sync] of syncs) {
    if (!el.isConnected) syncs.delete(el);
    else if (!source || !el.contains(source)) sync();
  }
}

function fieldShell(label, unit, control, extra) {
  return h('label', { class: 'ed-field' },
    h('span', { class: 'ed-lbl' }, label, unit && h('i', {}, unit)),
    h('span', { class: 'ed-ctl' }, control, extra));
}

function numberField({ label, unit, min, max, step, get, set, inherited }) {
  const numEl = h('input', { type: 'number', step, class: 'ed-num' });
  const rng = h('input', { type: 'range', min, max, step, class: 'ed-rng', tabindex: '-1', 'aria-hidden': 'true' });
  const clear = inherited && h('button', {
    type: 'button', class: 'ed-clear', title: 'Inherit default', 'aria-label': `Reset ${label}`,
    onclick: () => { set(undefined); commit(); },
  }, '×');
  const wrap = fieldShell(label, unit, h('span', { class: 'ed-pair' }, rng, numEl), clear);
  numEl.addEventListener('input', () => {
    if (numEl.value === '' && !inherited) return;
    set(numEl.value === '' ? undefined : +numEl.value);
    commit(numEl);
  });
  rng.addEventListener('input', () => {
    numEl.value = rng.value;
    set(+rng.value);
    commit(rng);
  });
  return register(wrap, () => {
    const v = get();
    const inh = inherited?.();
    numEl.value = isSet(v) ? round(v) : '';
    numEl.placeholder = isSet(inh) ? String(round(inh)) : '';
    rng.value = isSet(v) ? v : isSet(inh) ? inh : min;
    wrap.classList.toggle('is-inherited', !!inherited && !isSet(v));
  });
}

function selectField({ label, options, get, set, inherited }) {
  const sel = h('select', { class: 'ed-sel' });
  const wrap = fieldShell(label, null, sel);
  sel.addEventListener('change', () => {
    set(sel.value === '' ? undefined : sel.value);
    commit(sel);
  });
  return register(wrap, () => {
    const opts = typeof options === 'function' ? options() : options;
    const inh = inherited?.();
    const list = inherited ? [{ value: '', label: `inherit (${inh})` }, ...opts] : opts;
    const sig = JSON.stringify(list);
    if (sel.dataset.sig !== sig) {
      sel.replaceChildren(...list.map((o) => h('option', { value: String(o.value) }, o.label)));
      sel.dataset.sig = sig;
    }
    const v = get();
    sel.value = isSet(v) ? String(v) : '';
    wrap.classList.toggle('is-inherited', !!inherited && !isSet(v));
  });
}

function checkField({ label, get, set, disabled }) {
  const box = h('input', { type: 'checkbox' });
  const wrap = h('label', { class: 'ed-field ed-check' }, box, h('span', { class: 'ed-lbl' }, label));
  box.addEventListener('change', () => {
    set(box.checked || undefined);
    commit(box);
  });
  return register(wrap, () => {
    box.checked = !!get();
    box.disabled = !!disabled?.();
    wrap.classList.toggle('is-disabled', box.disabled);
  });
}

function textField({ label, get, set, placeholder, wide }) {
  const input = h('input', { type: 'text', class: 'ed-text', spellcheck: 'false' });
  const wrap = fieldShell(label, null, input);
  if (wide) wrap.classList.add('ed-wide');
  input.addEventListener('input', () => {
    set(input.value);
    commit(input);
  });
  return register(wrap, () => {
    input.value = get() ?? '';
    input.placeholder = (typeof placeholder === 'function' ? placeholder() : placeholder) || '';
  });
}

function colorField({ label, get, set }) {
  const pick = h('input', { type: 'color', class: 'ed-color' });
  const text = h('input', { type: 'text', class: 'ed-text ed-hex', spellcheck: 'false' });
  const wrap = fieldShell(label, null, h('span', { class: 'ed-pair' }, pick, text));
  pick.addEventListener('input', () => { set(pick.value); text.value = pick.value; commit(pick); });
  text.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) { set(text.value); pick.value = text.value; commit(text); }
  });
  return register(wrap, () => {
    pick.value = get();
    text.value = get();
  });
}

const fontOptions = () => state.registry.map((f) => ({ value: f.id, label: f.name }));
const weightOptions = (fontId) => (findFont(state.registry, fontId).weights || [400]).map((w) => ({ value: w, label: String(w) }));

// ---------------------------------------------------------------- commit

function commit(source, { structural = false } = {}) {
  updatePreview();
  store(DRAFT_KEY, JSON.stringify(state.config));
  updateDirty();
  if (structural) buildRows();
  refresh(source);
}

function previewConfig() {
  if (!state.prefs.specimen) return state.config;
  return { ...state.config, rows: SPECIMEN_ROWS };
}

function updatePreview() {
  const cfg = previewConfig();
  applyPage(page, cfg);
  preview.setConfig(cfg);
}

function updateDirty() {
  const dirty = JSON.stringify(state.config) !== state.savedText;
  document.body.classList.toggle('is-dirty', dirty);
  const el = document.getElementById('ed-dirty');
  if (el) el.textContent = dirty ? 'Unsaved changes' : 'Saved';
}

function savePrefs() {
  store(PREFS_KEY, JSON.stringify(state.prefs));
}

// ---------------------------------------------------------------- panel

function buildPanel() {
  panel.replaceChildren(buildToolbar(), buildGlobal(), h('section', { class: 'ed-section', id: 'ed-rows' }));
  buildRows();
}

function buildToolbar() {
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const cfg = JSON.parse(await file.text());
        if (!Array.isArray(cfg.rows)) throw new Error('No rows array');
        state.config = normalize(cfg);
        commit(null, { structural: true });
        toast(`Loaded ${file.name}`);
      } catch (err) {
        toast(`Could not load: ${err.message}`, true);
      }
    },
  });
  const widthSel = h('select', {
    class: 'ed-sel',
    'aria-label': 'Preview width',
    onchange: () => {
      state.prefs.previewWidth = widthSel.value;
      savePrefs();
      applyFrame();
    },
  }, PREVIEW_WIDTHS.map((w) => h('option', { value: String(w) }, w === 'full' ? 'Full width' : `${w}px`)));
  widthSel.value = String(state.prefs.previewWidth);

  return h('header', { class: 'ed-toolbar' },
    h('div', { class: 'ed-title' },
      h('strong', {}, 'Inscription'),
      h('span', { id: 'ed-dirty', class: 'ed-dirty' }),
      h('span', { id: 'ed-summary', class: 'ed-summary' })),
    h('div', { class: 'ed-buttons' },
      h('button', { type: 'button', class: 'ed-btn ed-primary', onclick: save, title: '⌘S' },
        state.server ? 'Save' : 'Download JSON'),
      state.server && h('button', { type: 'button', class: 'ed-btn', onclick: () => download(serialize()) }, 'Export'),
      h('button', { type: 'button', class: 'ed-btn', onclick: () => fileInput.click() }, 'Load JSON'),
      h('button', { type: 'button', class: 'ed-btn', onclick: revert }, 'Revert'),
      fileInput),
    h('div', { class: 'ed-buttons' },
      widthSel,
      toggle('Debug', () => state.prefs.debug, (v) => { state.prefs.debug = v; preview.setDebug(v); }),
      toggle('Specimen', () => state.prefs.specimen, (v) => { state.prefs.specimen = v; updatePreview(); }),
      h('button', { type: 'button', class: 'ed-btn', onclick: openAudition }, 'Audition fonts')));
}

function toggle(label, get, set) {
  const box = h('input', { type: 'checkbox' });
  box.checked = get();
  box.addEventListener('change', () => {
    set(box.checked);
    savePrefs();
  });
  return register(h('label', { class: 'ed-toggle' }, box, label), () => { box.checked = get(); });
}

function globalNum(key, label, unit, min, max, step) {
  return numberField({
    label, unit, min, max, step,
    get: () => getPath(state.config.global, key) ?? getPath(GLOBAL_DEFAULTS, key),
    set: (v) => setPath(state.config.global, key, v),
  });
}

function group(title, ...fields) {
  return h('div', { class: 'ed-group' }, h('h3', {}, title), h('div', { class: 'ed-grid' }, fields));
}

function buildGlobal() {
  const g = state.config.global;
  return h('details', { class: 'ed-section', open: true },
    h('summary', {}, 'Global'),
    group('Type',
      selectField({
        label: 'Font',
        options: fontOptions,
        get: () => g.font,
        set: (v) => {
          g.font = v;
          const weights = findFont(state.registry, v).weights || [400];
          if (!weights.includes(+g.fontWeight)) g.fontWeight = weights.includes(400) ? 400 : weights[0];
        },
      }),
      selectField({ label: 'Weight', options: () => weightOptions(g.font), get: () => g.fontWeight, set: (v) => { g.fontWeight = +v; } }),
      globalNum('letterSpacing', 'Letter spacing', 'em', -0.1, 0.4, 0.005),
      globalNum('lineHeight', 'Line height', '×', 0.5, 2, 0.01),
      globalNum('minFontSize', 'Min size', 'px', 6, 80, 1),
      globalNum('maxFontSize', 'Max size', 'px', 20, 400, 1),
      checkField({ label: 'Optical edges (flush ink, not glyph boxes)', get: () => g.opticalEdges, set: (v) => { g.opticalEdges = !!v; } })),
    group('Dots',
      textField({ label: 'Glyph', get: () => g.dot?.char, set: (v) => setPath(g, 'dot.char', v || '·') }),
      globalNum('dot.scale', 'Scale', '×', 0.4, 2, 0.05),
      globalNum('dot.shift', 'Vertical shift', 'em', -0.4, 0.4, 0.01),
      globalNum('dot.space', 'Side space', 'em', -0.2, 0.3, 0.005)),
    group('Layout',
      globalNum('maxWidth', 'Max width', 'px', 200, 1600, 10),
      selectField({
        label: 'Page align',
        options: ['left', 'center', 'right'].map((v) => ({ value: v, label: v })),
        get: () => g.pageAlign,
        set: (v) => { g.pageAlign = v; },
      }),
      globalNum('topOffset', 'Top offset', 'vh', 0, 60, 0.5),
      globalNum('rowGap', 'Row gap', '% width', -5, 10, 0.05),
      globalNum('clearance', 'Collision clearance', 'em', 0, 0.5, 0.01),
      checkField({ label: 'Allow overlap everywhere', get: () => g.allowOverlap, set: (v) => { g.allowOverlap = !!v; } }),
      globalNum('padding.min', 'Page padding min', 'px', 0, 120, 1),
      globalNum('padding.fluid', 'Page padding fluid', '% page', 0, 20, 0.5),
      globalNum('padding.max', 'Page padding max', 'px', 0, 240, 1)),
    group('Color',
      colorField({ label: 'Background', get: () => g.background, set: (v) => { g.background = v; } }),
      colorField({ label: 'Text', get: () => g.color, set: (v) => { g.color = v; } })),
    group('Experimental',
      checkField({ label: 'Enable horizontal glyph stretching (per row)', get: () => g.experimentalStretch, set: (v) => { g.experimentalStretch = !!v; } }),
      globalNum('stretchLimit', 'Stretch limit', '×', 1, 2, 0.01)));
}

// ---------------------------------------------------------------- rows

function buildRows() {
  const host = document.getElementById('ed-rows');
  const rows = state.config.rows;
  host.replaceChildren(
    h('div', { class: 'ed-rows-head' },
      h('h2', {}, 'Rows'),
      h('button', { type: 'button', class: 'ed-btn', onclick: () => addRow(rows.length) }, '+ Row')),
    ...rows.map((row, i) => rowCard(row, i)),
  );
  updateBadges();
}

function addRow(at, row = { id: uid(), items: [{ label: 'New row' }] }) {
  state.config.rows.splice(at, 0, row);
  state.prefs.open = [...new Set([...state.prefs.open, row.id])];
  savePrefs();
  commit(null, { structural: true });
}

function moveRow(i, delta) {
  const rows = state.config.rows;
  const j = i + delta;
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  commit(null, { structural: true });
}

function rowCard(row, i) {
  const rows = state.config.rows;
  const isOpen = state.prefs.open.includes(row.id);
  const card = h('section', { class: `ed-row${isOpen ? ' is-open' : ''}`, 'data-row': i });
  const setOpen = (open) => {
    card.classList.toggle('is-open', open);
    const set = new Set(state.prefs.open);
    if (open) set.add(row.id); else set.delete(row.id);
    state.prefs.open = [...set];
    savePrefs();
  };
  const head = h('header', { class: 'ed-row-head' },
    h('button', {
      type: 'button', class: 'ed-row-toggle', 'aria-expanded': String(isOpen),
      onclick: (e) => {
        const open = !card.classList.contains('is-open');
        setOpen(open);
        e.currentTarget.setAttribute('aria-expanded', String(open));
      },
    },
    h('span', { class: 'ed-row-num' }, String(i + 1).padStart(2, '0')),
    h('span', { class: 'ed-row-text' })),
    h('span', { class: 'ed-badge' }),
    h('span', { class: 'ed-row-actions' },
      iconBtn('↑', 'Move up', () => moveRow(i, -1), i === 0),
      iconBtn('↓', 'Move down', () => moveRow(i, 1), i === rows.length - 1),
      iconBtn('⧉', 'Duplicate', () => addRow(i + 1, { ...structuredClone(row), id: uid() })),
      iconBtn('✕', 'Delete row', () => {
        if (!confirm(`Delete row ${i + 1}?`)) return;
        rows.splice(i, 1);
        commit(null, { structural: true });
      })));
  // Row preview text is registered separately so it updates as items change.
  const textEl = head.querySelector('.ed-row-text');
  register(textEl, () => { textEl.textContent = displayText(tokenize(row), G().dot.char) || '(empty)'; });

  card.append(head, h('div', { class: 'ed-row-body' },
    h('h4', {}, 'Content'),
    itemsEditor(row),
    h('div', { class: 'ed-grid' },
      selectField({
        label: 'Element',
        options: [{ value: 'p', label: 'paragraph' }, { value: 'h1', label: 'h1 heading' }, { value: 'h2', label: 'h2 heading' }],
        get: () => row.element || 'p',
        set: (v) => { if (v === 'p') delete row.element; else row.element = v; },
      }),
      textField({
        label: 'Screen-reader text', wide: true,
        get: () => row.label,
        set: (v) => { if (v) row.label = v; else delete row.label; },
        placeholder: () => (row.items || []).map((it) => it.label).filter(Boolean).join(', '),
      })),
    h('h4', {}, 'Layout', h('button', {
      type: 'button', class: 'ed-link',
      onclick: () => {
        for (const k of ROW_OVERRIDES) delete row[k];
        commit();
      },
    }, 'Reset row to inherited defaults')),
    overridesEditor(row, i),
    h('h4', {}, 'Narrow screens'),
    breaksEditor(row)));
  return card;
}

function iconBtn(label, title, onclick, disabled) {
  return h('button', { type: 'button', class: 'ed-icon', title, 'aria-label': title, onclick, disabled }, label);
}

function itemsEditor(row) {
  const list = h('div', { class: 'ed-items' });
  const rebuild = () => {
    list.replaceChildren(
      h('div', { class: 'ed-item ed-item-head', 'aria-hidden': 'true' },
        h('span', {}, 'No.'), h('span', {}, 'Label (readable)'), h('span', {}, 'Display'), h('span', {}, 'Link'), h('span', {})),
      ...row.items.map((item, k) => itemLine(row, item, k, rebuild)),
      h('div', { class: 'ed-item-add' },
        h('button', { type: 'button', class: 'ed-link', onclick: () => { row.items.push({ label: 'Text' }); rebuild(); commit(); } }, '+ text'),
        h('button', { type: 'button', class: 'ed-link', onclick: () => { row.items.push({ label: 'Link', href: '#' }); rebuild(); commit(); } }, '+ link')),
    );
  };
  rebuild();
  return list;
}

function itemLine(row, item, k, rebuild) {
  const input = (key, cls, ph, aria) => {
    const el = h('input', { type: 'text', class: `ed-text ${cls}`, spellcheck: 'false', 'aria-label': aria });
    el.addEventListener('input', () => {
      if (el.value) item[key] = el.value; else delete item[key];
      commit(el);
    });
    return register(el, () => {
      el.value = item[key] ?? '';
      el.placeholder = typeof ph === 'function' ? ph() : ph;
    });
  };
  const newTab = h('input', { type: 'checkbox', title: 'Open in new tab', 'aria-label': 'Open in new tab' });
  newTab.checked = !!item.newTab;
  newTab.addEventListener('change', () => {
    if (newTab.checked) item.newTab = true; else delete item.newTab;
    commit(newTab);
  });
  const move = (d) => {
    const j = k + d;
    if (j < 0 || j >= row.items.length) return;
    [row.items[k], row.items[j]] = [row.items[j], row.items[k]];
    rebuild();
    commit();
  };
  return h('div', { class: 'ed-item' },
    input('numeral', 'ed-numeral', '—', 'Numeral'),
    input('label', '', 'Readable label', 'Label'),
    input('display', '', () => wordsOf({ label: item.label }).join('·') || 'auto', 'Display spelling'),
    input('href', '', 'text only', 'Link URL'),
    h('span', { class: 'ed-item-actions' },
      h('label', { class: 'ed-newtab', title: 'Open in new tab' }, newTab, '↗'),
      iconBtn('↑', 'Move item up', () => move(-1), k === 0),
      iconBtn('↓', 'Move item down', () => move(1), k === row.items.length - 1),
      iconBtn('✕', 'Delete item', () => { row.items.splice(k, 1); rebuild(); commit(); })));
}

function overridesEditor(row, i) {
  const g = state.config.global;
  const rowNum = (key, label, unit, min, max, step, inheritedFn) => numberField({
    label, unit, min, max, step,
    get: () => row[key],
    set: (v) => { if (isSet(v)) row[key] = v; else delete row[key]; },
    inherited: inheritedFn,
  });
  const currentSize = () => {
    const line = state.report?.rows?.[i]?.lines?.[0];
    return line ? +line.fontSize.toFixed(1) : 48;
  };
  return h('div', { class: 'ed-grid' },
    selectField({
      label: 'Fit',
      options: [{ value: 'auto', label: 'automatic' }, { value: 'fixed', label: 'fixed size' }],
      get: () => row.fit || 'auto',
      set: (v) => {
        if (v === 'fixed') {
          row.fit = 'fixed';
          row.fontSize ??= currentSize();
        } else delete row.fit;
      },
    }),
    numberField({
      label: 'Fixed size', unit: 'px', min: 8, max: 300, step: 0.5,
      get: () => row.fontSize,
      set: (v) => {
        if (isSet(v)) { row.fontSize = v; row.fit = 'fixed'; } else { delete row.fontSize; delete row.fit; }
      },
      inherited: currentSize,
    }),
    rowNum('width', 'Target width', '%', 10, 100, 1, () => 100),
    selectField({
      label: 'Align',
      options: ['left', 'center', 'right'].map((v) => ({ value: v, label: v })),
      get: () => row.align,
      set: (v) => { if (v) row.align = v; else delete row.align; },
      inherited: () => 'center',
    }),
    selectField({
      label: 'Font',
      options: fontOptions,
      get: () => row.font,
      set: (v) => { if (v) row.font = v; else delete row.font; },
      inherited: () => findFont(state.registry, g.font).name,
    }),
    selectField({
      label: 'Weight',
      options: () => weightOptions(row.font || g.font),
      get: () => row.fontWeight,
      set: (v) => { if (v) row.fontWeight = +v; else delete row.fontWeight; },
      inherited: () => g.fontWeight,
    }),
    rowNum('letterSpacing', 'Letter spacing', 'em', -0.1, 0.4, 0.005, () => G().letterSpacing),
    rowNum('lineHeight', 'Line height', '×', 0.5, 2, 0.01, () => G().lineHeight),
    rowNum('minFontSize', 'Min size', 'px', 6, 80, 1, () => G().minFontSize),
    rowNum('maxFontSize', 'Max size', 'px', 20, 400, 1, () => G().maxFontSize),
    rowNum('spaceBefore', 'Space before', '% width', -10, 20, 0.05, () => 0),
    rowNum('spaceAfter', 'Space after', '% width', -10, 20, 0.05, () => 0),
    rowNum('offsetX', 'Offset X', 'px', -40, 40, 0.5, () => 0),
    rowNum('offsetY', 'Offset Y', 'px', -40, 40, 0.5, () => 0),
    checkField({ label: 'Allow overlap with neighbours', get: () => row.allowOverlap, set: (v) => { if (v) row.allowOverlap = true; else delete row.allowOverlap; } }),
    checkField({
      label: 'Stretch glyphs to fill (experimental)',
      get: () => row.stretch,
      set: (v) => { if (v) row.stretch = true; else delete row.stretch; },
      disabled: () => !g.experimentalStretch,
    }));
}

// Break toggles between wrap tokens. Used once the row hits its minimum size.
function breaksEditor(row) {
  const host = h('div', { class: 'ed-breaks' });
  const note = h('p', { class: 'ed-note' });
  const wrap = h('div', {}, host, note);
  return register(wrap, () => {
    const tokens = tokenize(row);
    const breaks = new Set(row.mobile?.breaks || []);
    const sig = JSON.stringify([tokens.map((t) => [t.numeral, ...t.words].join(' ')), [...breaks]]);
    if (host.dataset.sig === sig) return;
    host.dataset.sig = sig;
    const focusIdx = host.contains(document.activeElement) ? document.activeElement.dataset.b : null;
    const dotChar = G().dot.char;
    host.replaceChildren(...tokens.flatMap((t, b) => [
      b > 0 && h('button', {
        type: 'button',
        class: `ed-break${breaks.has(b) ? ' is-on' : ''}`,
        'data-b': b,
        'aria-pressed': String(breaks.has(b)),
        'aria-label': `Line break before ${t.words.join(' ')}`,
        title: breaks.has(b) ? 'Remove line break' : 'Break line here on narrow screens',
        onclick: () => {
          if (breaks.has(b)) breaks.delete(b); else breaks.add(b);
          const list = [...breaks].sort((x, y) => x - y);
          if (list.length) row.mobile = { breaks: list }; else delete row.mobile;
          commit();
        },
      }, breaks.has(b) ? '⏎' : dotChar),
      h('span', { class: 'ed-chip' }, [t.numeral, ...t.words].filter(Boolean).join(dotChar)),
    ].filter(Boolean)));
    if (focusIdx) host.querySelector(`[data-b="${focusIdx}"]`)?.focus();
    note.textContent = breaks.size
      ? 'Custom arrangement: applied when the row reaches its minimum size.'
      : 'No custom arrangement: wraps automatically between items when the row reaches its minimum size.';
  });
}

function updateBadges() {
  const report = state.report;
  if (!report || state.prefs.specimen) return;
  let limited = 0;
  document.querySelectorAll('.ed-row').forEach((card) => {
    const r = report.rows[+card.dataset.row];
    const badge = card.querySelector('.ed-badge');
    if (!r || !badge) return;
    const sizes = r.lines.map((l) => l.fontSize.toFixed(1)).join(' / ');
    const flags = new Set();
    for (const l of r.lines) {
      if (l.status === 'min') flags.add('min');
      if (l.status === 'max') flags.add('max');
      if (l.status === 'fixed') flags.add('fixed');
      if (l.capped) flags.add('capped');
      if (l.overflow) flags.add('overflow');
      if (l.guard > 0.5) flags.add('guard');
    }
    if (r.mode) flags.add(`${r.lines.length} lines`);
    const isLimited = flags.has('min') || flags.has('max') || flags.has('overflow') || flags.has('capped');
    if (isLimited) limited++;
    badge.textContent = `${sizes}px${flags.size ? ` · ${[...flags].join(' · ')}` : ''}`;
    badge.classList.toggle('is-limited', isLimited);
    badge.title = [
      flags.has('min') && 'Fit would need a size below the minimum; the minimum is kept, so the row is narrower or wraps.',
      flags.has('max') && 'Fit would need a size above the maximum; the maximum is kept, so the row is narrower than its target.',
      flags.has('capped') && 'Fixed size is wider than the inscription here, so it is reduced to fit (never below the minimum).',
      flags.has('overflow') && 'Row is wider than the inscription even at its minimum size.',
      flags.has('guard') && 'Spacing was increased to keep letters from colliding.',
    ].filter(Boolean).join('\n');
  });
  const summary = document.getElementById('ed-summary');
  if (summary) summary.textContent = limited ? `${limited} row${limited > 1 ? 's' : ''} limited by size rules` : '';
}

// ---------------------------------------------------------------- save / load

const serialize = () => `${JSON.stringify(state.config, null, 2)}\n`;

function download(text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'inscription.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function save() {
  const text = serialize();
  if (!state.server) {
    download(text);
    toast('Downloaded inscription.json — replace content/inscription.json with it.');
    return;
  }
  try {
    const res = await fetch('/__save', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text });
    if (!res.ok) throw new Error((await res.json()).error || res.status);
    state.savedText = JSON.stringify(state.config);
    store(DRAFT_KEY, null);
    updateDirty();
    toast('Saved content/inscription.json');
  } catch (err) {
    toast(`Save failed: ${err.message}`, true);
  }
}

function revert() {
  if (!confirm('Discard changes and reload the saved content?')) return;
  state.config = normalize(JSON.parse(state.savedText));
  store(DRAFT_KEY, null);
  commit(null, { structural: true });
}

// ---------------------------------------------------------------- audition

let auditionInstances = [];

function openAudition() {
  const g = state.config.global;
  const cards = state.registry.map((entry) => {
    const weights = entry.weights || [400];
    const weight = weights.includes(+g.fontWeight) ? +g.fontWeight : weights.reduce((a, b) => (Math.abs(b - g.fontWeight) < Math.abs(a - g.fontWeight) ? b : a));
    const root = h('div', { class: 'inscription' });
    const inst = new Inscription(root, { registry: state.registry });
    inst.setConfig({ global: { ...g, font: entry.id, fontWeight: weight, maxWidth: 100000 }, rows: SPECIMEN_ROWS });
    auditionInstances.push(inst);
    const choose = () => {
      g.font = entry.id;
      g.fontWeight = weight;
      commit();
      auditionEl.querySelectorAll('.ed-aud-card').forEach((c) => c.classList.toggle('is-active', c.dataset.font === entry.id));
    };
    return h('article', { class: `ed-aud-card${entry.id === g.font ? ' is-active' : ''}`, 'data-font': entry.id },
      h('header', {},
        h('div', {}, h('strong', {}, entry.name), h('span', { class: 'ed-aud-meta' }, `${weight}${entry.system ? ' · system' : entry.faces ? ' · local' : ''}`)),
        h('button', { type: 'button', class: 'ed-btn', onclick: choose }, 'Use')),
      h('div', { class: 'ed-aud-specimen', style: `background:${g.background};color:${g.color}` }, root),
      entry.notes && h('p', { class: 'ed-note' }, entry.notes));
  });
  auditionEl.replaceChildren(
    h('header', { class: 'ed-aud-head' },
      h('h2', {}, 'Typeface audition'),
      h('p', { class: 'ed-note' }, 'Same text, spacing and fitting rules; only the face changes. Add candidates in fonts/fonts.json.'),
      toggle('Show specimen in main preview', () => state.prefs.specimen, (v) => { state.prefs.specimen = v; updatePreview(); }),
      h('button', { type: 'button', class: 'ed-btn ed-primary', onclick: closeAudition }, 'Done')),
    h('div', { class: 'ed-aud-grid' }, cards));
  auditionEl.hidden = false;
  auditionEl.querySelector('.ed-primary').focus();
}

function closeAudition() {
  auditionInstances.forEach((i) => i.destroy());
  auditionInstances = [];
  auditionEl.hidden = true;
  auditionEl.replaceChildren();
}

// ---------------------------------------------------------------- stage

function applyFrame() {
  const w = state.prefs.previewWidth;
  frame.style.width = w === 'full' ? '' : `${w}px`;
  frame.classList.toggle('is-sized', w !== 'full');
}

// Clicking a row in the preview opens its editor card instead of following links.
document.getElementById('stage').addEventListener('click', (e) => {
  const rowEl = e.target.closest('.insc-row');
  if (!rowEl) return;
  e.preventDefault();
  if (state.prefs.specimen) return;
  const card = panel.querySelector(`.ed-row[data-row="${rowEl.dataset.row}"]`);
  if (!card) return;
  if (!card.classList.contains('is-open')) card.querySelector('.ed-row-toggle').click();
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('is-flash');
  setTimeout(() => card.classList.remove('is-flash'), 700);
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
  if (e.key === 'Escape' && !auditionEl.hidden) closeAudition();
});

window.addEventListener('beforeunload', (e) => {
  if (state.server && document.body.classList.contains('is-dirty')) e.preventDefault();
});

// ---------------------------------------------------------------- init

async function init() {
  try { Object.assign(state.prefs, JSON.parse(load(PREFS_KEY) || '{}')); } catch { /* ignore */ }
  const [fileConfig, registry, server] = await Promise.all([
    fetch(CONTENT_URL, { cache: 'no-store' }).then((r) => r.json()),
    loadRegistry(FONTS_URL),
    fetch('/__ping', { cache: 'no-store' }).then((r) => r.ok).catch(() => false),
  ]);
  state.registry = registry;
  state.server = server;
  preview.registry = registry;
  normalize(fileConfig);
  state.savedText = JSON.stringify(fileConfig);
  state.config = fileConfig;
  const draft = load(DRAFT_KEY);
  if (draft && draft !== state.savedText) {
    try {
      state.config = normalize(JSON.parse(draft));
      toast('Restored your unsaved draft. Use Revert to discard it.');
    } catch { store(DRAFT_KEY, null); }
  }
  applyFrame();
  buildPanel();
  updateDirty();
  preview.setDebug(state.prefs.debug);
  updatePreview();
}

init().catch((err) => {
  console.error(err);
  panel.replaceChildren(h('p', { class: 'ed-error' }, `Editor failed to start: ${err.message}. Run python3 scripts/dev_server.py and open http://localhost:8000/dev/`));
});
