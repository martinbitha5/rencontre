// Compteur animé du bandeau de chiffres.
//
// Le chiffre lu à la construction est déjà écrit dans la page. Quand le
// bandeau entre à l'écran, il défile de 0 jusqu'à ce chiffre. En parallèle,
// le vrai chiffre du moment est demandé à Supabase : s'il a bougé depuis la
// construction, le compteur repart doucement vers la nouvelle valeur.
import { fetchCounter, counterLabel, formatCount } from '../lib/counter.js';

const el = document.getElementById('counter');
const label = document.getElementById('counter-label');

if (el) {
  let shown = 0;
  let target = Number(el.dataset.count) || 0;
  let mode = el.dataset.mode || 'waitlist';
  let started = false;
  let frame = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const paint = (n) => {
    shown = n;
    el.textContent = formatCount(Math.round(n));
  };

  // Rapide au début, ralentit à l'approche du chiffre final.
  const animate = (from, to, duration) => {
    cancelAnimationFrame(frame);
    if (reduce || from === to) return paint(to);
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      paint(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  const start = () => {
    if (started) return;
    started = true;
    animate(0, target, 1800);
  };

  if (!reduce && 'IntersectionObserver' in window) {
    paint(0);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        start();
      }
    }, { threshold: 0.5 });
    io.observe(el);
  } else {
    started = true;
  }

  fetchCounter()
    .then((live) => {
      if (live.mode !== mode) {
        mode = live.mode;
        label.textContent = counterLabel(live);
      } else if (live.count !== target) {
        label.textContent = counterLabel(live);
      }
      if (live.count === target) return;
      target = live.count;
      el.dataset.count = String(target);
      // Bandeau pas encore vu : la valeur fraîche servira au défilement.
      if (started) animate(shown, target, 900);
    })
    .catch(() => { /* hors ligne : le chiffre de la construction reste */ });
}
