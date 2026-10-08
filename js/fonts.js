// Font registry: loads candidates from fonts/fonts.json and installs them on demand.

const FALLBACK = { id: 'serif', name: 'System serif', family: 'serif', system: true, weights: [400] };
const installed = new Map();

export async function loadRegistry(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Font registry ${url}: ${res.status}`);
  const data = await res.json();
  const base = new URL(url, location.href);
  return (Array.isArray(data) ? data : data.fonts || []).map((f) => ({ ...f, base }));
}

export function findFont(registry, id) {
  return registry.find((f) => f.id === id) || registry[0] || FALLBACK;
}

export function familyStack(entry) {
  const fam = entry.family === 'serif' ? 'serif' : `"${entry.family}"`;
  return `${fam}, ${entry.fallback || '"Times New Roman", serif'}`;
}

function install(entry) {
  if (installed.has(entry.id)) return installed.get(entry.id);
  let p = Promise.resolve();
  if (entry.css) {
    p = new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = entry.css;
      link.onload = link.onerror = resolve;
      document.head.append(link);
    });
  } else if (entry.faces) {
    p = Promise.all(entry.faces.map((face) => {
      const src = `url("${new URL(face.src, entry.base)}") format("woff2")`;
      const ff = new FontFace(entry.family, src, {
        weight: String(face.weight ?? 400),
        style: face.style || 'normal',
        display: 'swap',
      });
      document.fonts.add(ff);
      return ff.load().catch((err) => console.warn(`Font ${entry.id}: ${face.src}`, err));
    }));
  }
  installed.set(entry.id, p);
  return p;
}

// Resolves once the face is usable for measurement, or after `timeout` so a
// slow font never blocks the page; the inscription refits when it arrives.
export async function ensureFont(entry, weight = 400, timeout = 3000) {
  const work = (async () => {
    await install(entry);
    if (!entry.system) await document.fonts.load(`${weight} 100px "${entry.family}"`, 'ACDEINOSV·');
  })();
  await Promise.race([work.catch(() => {}), new Promise((r) => setTimeout(r, timeout))]);
}
