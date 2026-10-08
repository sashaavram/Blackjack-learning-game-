// Card animations: cards fly out of the shoe (flipping face-up on the way),
// the hole card flips over, and the old cards are swept off before a new deal.

const FLY_MS = 420;
const STAGGER_MS = 230;
const FLIP_MS = 380;
const SWEEP_MS = 260;

const seen = new Map(); // card id -> was face up when last drawn
let enabled = true;
let onLand = null;

export function configure({ animations, landSound }) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  enabled = animations && !reduce && typeof Element.prototype.animate === 'function';
  onLand = landSound;
}

export const resetSeen = () => seen.clear();

// Animate cards that appeared (or turned face up) since the last render.
// `order` lists card ids in dealing order so the opening deal goes
// player, dealer, player, dealer. Returns how long the animations take (ms).
export function animateTable(root, shoeEl, order = []) {
  const els = [...root.querySelectorAll('.card[data-id]')];
  const fresh = [];
  const flips = [];
  for (const el of els) {
    const id = +el.dataset.id;
    const up = !el.classList.contains('down');
    if (!seen.has(id)) fresh.push(el);
    else if (up && !seen.get(id)) flips.push(el);
    seen.set(id, up);
  }
  if (!enabled) return 0;

  const rank = (el) => {
    const i = order.indexOf(+el.dataset.id);
    return i < 0 ? order.length + els.indexOf(el) : i;
  };
  fresh.sort((a, b) => rank(a) - rank(b));

  const shoe = shoeEl.getBoundingClientRect();
  const sx = shoe.left + shoe.width / 2;
  const sy = shoe.top + shoe.height * 0.25;
  let total = 0;
  fresh.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const dx = sx - (r.left + r.width / 2);
    const dy = sy - (r.top + r.height / 2);
    const up = !el.classList.contains('down');
    const end = up ? 'rotateY(0deg)' : 'rotateY(180deg)';
    const delay = i * STAGGER_MS;
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(-20deg) scale(0.55) rotateY(180deg)` },
        { transform: `translate(${dx * 0.25}px, ${dy * 0.25 - 12}px) rotate(-4deg) scale(1.04) ${up ? 'rotateY(90deg)' : 'rotateY(180deg)'}`, offset: 0.7 },
        { transform: end },
      ],
      { duration: FLY_MS, delay, easing: 'cubic-bezier(.25,.75,.35,1)', fill: 'backwards' },
    );
    setTimeout(() => onLand?.(), delay + FLY_MS * 0.85);
    total = Math.max(total, delay + FLY_MS);
  });
  const flipDelay = total;
  flips.forEach((el, i) => {
    const delay = flipDelay + i * STAGGER_MS;
    el.animate(
      [
        { transform: 'rotateY(180deg)' },
        { transform: 'translateY(-10px) rotateY(90deg) scale(1.06)', offset: 0.5 },
        { transform: 'rotateY(0deg)' },
      ],
      { duration: FLIP_MS, delay, easing: 'ease-in-out', fill: 'backwards' },
    );
    setTimeout(() => onLand?.(), delay + FLIP_MS * 0.5);
    total = Math.max(total, delay + FLIP_MS);
  });
  return total;
}

// Sweep the cards on the table off to the side. Returns its duration (ms).
export function sweepTable(root) {
  const els = [...root.querySelectorAll('.card[data-id]')];
  if (!enabled || !els.length) return 0;
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const flip = el.classList.contains('down') ? ' rotateY(180deg)' : '';
    el.animate(
      [
        { transform: flip || 'none', opacity: 1 },
        { transform: `translate(${-r.left - r.width - 20}px, ${-r.top * 0.4}px) rotate(-35deg)${flip}`, opacity: 0.2 },
      ],
      { duration: SWEEP_MS, delay: i * 18, easing: 'ease-in', fill: 'forwards' },
    );
  });
  return SWEEP_MS + els.length * 18;
}
