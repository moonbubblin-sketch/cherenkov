"use strict";
/* Biblioteca compartilhada dos simuladores: tema, formatação, etiquetas de tipo,
   controles deslizantes e palco 3D (câmera orbital própria, rótulos HTML). */
const Lab = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---- formatação pt-BR ---- */
  const cache = {};
  const nf = d => cache[d] || (cache[d] = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }));
  const num = (x, d = 2) => (x === null || x === undefined || !isFinite(x)) ? '—' : nf(d).format(x);
  const SUP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻' };
  const sci = (x, d = 2) => {
    if (!isFinite(x)) return '—'; if (x === 0) return '0';
    const [m, e] = x.toExponential(d).split('e');
    return `${m.replace('.', ',')} × 10${String(parseInt(e, 10)).split('').map(c => SUP[c] || c).join('')}`;
  };

  /* ---- etiquetas de tipo ---- */
  const TYPES = {
    exp:  { cls: 'b-exp',  glyph: '■', text: 'experimental' },
    calc: { cls: 'b-calc', glyph: 'ƒ', text: 'calculado' },
    sim:  { cls: 'b-sim',  glyph: '≈', text: 'simulado/ilustrativo' },
    ref:  { cls: 'b-ok',   glyph: '✓', text: 'dado de referência' },
    none: { cls: 'b-none', glyph: '∅', text: 'sem dados' }
  };
  const badge = (t, text) => `<span class="badge ${TYPES[t].cls}">${TYPES[t].glyph} ${(text || TYPES[t].text).replace(/^[■ƒ≈✓∅]\s*/, '')}</span>`;
  const row = (k, sub, v, t, tText) =>
    `<div class="row"><div class="k">${k}${sub ? `<small>${sub}</small>` : ''}</div><div class="val"><span class="v">${v}</span>${badge(t, tText)}</div></div>`;

  /* ---- tema ---- */
  function theme(onChange){
    const root = document.documentElement, btn = $('#theme');
    let saved = null; try { saved = localStorage.getItem('cherenkov-theme'); } catch (e) {}
    if (saved) root.setAttribute('data-theme', saved);
    const isDark = () => root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const sync = () => { const d = isDark(); btn.setAttribute('aria-pressed', d); btn.textContent = d ? 'Tema claro' : 'Tema escuro'; if (onChange) onChange(d); };
    btn.addEventListener('click', () => {
      const n = isDark() ? 'light' : 'dark'; root.setAttribute('data-theme', n);
      try { localStorage.setItem('cherenkov-theme', n); } catch (e) {}
      sync();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
    sync();
    return isDark;
  }

  /* ---- controle deslizante + campo numérico ---- */
  const sig = x => Number(x.toPrecision(3));
  const setP = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
  function slider(host, c, onChange){
    const toS = v => c.log ? Math.round(Math.log(v / c.min) / Math.log(c.max / c.min) * 1000) : v;
    const fromS = s => c.log ? sig(c.min * Math.pow(c.max / c.min, s / 1000)) : +s;
    $(host).insertAdjacentHTML('beforeend', `
      <div class="ctl">
        <label for="n-${c.id}">${c.label} <span class="unit">${c.unit || ''}${c.hint ? ' · ' + c.hint : ''}</span></label>
        <div class="pair">
          <input type="range" id="r-${c.id}" aria-label="${c.label}, controle deslizante" min="${c.log ? 0 : c.min}" max="${c.log ? 1000 : c.max}" step="${c.log ? 1 : c.step}" value="${toS(c.value)}">
          <input type="number" id="n-${c.id}" inputmode="decimal" min="${c.min}" max="${c.max}" step="${c.step || 'any'}" value="${c.value}">
        </div>
      </div>`);
    const r = $('#r-' + c.id), n = $('#n-' + c.id); setP(r);
    const api = {
      value: c.value,
      set(v){ api.value = v; n.value = v; r.value = toS(v); setP(r); n.removeAttribute('aria-invalid'); onChange(v); }
    };
    r.addEventListener('input', () => { api.value = fromS(r.value); n.value = api.value; setP(r); n.removeAttribute('aria-invalid'); onChange(api.value); });
    n.addEventListener('input', () => {
      const v = parseFloat(n.value);
      if (isFinite(v) && v >= c.min && v <= c.max){ api.value = v; r.value = toS(v); setP(r); n.removeAttribute('aria-invalid'); onChange(v); }
      else n.setAttribute('aria-invalid', 'true');
    });
    n.addEventListener('change', () => { let v = parseFloat(n.value); if (!isFinite(v)) v = api.value; api.set(Math.min(Math.max(v, c.min), c.max)); });
    return api;
  }

  /* ---- palco 3D ---- */
  function stage(opts){
    const o = Object.assign({ theta: 0.6, phi: 1.15, radius: 14, target: [0, 0, 0], minR: 4, maxR: 60, fov: 40 }, opts);
    const canvas = $('#gl'), el = $('#stage'), labelHost = $('#labels');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch (e){ $('#nogl').style.display = 'flex'; return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(o.fov, 1, 0.05, 500);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x445066, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(6, 14, 9); scene.add(key);
    const orbit = { theta: o.theta, phi: o.phi, radius: o.radius, target: new THREE.Vector3(...o.target) };
    const goal = { theta: o.theta, phi: o.phi, radius: o.radius, target: new THREE.Vector3(...o.target) };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const labels = new Map();
    const api = { THREE, scene, camera, renderer, canvas, orbit, goal, reduced, dark: false, onTick: null, onPick: null };

    function resize(){ const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    new ResizeObserver(resize).observe(el); resize();

    const zoom = f => { goal.radius = Math.min(Math.max(goal.radius * f, o.minR), o.maxR); };
    const ptrs = new Map(); let pinch = 0, down = null;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { moved: 0, t: performance.now() };
      if (ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    canvas.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 1){ goal.theta -= dx * 0.008; goal.phi = Math.min(Math.max(goal.phi - dy * 0.008, 0.12), Math.PI - 0.12); }
      else if (ptrs.size === 2){ const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch > 0) zoom(pinch / d); pinch = d; }
    });
    const up = e => { if (down && down.moved < 6 && performance.now() - down.t < 500 && api.onPick) api.onPick(e); ptrs.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = 0; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    canvas.addEventListener('keydown', e => {
      const k = e.key, s = 0.09; let used = true;
      if (k === 'ArrowLeft') goal.theta -= s; else if (k === 'ArrowRight') goal.theta += s;
      else if (k === 'ArrowUp') goal.phi = Math.max(goal.phi - s, 0.12); else if (k === 'ArrowDown') goal.phi = Math.min(goal.phi + s, Math.PI - 0.12);
      else if (k === '+' || k === '=') zoom(0.9); else if (k === '-' || k === '_') zoom(1.1); else used = false;
      if (used) e.preventDefault();
    });
    api.resetCamera = () => { goal.theta = o.theta; goal.phi = o.phi; goal.radius = o.radius; goal.target.set(...o.target); };

    api.label = (id, cls) => { const d = document.createElement('div'); d.className = 'lbl ' + (cls || ''); labelHost.appendChild(d); labels.set(id, d); return d; };
    const v3 = new THREE.Vector3();
    api.place = (id, pos, show, text) => {
      const node = labels.get(id); if (!node) return;
      if (!show){ node.style.display = 'none'; return; }
      v3.copy(pos).project(camera);
      if (v3.z > 1){ node.style.display = 'none'; return; }
      if (text !== undefined && node.textContent !== text) node.textContent = text;
      node.style.display = 'block';
      const px = (v3.x * 0.5 + 0.5) * el.clientWidth, py = (-v3.y * 0.5 + 0.5) * el.clientHeight;
      node.style.transform = `translate(${Math.max(4, Math.min(px + 8, el.clientWidth - node.offsetWidth - 4))}px,${py}px) translateY(-50%)`;
    };
    api.hideLabels = () => labels.forEach(l => { l.style.display = 'none'; });

    let last = performance.now(), clock = 0;
    function loop(now){
      requestAnimationFrame(loop);
      if (document.hidden || !el.clientWidth) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
      const k = 1 - Math.exp(-dt * 9);
      orbit.theta += (goal.theta - orbit.theta) * k; orbit.phi += (goal.phi - orbit.phi) * k; orbit.radius += (goal.radius - orbit.radius) * k; orbit.target.lerp(goal.target, k);
      const sp = Math.sin(orbit.phi);
      camera.position.set(orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta), orbit.target.y + orbit.radius * Math.cos(orbit.phi), orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta));
      camera.lookAt(orbit.target);
      api.hideLabels();
      if (api.onTick) api.onTick(dt, clock);
      renderer.render(scene, camera);
      if (api.onLabels) api.onLabels();
    }
    requestAnimationFrame(loop);
    return api;
  }

  return { $, $$, num, sci, badge, row, TYPES, theme, slider, stage, setP };
})();
