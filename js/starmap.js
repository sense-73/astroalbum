// ─── Rendering: proiezione gnomonica + disegno canvas ────────────────────────
import { state } from './state.js';
import { D2R, R2D, TWO_PI, norm, cross, dot, s2c, c2s, magToR } from './math.js';

// ── Canvas ────────────────────────────────────────────────────────────────────
export const canvas = document.getElementById('starmap');
export const ctx    = canvas.getContext('2d');

// ── Cache immagini costellazioni (lazy load da img/const/) ────────────────────
const constImages = new Map();

function getConstImage(name) {
  if (constImages.has(name)) return constImages.get(name); // 'loading' | 'error' | HTMLImageElement
  constImages.set(name, 'loading');
  const img  = new Image();
  const slug = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/\s+/g, '-');
  img.onload  = () => { constImages.set(name, img); scheduleRender(); };
  img.onerror = () => { constImages.set(name, 'error'); };
  img.src = `img/const/${slug}.svg`;
  return null; // prima chiamata: null → immagine non ancora pronta
}

// ── Base vettoriale della vista (con cache) ───────────────────────────────────
//
//  Derivazione:
//    fwd   = direzione di osservazione
//    right = normalize(cross(fwd, northPole)) → ovest  (AR aumenta a sinistra ✓)
//    up    = normalize(cross(right, fwd))     → nord sullo schermo ✓
//
export function getBasis() {
  const key = state.viewRA.toFixed(4) + ':' + state.viewDec.toFixed(4);
  if (state._basis && state._basisKey === key) return state._basis;

  const fwd = s2c(state.viewRA, state.viewDec);
  const wUp = Math.abs(state.viewDec) > 88
    ? [-Math.sin(state.viewRA * D2R), Math.cos(state.viewRA * D2R), 0]
    : [0, 0, 1];

  const right = norm(cross(fwd, wUp));
  const up    = norm(cross(right, fwd));

  state._basis    = { fwd, right, up };
  state._basisKey = key;
  return state._basis;
}

// ── Proiezione gnomonica ──────────────────────────────────────────────────────
export function project(raDeg, decDeg) {
  const { fwd, right, up } = getBasis();
  const p  = s2c(raDeg, decDeg);
  const vz = dot(p, fwd);
  if (vz < 0.005) return null;
  const f = state.scale / vz;
  return {
    x: state.W / 2 + dot(p, right) * f,
    y: state.H / 2 - dot(p, up)    * f,
  };
}

// Pixel → direzione celeste
export function unproject(px, py) {
  const { fwd, right, up } = getBasis();
  const vx = (px - state.W / 2) / state.scale;
  const vy = (state.H / 2 - py) / state.scale;
  return norm([
    fwd[0] + vx * right[0] + vy * up[0],
    fwd[1] + vx * right[1] + vy * up[1],
    fwd[2] + vx * right[2] + vy * up[2],
  ]);
}

// ── Render loop ───────────────────────────────────────────────────────────────
let _rafPending  = false;
let _fadeActive  = false;
const FADE_SPEED = 0.018; // ~1.2s a 60fps

// Hook opzionale invocato a ogni render (registrato da main.js) — evita import
// circolare. Usato per aggiornare il display coordinate col centro vista (mobile).
let _onViewChange = null;
export function setViewChangeHook(fn) { _onViewChange = fn; }

export function scheduleRender() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    render();
    _rafPending = false;
    // Se _animActive era tenuto vivo solo per il pulse snapTarget e ora è stato azzerato, fermati
    if (state._animActive && !state.flyTo && !state.snapTarget) state._animActive = false;
    if (state._animActive) scheduleRender();
  });
}

// ── Volo animato verso un oggetto DSO ─────────────────────────────────────────
const FLY_DURATION  = 1800;  // ms — durata totale
const FLY_IN_POWER  = 4;     // decollo  (2=quasi lineare, 4=lento)
const FLY_OUT_POWER = 2.5;     // atterraggio (3=normale, 6=morbido, 10=lunghissimo)
const FLY_SWITCH    = 0.35;  // % del tempo dedicato al decollo (0.35 = 35%)

export function flyToObject(raTo, decTo, obj = null) {
  // Cammino più corto sull'asse RA (wrap ±180°)
  let dRA = ((raTo - state.viewRA + 540) % 360) - 180;

  state.flyTo = {
    raFrom:    state.viewRA,
    decFrom:   state.viewDec,
    raTo:      state.viewRA + dRA,   // RA target non-wrappato per interpolazione lineare
    decTo,
    startTime: performance.now(),
    duration:  FLY_DURATION,
  };
  state.flyToObj    = obj;
  state._animActive = true;
  scheduleRender();
}

// Easing asimmetrico — formula corretta, parametri modificabili in cima
function easeInOutCubic(t) {
  if (t < FLY_SWITCH) {
    // Decollo: [0, SWITCH] → [0, 0.5]
    const s = t / FLY_SWITCH;
    return 0.5 * Math.pow(s, FLY_IN_POWER);
  } else {
    // Atterraggio: [SWITCH, 1] → [0.5, 1]
    const s = (t - FLY_SWITCH) / (1 - FLY_SWITCH);
    return 0.5 + 0.5 * (1 - Math.pow(1 - s, FLY_OUT_POWER));
  }
}

// Tick del flyTo — chiamato all'inizio di ogni render()
function tickFlyTo() {
  const f = state.flyTo;
  if (!f) return;
  const elapsed = performance.now() - f.startTime;
  const t = Math.min(elapsed / f.duration, 1);
  const e = easeInOutCubic(t);

  state.viewRA  = ((f.raFrom  + (f.raTo  - f.raFrom)  * e) + 360) % 360;
  state.viewDec = Math.max(-89.5, Math.min(89.5,
    f.decFrom + (f.decTo - f.decFrom) * e));

  if (t >= 1) {
    state.flyTo       = null;
    state._animActive = false;
    if (state.flyToObj) {
      state.snapTarget  = state.flyToObj;
      state.flyToObj    = null;
      state._animActive = true;  // mantiene il loop per animare il pulse
      scheduleRender();
    }
  }
}

// Avvia il loop di fade morbido per i layer nomi
export function startFade() {
  if (_fadeActive) return;
  _fadeActive = true;
  function step() {
    let still = false;
    const target = (k, show) => {
      const curr = state[k];
      const tgt  = show ? 1 : 0;
      if (Math.abs(curr - tgt) < 0.01) { state[k] = tgt; }
      else { state[k] = curr + (tgt - curr) * FADE_SPEED * 2; still = true; }
    };
    target('constNamesAlpha', state.showConstNames);
    target('starNamesAlpha',  state.showStarNames);
    scheduleRender();
    if (still) requestAnimationFrame(step);
    else _fadeActive = false;
  }
  requestAnimationFrame(step);
}

export function resize() {
  state.W     = canvas.width  = window.innerWidth;
  state.H     = canvas.height = window.innerHeight;
  state.scale = (state.W / 2) / Math.tan(state.fov * D2R / 2);
  render();
}

// ── Render principale ─────────────────────────────────────────────────────────
export function render() {
  tickFlyTo();  // aggiorna viewRA/viewDec se flyTo è attivo
  state.scale  = (state.W / 2) / Math.tan(state.fov * D2R / 2);
  state._basis = null; // invalida cache per questo frame

  ctx.fillStyle = '#000510';
  ctx.fillRect(0, 0, state.W, state.H);

  drawGrid();
  drawConstellations();
  drawConstNames();
  drawStars();
  drawStarNames();
  drawDSOMarkers();
  drawCrosshair();
  drawShootingStar();

  document.getElementById('fov-disp').textContent = state.fov.toFixed(1) + '°';

  if (_onViewChange) _onViewChange();  // aggiorna display coordinate (centro vista)
}

// ── Griglia AR/Dec ────────────────────────────────────────────────────────────
function drawGrid() {
  let step = 30;
  if (state.fov < 60) step = 15;
  if (state.fov < 20) step = 5;
  if (state.fov < 6)  step = 2;
  if (state.fov < 2)  step = 0.5;

  ctx.save();

  for (let dec = -90; dec <= 90; dec += step) {
    const isEq = dec === 0;
    ctx.strokeStyle = isEq ? 'rgba(80,140,210,0.22)' : 'rgba(50,80,130,0.11)';
    ctx.lineWidth   = isEq ? 0.8 : 0.4;
    ctx.beginPath();
    let first = true;
    for (let ra = 0; ra <= 361; ra += 1.2) {
      const p = project(ra, dec);
      if (!p) { first = true; continue; }
      first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      first = false;
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(50,80,130,0.11)';
  ctx.lineWidth   = 0.4;
  const rs = step * 2;
  for (let ra = 0; ra < 360; ra += rs) {
    ctx.beginPath();
    let first = true;
    for (let dec = -88; dec <= 88; dec += 1.5) {
      const p = project(ra, dec);
      if (!p) { first = true; continue; }
      first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      first = false;
    }
    ctx.stroke();
  }

  // Label ore AR
  if (state.fov > 8) {
    ctx.fillStyle = 'rgba(100,150,200,0.20)';
    const isMobileGrid = state.W < 600;
    const gridLabelSz  = isMobileGrid
      ? Math.max(11, Math.min(15, state.fov * 0.22))
      : Math.max(8,  Math.min(11, state.fov * 0.15));
    ctx.font      = `${gridLabelSz}px Cinzel,serif`;
    ctx.textAlign = 'center';
    for (let ra = 0; ra < 360; ra += rs) {
      const p = project(ra, 0);
      if (!p || p.x < 5 || p.x > state.W - 5 || p.y < 5 || p.y > state.H - 5) continue;
      ctx.fillText(Math.round(ra / 15) + 'h', p.x, p.y - 5);
    }
  }

  ctx.restore();
}

// ── Linee costellazioni ───────────────────────────────────────────────────────
function drawConstellations() {
  if (!state.showConstLines || !state.constSegs.length) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(130,175,240,0.48)';
  ctx.lineWidth   = 1.1;
  ctx.setLineDash([5, 5]);

  for (const seg of state.constSegs) {
    const p0 = project(seg[0][0], seg[0][1]);
    const p1 = project(seg[1][0], seg[1][1]);
    if (!p0 || !p1 || Math.hypot(p1.x - p0.x, p1.y - p0.y) > state.W * 0.55) continue;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ── Nomi costellazioni ────────────────────────────────────────────────────────
function drawConstNames() {
  if (!state.constNamesAlpha || !state.constData.length) return;
  const isMobile = state.W < 600;
  const sz = isMobile
    ? Math.max(14, Math.min(22, Math.round(750 / state.fov)))
    : Math.max(16, Math.min(28, Math.round(900 / state.fov)));
  const col = isMobile ? 'rgba(210,185,100,0.68)' : 'rgba(210,185,100,0.68)';
  ctx.save();
  ctx.globalAlpha  = state.constNamesAlpha;
  ctx.font         = `400 ${sz}px Cinzel,serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (const c of state.constData) {
    const p = project(c.centRa, c.centDec);
    if (!p || p.x < 0 || p.x > state.W || p.y < 0 || p.y > state.H) continue;
    
    // Immagine costellazione (SVG da img/const/) sopra il nome
    const img = getConstImage(c.name);
    if (img && img !== 'loading' && img !== 'error') {
      const imgH = Math.round(sz * 3.5);
      const imgW = (img.naturalWidth && img.naturalHeight)
        ? Math.round(imgH * img.naturalWidth / img.naturalHeight)
        : imgH;
      ctx.drawImage(img, p.x - imgW / 2, p.y - sz / 2 - 6 - imgH, imgW, imgH);
    }

    ctx.fillStyle = 'rgba(0,4,16,0.7)';
    ctx.fillText(c.name, p.x + 1, p.y + 1);
    ctx.fillStyle = col;
    ctx.fillText(c.name, p.x, p.y);
  }

  ctx.restore();
}

// ── Stelle ────────────────────────────────────────────────────────────────────
function bvToColor(bv) {
  if (bv === null || bv === undefined || isNaN(bv)) return '#e8f0ff';
  if (bv < -0.30) return '#aac4ff';
  if (bv < -0.10) return '#c4d8ff';
  if (bv <  0.10) return '#ddeeff';
  if (bv <  0.30) return '#eef4ff';
  if (bv <  0.58) return '#fff8ec';
  if (bv <  0.81) return '#ffe8b0';
  if (bv <  1.40) return '#ffb84a';
  return '#ff7733';
}

function drawStars() {
  const mg = 15;
  for (const s of state.stars) {
    const p = project(s.ra, s.dec);
    if (!p || p.x < -mg || p.x > state.W + mg || p.y < -mg || p.y > state.H + mg) continue;
    const r   = magToR(s.mag);
    const col = bvToColor(s.bv);

    if (s.mag < 2.5) {
      const it = (2.5 - s.mag) / 2.5;
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
      gr.addColorStop(0,   `rgba(220,235,255,${(it * 0.18).toFixed(3)})`);
      gr.addColorStop(0.4, `rgba(180,210,255,${(it * 0.08).toFixed(3)})`);
      gr.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 6, 0, TWO_PI);
      ctx.fillStyle = gr;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TWO_PI);
    ctx.fillStyle = col;
    ctx.fill();
  }
}

// ── Nomi stelle brillanti ─────────────────────────────────────────────────────
function drawStarNames() {
  if (!state.starNamesAlpha || !state.stars.length) return;
  const magLim  = state.fov < 10 ? 4.5 : state.fov < 25 ? 3.5 : state.fov < 50 ? 2.5 : 1.8;
  const isMobile = state.W < 600;
  const sz = isMobile
    ? Math.max(12, Math.min(16, Math.round(500 / state.fov)))
    : Math.max(8,  Math.min(11, Math.round(320 / state.fov)));

  ctx.save();
  ctx.globalAlpha  = state.starNamesAlpha;
  ctx.font         = `300 ${sz}px Raleway,sans-serif`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';

  for (const s of state.stars) {
    if (!s.name || (s.mag > magLim && !s.asterism)) continue;
    const p = project(s.ra, s.dec);
    if (!p || p.x < -20 || p.x > state.W + 20 || p.y < -20 || p.y > state.H + 20) continue;
    const off = magToR(s.mag) + 5;
    ctx.fillStyle = 'rgba(0,4,16,0.75)';
    ctx.fillText(s.name, p.x + off + 1, p.y + 1);
    ctx.fillStyle = 'rgba(190,215,255,0.60)';
    ctx.fillText(s.name, p.x + off, p.y);
  }

  ctx.restore();
}

// ── Marker DSO ────────────────────────────────────────────────────────────────
function drawDSOMarkers() {
  const t = Date.now() / 1000;

  for (const obj of state.allObjects) {
    const p = project(obj.ra, obj.dec);
    if (!p || p.x < -40 || p.x > state.W + 40 || p.y < -40 || p.y > state.H + 40) continue;

    const hov      = state.hoveredDSO  && state.hoveredDSO.id  === obj.id;
    const snapping = state.snapTarget  && state.snapTarget.id   === obj.id;

    // ── Halo hover (oro) ──────────────────────────────────────────────────────
    if (hov) {
      const pulse = 16 + Math.sin(t * 4) * 2.5;
      const gr = ctx.createRadialGradient(p.x, p.y, pulse * 0.4, p.x, p.y, pulse * 1.8);
      gr.addColorStop(0, 'rgba(255,200,60,0.12)');
      gr.addColorStop(1, 'rgba(255,200,60,0)');
      ctx.beginPath(); ctx.arc(p.x, p.y, pulse * 1.8, 0, TWO_PI);
      ctx.fillStyle = gr; ctx.fill();

      ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, TWO_PI);
      ctx.strokeStyle = `rgba(255,200,60,${(0.28 + Math.sin(t * 4) * 0.10).toFixed(3)})`;
      ctx.lineWidth = 1; ctx.stroke();
    }

    // ── Pulse snap (ciano/bianco, lento, intensità crescente) ────────────────
    if (snapping) {
      // Prossimità 0→1: 0 lontano, 1 centrato
      const v1  = s2c(state.viewRA, state.viewDec);
      const v2  = s2c(obj.ra, obj.dec);
      const dp  = Math.max(-1, Math.min(1, v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2]));
      const ang = Math.acos(dp) * 180 / Math.PI;
      const prox = Math.max(0, 1 - ang / 12); // 0 a 12°+, 1 al centro

      const baseAlpha = 0.12 + prox * 0.22;
      const pulseR    = 20 + Math.sin(t * 2.5) * (3 + prox * 3);

      const gr = ctx.createRadialGradient(p.x, p.y, pulseR * 0.3, p.x, p.y, pulseR * 2.4);
      gr.addColorStop(0, `rgba(180,240,255,${baseAlpha.toFixed(3)})`);
      gr.addColorStop(1, 'rgba(180,240,255,0)');
      ctx.beginPath(); ctx.arc(p.x, p.y, pulseR * 2.4, 0, TWO_PI);
      ctx.fillStyle = gr; ctx.fill();

      const ringAlpha = 0.25 + prox * 0.25 + Math.sin(t * 2.5) * 0.10;
      ctx.beginPath(); ctx.arc(p.x, p.y, pulseR, 0, TWO_PI);
      ctx.strokeStyle = `rgba(180,240,255,${ringAlpha.toFixed(3)})`;
      ctx.lineWidth = 1.4; ctx.stroke();
    }

    // ── Marker base ───────────────────────────────────────────────────────────
    const baseR = hov ? 11 : 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, baseR, 0, TWO_PI);
    ctx.strokeStyle = hov      ? 'rgba(255,210,70,0.90)'  :
                      snapping ? 'rgba(180,240,255,0.85)' :
                                 'rgba(60,170,255,0.70)';
    ctx.lineWidth   = hov || snapping ? 1.6 : 1.2;
    ctx.stroke();

    // Crocette ai punti cardinali
    const tk = 4;
    ctx.strokeStyle = hov      ? 'rgba(255,210,70,0.55)'  :
                      snapping ? 'rgba(180,240,255,0.45)' :
                                 'rgba(60,170,255,0.40)';
    ctx.lineWidth = 1;
    [
      [p.x, p.y - baseR - tk, p.x, p.y - baseR - 1],
      [p.x, p.y + baseR + 1,  p.x, p.y + baseR + tk],
      [p.x - baseR - tk, p.y, p.x - baseR - 1, p.y],
      [p.x + baseR + 1,  p.y, p.x + baseR + tk, p.y],
    ].forEach(([x0, y0, x1, y1]) => {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    });

    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, TWO_PI);
    ctx.fillStyle = hov      ? 'rgba(255,210,70,0.90)'  :
                    snapping ? 'rgba(180,240,255,0.85)' :
                               'rgba(60,170,255,0.70)';
    ctx.fill();
  }
}

// ── Reticolo centro vista ─────────────────────────────────────────────────────
function drawCrosshair() {
  if (!state.showCrosshair) return;
  const cx  = state.W / 2;
  const cy  = state.H / 2;
  const R   = 12;   // raggio cerchio (px)
  const L   = 18;   // lunghezza linee cardinali (px)
  const GAP = 5;    // gap tra cerchio e linee (px)

  ctx.save();
  ctx.strokeStyle = 'rgba(160,210,255,0.50)';
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([]);

  // Cerchio
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TWO_PI);
  ctx.stroke();

  // 4 linee cardinali con gap
  for (const [dx, dy] of [[0,-1],[0,1],[1,0],[-1,0]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * (R + GAP),       cy + dy * (R + GAP));
    ctx.lineTo(cx + dx * (R + GAP + L),   cy + dy * (R + GAP + L));
    ctx.stroke();
  }

  // Punto centrale
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, TWO_PI);
  ctx.fillStyle = 'rgba(160,210,255,0.60)';
  ctx.fill();

  ctx.restore();
}

// ── Stelle cadenti ────────────────────────────────────────────────────────────
const SHOOTING_INTERVAL = 45000; // ms tra una stella cadente e l'altra
const SHOOTING_DURATION = 1600;  // ms — più lungo per persistenza della scia

let _shootingActive = false;
let _shootingStart  = 0;
let _shooting       = null;

function spawnShootingStar() {
  if (state.lbObject || state.adminOpen) return;

  const x     = Math.random() * state.W;
  const y     = Math.random() * state.H * 0.5;
  const sign  = Math.random() < 0.5 ? 1 : -1;
  const angle = (20 + Math.random() * 30) * Math.PI / 180;
  const speed = 650 + Math.random() * 300;
  const len   = 80  + Math.random() * 100;
  const hue   = Math.random() < 0.6 ? '210,230,255' : '255,245,220';

  _shooting = {
    x, y,
    dx: Math.cos(angle) * speed * sign,
    dy: Math.sin(angle) * speed,
    len, hue,
  };
  _shootingStart  = performance.now();
  _shootingActive = true;
  requestAnimationFrame(tickShootingStar);
}

function tickShootingStar(now) {
  if (now - _shootingStart >= SHOOTING_DURATION) {
    _shootingActive = false;
    _shooting = null;
    scheduleRender();
    return;
  }
  scheduleRender();
  requestAnimationFrame(tickShootingStar);
}

export function drawShootingStar() {
  if (!_shootingActive || !_shooting) return;
  const elapsed = performance.now() - _shootingStart;
  const t  = elapsed / SHOOTING_DURATION;
  const dt = elapsed / 1000;
  const s  = _shooting;

  const hx  = s.x + s.dx * dt;
  const hy  = s.y + s.dy * dt;
  const mag = Math.hypot(s.dx, s.dy);
  const tx  = hx - (s.dx / mag) * s.len;
  const ty  = hy - (s.dy / mag) * s.len;

  // Accensione rapida (10%), dissolvenza lenta (90%) con curva quadratica
  const fadeOut = (t - 0.10) / 0.90;
  const alpha = t < 0.10
    ? t / 0.10
    : 1 - (fadeOut * fadeOut);

  const grad = ctx.createLinearGradient(tx, ty, hx, hy);
  grad.addColorStop(0,   `rgba(${s.hue},0)`);
  grad.addColorStop(0.6, `rgba(${s.hue},${(alpha * 0.18).toFixed(3)})`);
  grad.addColorStop(1,   `rgba(${s.hue},${(alpha * 0.92).toFixed(3)})`);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 1.5;
  ctx.lineCap     = 'round';
  ctx.stroke();

  const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 4);
  glow.addColorStop(0, `rgba(${s.hue},${(alpha * 0.7).toFixed(3)})`);
  glow.addColorStop(1, `rgba(${s.hue},0)`);
  ctx.beginPath();
  ctx.arc(hx, hy, 4, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.restore();
}

setInterval(spawnShootingStar, SHOOTING_INTERVAL);
setTimeout(spawnShootingStar, 10000);
