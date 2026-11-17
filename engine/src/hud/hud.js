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
  update({ t, lt, total, scene, entry, project, hook }) {
    if (hook) {
      if (!this.hookEl) { this.hookEl = document.createElement('div'); this.hookEl.className = 'cz-hook'; this.el.appendChild(this.hookEl); }
      const text = typeof hook === 'string' ? hook : hook.text, until = hook.until ?? 2.6;
      this.hookEl.innerHTML = esc(text).replace(/\*(.+?)\*/g, '<span>$1</span>');
      const kin = clamp01(t / 0.18), kout = clamp01((until - t) / 0.25);
      this.hookK = Math.max(0, Math.min(kin, kout));
      this.hookEl.style.opacity = this.hookK;
      this.hookEl.style.transform = `translateY(${(1 - easeOutBack(kin)) * 3}cqmin) scale(${0.96 + 0.04 * kin})`;
    }
    this.pillText.textContent = scene.hud_text ?? '';
    this.pill.style.display = scene.hud_text ? '' : 'none';
    this.pill.style.transform = `scale(${easeOutBack(clamp01(lt / 0.35))})`;
    // o título de gancho ocupa o topo: a pílula espera ele sair
    this.pill.style.opacity = 1 - (this.hookK ?? 0);
    this.layer.textContent = scene.layer ? `▼ ${scene.layer}` : '';
    this.layer.style.opacity = clamp01((lt - 0.2) / 0.3) * (1 - (this.hookK ?? 0));

    const cap = entry.captions.find((c) => t >= c.start && t < c.end);
    if (cap) {
      const words = cap.text.split(' ');
      const k = Math.min(words.length - 1, Math.floor(((t - cap.start) / (cap.end - cap.start)) * words.length));
      // *palavra* no roteiro = ênfase permanente na legenda
      let inEm = false;
      this.cap.innerHTML = words.map((w, i) => {
        const opens = w.startsWith('*'), closes = /\*[.,!?…;:]*$/.test(w);
        const em = inEm || opens;
        inEm = (inEm || opens) && !closes;
        const txt = esc(w.replace(/\*/g, ''));
        return em ? `<em class="${i === k ? 'on' : ''}">${txt}</em>` : i === k ? `<b>${txt}</b>` : txt;
      }).join(' ');
      const pop = clamp01((t - cap.start) / 0.09);
      this.cap.style.transform = `scale(${0.92 + 0.08 * easeOutBack(pop)})`;
      this.cap.style.opacity = 1;
    } else this.cap.style.opacity = 0;

    this.progress.style.width = `${(t / total) * 100}%`;

    this._overlays(scene, lt);

    const labels = scene.labels ?? [];
    while (this.labelEls.length < labels.length) {
      const d = document.createElement('div'); d.className = 'cz-label'; this.el.appendChild(d); this.labelEls.push(d);
    }
    let lines = '';
    const W = this.el.clientWidth, H = this.el.clientHeight;
    this.labelEls.forEach((d, i) => {
      const l = labels[i], p = l && project(l.anchor);
      const k = l ? Math.min(clamp01((lt - (l.at ?? 0.4)) / 0.3), l.until !== undefined ? clamp01((l.until - lt) / 0.2) : 1) : 0;
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

  /**
   * Sobreposições do roteiro (scene.overlays):
   *  { type: 'counter', at, dur, from, to, format: 'dec'|'hex'|'bin', digits, label, pos: [x, y], until }
   *  { type: 'code', at, text (linhas com \n), char_time, pos: [x, y] }
   */
  _overlays(scene, lt) {
    const list = scene.overlays ?? [];
    if (this._ovScene !== scene) {
      (this._ovEls ?? []).forEach((e) => e.remove());
      this._ovEls = list.map((o) => {
        const d = document.createElement('div');
        d.className = `cz-ov cz-ov-${o.type}`;
        d.style.left = `${(o.pos?.[0] ?? 0.5) * 100}%`;
        d.style.top = `${(this.wide ? Math.max(0.42, o.pos?.[1] ?? 0.3) : o.pos?.[1] ?? 0.3) * 100}%`;
        this.el.appendChild(d);
        return d;
      });
      this._ovScene = scene;
    }
    list.forEach((o, i) => {
      const d = this._ovEls[i], k = clamp01((lt - (o.at ?? 0.5)) / 0.25);
      // 'until' tira o overlay da tela antes do fim da cena (abre espaço pro próximo)
      d.style.opacity = o.until !== undefined ? Math.min(k, clamp01((o.until - lt) / 0.2)) : k;
      d.style.transform = `translate(-50%, -50%) scale(${0.85 + 0.15 * easeOutBack(k)})`;
      if (k <= 0) return;
      if (o.type === 'counter') {
        const u = clamp01((lt - (o.at ?? 0.5)) / (o.dur ?? 1.2)), e = u * u * u * (u * (u * 6 - 15) + 10);
        const v = Math.round((o.from ?? 0) + ((o.to ?? 0) - (o.from ?? 0)) * e);
        const fmt = o.format ?? 'dec';
        const txt = fmt === 'hex' ? `0x${v.toString(16).toUpperCase().padStart(o.digits ?? 2, '0')}`
          : fmt === 'bin' ? v.toString(2).padStart(o.digits ?? 8, '0') : v.toLocaleString('pt-BR');
        d.innerHTML = `${o.label ? `<small>${esc(o.label)}</small>` : ''}<span>${txt}</span>`;
      } else if (o.type === 'code') {
        const n = Math.max(0, Math.floor((lt - (o.at ?? 0.5)) / (o.char_time ?? 0.035)));
        d.textContent = (o.text ?? '').slice(0, n);
      }
    });
  }
}