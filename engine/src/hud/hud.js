import './hud.css';
import { clamp01, easeOutBack } from '../util.js';

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Sobreposição 2D: título da cena, camada, legenda, etiquetas técnicas e progresso. */
export class Hud {
  constructor(el) {
    this.el = el;
    el.innerHTML = `
      <svg class="cz-labels"></svg>
      <div class="cz-top"><div class="cz-pill"><span class="cz-dot"></span><span class="cz-pill-text"></span></div></div>
      <div class="cz-layer"></div>
      <div class="cz-cap"></div>
      <div class="cz-mark">CAMADA ZERO</div>
      <div class="cz-progress"></div>`;
    this.pill = el.querySelector('.cz-pill');
    this.pillText = el.querySelector('.cz-pill-text');
    this.layer = el.querySelector('.cz-layer');
    this.cap = el.querySelector('.cz-cap');
    this.svg = el.querySelector('.cz-labels');
    this.progress = el.querySelector('.cz-progress');
    this.labelEls = [];
  }

  /**
   * @param project (anchor) => {x, y} em fração da tela (0..1), ou null se atrás da câmera
   */
  update({ t, lt, total, scene, entry, project }) {
    this.pillText.textContent = scene.hud_text ?? '';
    this.pill.style.display = scene.hud_text ? '' : 'none';
    this.pill.style.transform = `scale(${easeOutBack(clamp01(lt / 0.35))})`;
    this.layer.textContent = scene.layer ? `▼ ${scene.layer}` : '';
    this.layer.style.opacity = clamp01((lt - 0.2) / 0.3);

    const cap = entry.captions.find((c) => t >= c.start && t < c.end);
    if (cap) {
      const words = cap.text.split(' ');
      const k = Math.min(words.length - 1, Math.floor(((t - cap.start) / (cap.end - cap.start)) * words.length));
      this.cap.innerHTML = words.map((w, i) => (i === k ? `<b>${esc(w)}</b>` : esc(w))).join(' ');
      const pop = clamp01((t - cap.start) / 0.09);
      this.cap.style.transform = `scale(${0.92 + 0.08 * easeOutBack(pop)})`;
      this.cap.style.opacity = 1;
    } else this.cap.style.opacity = 0;

    this.progress.style.width = `${(t / total) * 100}%`;

    const labels = scene.labels ?? [];
    while (this.labelEls.length < labels.length) {
      const d = document.createElement('div'); d.className = 'cz-label'; this.el.appendChild(d); this.labelEls.push(d);
    }
    let lines = '';
    const W = this.el.clientWidth, H = this.el.clientHeight;
    this.labelEls.forEach((d, i) => {
      const l = labels[i], p = l && project(l.anchor);
      const k = l ? clamp01((lt - (l.at ?? 0.4)) / 0.3) : 0;
      if (!l || !p || k <= 0) { d.style.display = 'none'; return; }
      d.style.display = ''; d.textContent = l.text;
      const right = (l.side ?? 'right') === 'right';
      const ax = p.x * W, ay = p.y * H;
      const lx = right ? Math.min(ax + W * 0.1, W * 0.94 - d.offsetWidth) : Math.max(ax - W * 0.1 - d.offsetWidth, W * 0.06);
      const ly = ay - H * (l.lift ?? 0.07);
      d.style.left = `${lx}px`; d.style.top = `${ly}px`; d.style.opacity = k;
      d.style.transformOrigin = right ? 'left center' : 'right center';
      d.style.transform = `scale(${easeOutBack(k)})`;
      const ex = right ? lx : lx + d.offsetWidth, ey = ly + d.offsetHeight / 2;
      lines += `<line x1="${ax}" y1="${ay}" x2="${ax + (ex - ax) * k}" y2="${ay + (ey - ay) * k}" stroke="#38d6ff" stroke-width="${W * 0.004}" opacity="0.9"/>`
        + `<circle cx="${ax}" cy="${ay}" r="${W * 0.011}" fill="#05070b" stroke="#38d6ff" stroke-width="${W * 0.004}"/>`;
    });
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.innerHTML = lines;
  }
}
