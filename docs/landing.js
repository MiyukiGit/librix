'use strict';
// Scroll reveal
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el, i) => { el.style.setProperty('--d', `${(i % 4) * 0.08}s`); io.observe(el); });

// Live numbers from the library database, counted up once visible
const row = document.querySelector('[data-stats]');
api('GET', 'api/stats').then(s => {
  const run = () => row.querySelectorAll('b[data-k]').forEach(b => {
    const end = s[b.dataset.k], t0 = performance.now();
    const tick = t => {
      const p = Math.min(1, (t - t0) / 900);
      b.textContent = String(Math.round(end * (1 - (1 - p) ** 3))).padStart(2, '0');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { run(); o.disconnect(); } }, { threshold: .4 }).observe(row);
  document.querySelector('[data-note]').textContent = `Live from the library database · ${s.loans_total} loans recorded`;
}).catch(() => { document.querySelector('[data-note]').textContent = 'Could not load library numbers.'; });

// Footer clock
const clock = document.querySelector('[data-clock]');
const tickClock = () => clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' local';
tickClock(); setInterval(tickClock, 30_000);

api.mode().then(m => { document.getElementById('storage').textContent = m === 'server' ? 'SQLite, on this machine' : 'In your browser (demo)'; });
