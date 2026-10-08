/**
 * The table sets a few symbols (₹ and ★ above all) in webfonts that do not carry them, so the browser has to hunt a
 * system fallback font the first time each one is laid out: ~15ms apiece on a phone, paid inside the table's very first
 * layout, which is one long task. Lay each out once at boot, a task apart, and the table finds the answer cached.
 * Nothing is left in the DOM and nothing is painted.
 */
const PROBES: ReadonlyArray<readonly [family: string, text: string]> = [
  ['"Lilita One", cursive', '₹'],
  ['Archivo, sans-serif', '★'],
  ['Mukta, system-ui, sans-serif', '—·'],
  ['"Rozha One", serif', '—…'],
];

function probe(family: string, text: string) {
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;font-family:${family}`;
  el.textContent = text;
  document.body.append(el);
  void el.offsetWidth;
  el.remove();
}

/** One probe per task, so no slice of the warm-up is itself a long task. */
export function warmGlyphs(): void {
  const queue = [...PROBES];
  const next = () => {
    const p = queue.shift();
    if (!p) return;
    try {
      probe(p[0], p[1]);
    } catch {
      // A missed warm-up only costs the table its first-layout hit.
    }
    window.setTimeout(next, 0);
  };
  window.setTimeout(next, 0);
}
