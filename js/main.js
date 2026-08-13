// ─── Entry point: interazione, toggle, init ───────────────────────────────────
import { state }                              from './state.js';
import { canvas, resize, scheduleRender,
         project, unproject, startFade }    from './starmap.js';
import { showPopup, scheduleHide,
         openLightbox, closeLightbox, navLB } from './dso.js';
import { initAdmin, closeAdmin, getRaDecimal, getDeclDecimal } from './admin.js';
import { loadObjects }                        from './data.js';
import { loadData }                           from './catalog.js';
import { D2R, R2D, s2c, c2s, raToHMSParts, declToDMSParts, sha256 } from './math.js';

// ── Auth ───────────────────────────────────────────────────────────────────────
const AUTH_SESSION_KEY = 'astrogallery_auth';

function setAdmin(value) {
  state.isAdmin = value;
  document.body.classList.toggle('is-admin', value);
  updateModeSwitchBtn();
}

function updateModeSwitchBtn() {
  const btn = document.getElementById('mode-switch-btn');
  if (!btn) return;
  btn.style.display = state.isAuthorized ? '' : 'none';
  btn.textContent   = state.isAdmin ? '● VISTA OSPITE' : '● VISTA ADMIN';
}

function initAuth() {
  const params = new URLSearchParams(window.location.search);
  const secret = params.get('gestione');

  if (secret) {
    state.isAuthorized = true;
    sessionStorage.setItem(AUTH_SESSION_KEY, '1');
    history.replaceState({}, '', window.location.pathname); // rimuove ?gestione= dall'URL
    setAdmin(true);
  } else if (sessionStorage.getItem(AUTH_SESSION_KEY)) {
    state.isAuthorized = true;
    setAdmin(true);
  }
  // nessun parametro → ospite, nessuna azione
}

function initModeSwitch() {
  const btn = document.getElementById('mode-switch-btn');
  if (!btn) return;
  btn.addEventListener('click', () => setAdmin(!state.isAdmin));
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', resize);

// ── Coordinate display ────────────────────────────────────────────────────────
function updateCoordsDisplay(mx, my) {
  const { ra, dec } = c2s(unproject(mx, my));
  const raH  = Math.floor(ra / 15);
  const raM  = Math.floor((ra / 15 - raH) * 60);
  const sign = dec >= 0 ? '+' : '−';
  const dD   = Math.floor(Math.abs(dec));
  const dM   = Math.floor((Math.abs(dec) - dD) * 60);
  document.getElementById('ra-disp').textContent  =
    `AR ${String(raH).padStart(2,'0')}h ${String(raM).padStart(2,'0')}m`;
  document.getElementById('dec-disp').textContent =
    `Dec ${sign}${String(dD).padStart(2,'0')}° ${String(dM).padStart(2,'0')}'`;
}

// ── Interazione mouse ─────────────────────────────────────────────────────────
// ── Costanti inerzia + snap ───────────────────────────────────────────────────
const DAMPING          = 0.92;   // smorzamento per frame
const STOP_THRESHOLD   = 0.003;  // deg/frame sotto cui l'inerzia si ferma
const VEL_SAMPLES      = 6;      // campioni per la media della velocità
const SNAP_R_INERTIA   = 12;     // gradi — raggio snap post-inerzia
const SNAP_R_STATIC    = 5;      // gradi — raggio snap stop statico
const SNAP_LERP        = 0.05;   // fattore lerp costante → convergenza esponenziale naturale
const SNAP_DONE_THRESH = 0.05;   // gradi — distanza per dichiarare snap completato
const STATIC_DELAY_MS  = 350;    // ms di fermo prima di attivare snap statico
const MAX_VEL          = 3;      // deg/frame — cap velocità iniziale

let velocityBuffer  = [];        // [{dRA, dDec, dt}]
let prevDragPos     = null;
let lastMoveTime    = 0;
let staticSnapTimer = null;

// ── Helpers snap ──────────────────────────────────────────────────────────────
function angularDist(ra1, dec1, ra2, dec2) {
  const v1 = s2c(ra1, dec1), v2 = s2c(ra2, dec2);
  return Math.acos(Math.max(-1, Math.min(1, v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2]))) * R2D;
}

function findSnapTarget(ra, dec, radiusDeg) {
  let best = null, bestDist = Infinity;
  for (const obj of state.allObjects) {
    const d = angularDist(ra, dec, obj.ra, obj.dec);
    if (d < radiusDeg && d < bestDist) { best = obj; bestDist = d; }
  }
  return best;
}

// ── Loop inerzia + snap ───────────────────────────────────────────────────────
function inertiaLoop() {
  if (!state.inertia.active) return;

  if (state.snapTarget) {
    // ── Modalità snap: lerp diretto, nessuna forza sulla velocità ────────────
    // Il lerp evita oscillazioni del sistema molla sottosmorzato.
    let dRA = state.snapTarget.ra - state.viewRA;
    if (dRA >  180) dRA -= 360;
    if (dRA < -180) dRA += 360;
    const dDec = state.snapTarget.dec - state.viewDec;
    const dist = Math.hypot(dRA, dDec);

    if (dist < SNAP_DONE_THRESH) {
      state.viewRA         = state.snapTarget.ra;
      state.viewDec        = state.snapTarget.dec;
      state.inertia.vRA    = 0;
      state.inertia.vDec   = 0;
      state.inertia.active = false;
      state.snapTarget     = null;
      state.snapPhase      = 'none';
      scheduleRender();
      return;
    }

    // Lerp a fattore costante → avanzamento percentuale fisso per frame
    // → la vista decelera naturalmente man mano che si avvicina al target (esponenziale)
    state.viewRA  = ((state.viewRA  + dRA  * SNAP_LERP) + 360) % 360;
    state.viewDec = Math.max(-89.5, Math.min(89.5, state.viewDec + dDec * SNAP_LERP));
    // Smorzamento della velocità residua durante snap
    state.inertia.vRA  *= 0.80;
    state.inertia.vDec *= 0.80;

  } else {
    // ── Modalità inerzia pura ─────────────────────────────────────────────────
    state.viewRA  = ((state.viewRA  + state.inertia.vRA)  + 360) % 360;
    state.viewDec = Math.max(-89.5, Math.min(89.5, state.viewDec + state.inertia.vDec));
    state.inertia.vRA  *= DAMPING;
    state.inertia.vDec *= DAMPING;

    const speed = Math.hypot(state.inertia.vRA, state.inertia.vDec);
    if (speed < STOP_THRESHOLD) {
      state.inertia.active = false;
      clearTimeout(staticSnapTimer);
      staticSnapTimer = setTimeout(checkStaticSnap, STATIC_DELAY_MS);
      scheduleRender();
      return;
    }
  }

  scheduleRender();
  requestAnimationFrame(inertiaLoop);
}

function startInertia() {
  const totalDt  = velocityBuffer.reduce((s, v) => s + v.dt,   0);
  // spostamento totale / tempo totale = velocità media corretta in deg/ms
  const totalRA  = velocityBuffer.reduce((s, v) => s + v.dRA,  0);
  const totalDec = velocityBuffer.reduce((s, v) => s + v.dDec, 0);
  if (totalDt < 1) return;

  const FRAME = 16.67; // ms @ 60fps  →  deg/ms * ms/frame = deg/frame
  state.inertia.vRA  = Math.max(-MAX_VEL, Math.min(MAX_VEL, (totalRA  / totalDt) * FRAME));
  state.inertia.vDec = Math.max(-MAX_VEL, Math.min(MAX_VEL, (totalDec / totalDt) * FRAME));

  const speed = Math.hypot(state.inertia.vRA, state.inertia.vDec);
  if (speed < STOP_THRESHOLD) return;

  // Stima posizione di stop (serie geometrica: Σ v*k^n = v * k/(1-k))
  const K = DAMPING / (1 - DAMPING);
  const estRA  = ((state.viewRA  + state.inertia.vRA  * K) + 3600) % 360;
  const estDec = Math.max(-89.5, Math.min(89.5, state.viewDec + state.inertia.vDec * K));

  const target = findSnapTarget(estRA, estDec, SNAP_R_INERTIA);
  if (target) {
    state.snapTarget = target;
    state.snapPhase  = 'snapping';
  }

  state.inertia.active = true;
  requestAnimationFrame(inertiaLoop);
}

function checkStaticSnap() {
  if (dragging || state.inertia.active || state.lbObject) return;
  const target = findSnapTarget(state.viewRA, state.viewDec, SNAP_R_STATIC);
  if (target) {
    state.snapTarget     = target;
    state.snapPhase      = 'snapping';
    state.inertia.vRA    = 0;
    state.inertia.vDec   = 0;
    state.inertia.active = true;
    requestAnimationFrame(inertiaLoop);
  }
}

// ── Interazione mouse ─────────────────────────────────────────────────────────
let dragging       = false;
let dragStart      = null;
let dragViewStart  = null;
let mouseHasMoved  = false;
let popupTimer     = null;
let canvasMouseDown = false; // true solo se il mousedown è partito dal canvas

canvas.addEventListener('mousedown', e => {
  if (state.lbObject) return;
  canvasMouseDown = true;
  // Interrompi qualsiasi inerzia o snap in corso
  state.inertia.active = false;
  state.snapTarget     = null;
  state.snapPhase      = 'none';
  clearTimeout(staticSnapTimer);

  dragging      = true;
  mouseHasMoved = false;
  dragStart     = { x: e.clientX, y: e.clientY };
  dragViewStart = { ra: state.viewRA, dec: state.viewDec };
  velocityBuffer = [];
  prevDragPos   = null;
  lastMoveTime  = performance.now();
  document.body.classList.add('dragging');
});

canvas.addEventListener('mousemove', e => {
  if (state.lbObject) return;
  updateCoordsDisplay(e.clientX, e.clientY);

  if (dragging) {
    if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 4) {
      mouseHasMoved = true;

      // Tracking velocità per inerzia
      const now = performance.now();
      const dt  = now - lastMoveTime;
      if (prevDragPos && dt > 0) {
        const cosD = Math.max(0.015, Math.abs(Math.cos(state.viewDec * D2R)));
        velocityBuffer.push({
          dRA:  (e.clientX - prevDragPos.x) / state.scale * R2D / cosD,
          dDec: (e.clientY - prevDragPos.y) / state.scale * R2D,
          dt,
        });
        if (velocityBuffer.length > VEL_SAMPLES) velocityBuffer.shift();
      }
      prevDragPos  = { x: e.clientX, y: e.clientY };
      lastMoveTime = now;

      applyDrag(e.clientX, e.clientY);
    }
    return;
  }

  // Hit detection DSO
  const prev = state.hoveredDSO;
  state.hoveredDSO = null;

  for (const obj of state.allObjects) {
    const p = project(obj.ra, obj.dec);
    if (!p) continue;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 18) {
      state.hoveredDSO = obj;
      break;
    }
  }

  if (state.hoveredDSO !== prev) {
    if (state.hoveredDSO) {
      clearTimeout(popupTimer);
      const mx = e.clientX, my = e.clientY;
      popupTimer = setTimeout(() => showPopup(state.hoveredDSO, mx, my), 140);
      state._animActive = true;
      scheduleRender();
    } else {
      clearTimeout(popupTimer);
      scheduleHide();
    }
    scheduleRender();
  }
});

window.addEventListener('mouseup', e => {
  // Click pulito sul canvas con pannello admin aperto → inietta coordinate
  // canvasMouseDown garantisce che il click sia partito dal canvas e non da un campo form
  if (canvasMouseDown && !mouseHasMoved && state.adminOpen && !state.lbObject) {
    const tabAdd = document.getElementById('tab-add');
    if (tabAdd && tabAdd.style.display !== 'none') {
      const { ra, dec } = c2s(unproject(e.clientX, e.clientY));
      const hms = raToHMSParts(ra);
      const dms = declToDMSParts(dec);
      const set = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('input')); } };
      set('f-ra-h', hms.h); set('f-ra-m', hms.m); set('f-ra-s', hms.s);
      document.getElementById('f-dec-sign').value = dms.sign;
      set('f-dec-d', dms.d); set('f-dec-m', dms.m); set('f-dec-s', dms.s);
    }
  }

  // Inerzia + snap (solo se il click è partito dal canvas)
  if (canvasMouseDown && !state.lbObject) {
    if (mouseHasMoved && velocityBuffer.length > 0) {
      startInertia();
    } else if (!mouseHasMoved && !state.adminOpen) {
      clearTimeout(staticSnapTimer);
      staticSnapTimer = setTimeout(checkStaticSnap, STATIC_DELAY_MS);
    }
  }

  canvasMouseDown = false;
  dragging        = false;
  prevDragPos    = null;
  velocityBuffer = [];
  document.body.classList.remove('dragging');
});

// Zoom rotella
canvas.addEventListener('wheel', e => {
  if (state.lbObject) return;
  e.preventDefault();
  state.fov = Math.max(1, Math.min(120, state.fov * (e.deltaY > 0 ? 1.09 : 0.92)));
  scheduleRender();
}, { passive: false });

// ── Touch ─────────────────────────────────────────────────────────────────────
let lastPinchDist = 0;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    // Interrompi inerzia in corso
    state.inertia.active = false;
    state.snapTarget     = null;
    state.snapPhase      = 'none';
    clearTimeout(staticSnapTimer);

    dragging      = true;
    mouseHasMoved = false;
    dragStart     = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    dragViewStart = { ra: state.viewRA, dec: state.viewDec };
    velocityBuffer = [];
    prevDragPos   = null;
    lastMoveTime  = performance.now();
  } else if (e.touches.length === 2) {
    dragging       = false;
    lastPinchDist  = pinchDist(e.touches);
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && dragging) {
    const tx = e.touches[0].clientX, ty = e.touches[0].clientY;

    if (Math.hypot(tx - dragStart.x, ty - dragStart.y) > 4) {
      mouseHasMoved = true;

      // Tracking velocità
      const now = performance.now();
      const dt  = now - lastMoveTime;
      if (prevDragPos && dt > 0) {
        const cosD = Math.max(0.015, Math.abs(Math.cos(state.viewDec * D2R)));
        velocityBuffer.push({
          dRA:  (tx - prevDragPos.x) / state.scale * R2D / cosD,
          dDec: (ty - prevDragPos.y) / state.scale * R2D,
          dt,
        });
        if (velocityBuffer.length > VEL_SAMPLES) velocityBuffer.shift();
      }
      prevDragPos  = { x: tx, y: ty };
      lastMoveTime = now;
    }

    applyDrag(tx, ty);
  } else if (e.touches.length === 2) {
    const d   = pinchDist(e.touches);
    state.fov = Math.max(1, Math.min(120, state.fov * (lastPinchDist / d)));
    lastPinchDist = d;
    scheduleRender();
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (e.touches.length === 0) {
    if (dragging && mouseHasMoved && velocityBuffer.length > 0 && !state.lbObject) {
      startInertia();
    } else if (dragging && !mouseHasMoved && !state.lbObject) {
      // Tap: hit detection DSO (raggio 24px per compensare imprecisione del dito)
      const t = e.changedTouches[0];
      for (const obj of state.allObjects) {
        const p = project(obj.ra, obj.dec);
        if (!p) continue;
        if (Math.hypot(t.clientX - p.x, t.clientY - p.y) < 24) {
          showPopup(obj, t.clientX, t.clientY, true);
          state._animActive = true;
          scheduleRender();
          break;
        }
      }
    }
    dragging       = false;
    prevDragPos    = null;
    velocityBuffer = [];
  }
});

function pinchDist(touches) {
  return Math.hypot(
    touches[1].clientX - touches[0].clientX,
    touches[1].clientY - touches[0].clientY,
  );
}

// ── Pan ───────────────────────────────────────────────────────────────────────
function applyDrag(mx, my) {
  const dx   = mx - dragStart.x;
  const dy   = my - dragStart.y;
  const cosD = Math.max(0.015, Math.abs(Math.cos(dragViewStart.dec * D2R)));
  state.viewRA  = ((dragViewStart.ra  + dx / state.scale * R2D / cosD) + 360) % 360;
  state.viewDec = Math.max(-89.5, Math.min(89.5, dragViewStart.dec + dy / state.scale * R2D));
  scheduleRender();
}

// ── Tastiera ──────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (state.lbObject) {
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  navLB(-1);
    if (e.key === 'ArrowRight') navLB(+1);
    return;
  }
  if (e.key === 'Escape' && state.adminOpen) closeAdmin();
});

// ── Layers menu mobile ──────────────────────────────────────
const layersBtn    = document.getElementById('layers-btn');
const panelToggles = document.getElementById('panel-toggles');
if (layersBtn) {
  layersBtn.addEventListener('click', e => {
    e.stopPropagation();
    panelToggles.classList.toggle('mobile-open');
    layersBtn.classList.toggle('active');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#panel-toggles') && !e.target.closest('#layers-btn')) {
      panelToggles.classList.remove('mobile-open');
      layersBtn.classList.remove('active');
    }
  });
}

// ── Layer toggle ──────────────────────────────────────────────────────────────
[
  ['tog-lines',     () => { state.showConstLines = !state.showConstLines; }],
  ['tog-cnames',    () => { state.showConstNames = !state.showConstNames; startFade(); return; }],
  ['tog-snames',    () => { state.showStarNames  = !state.showStarNames;  startFade(); return; }],
  ['tog-crosshair', () => { state.showCrosshair  = !state.showCrosshair; }],
].forEach(([id, fn]) => {
  const el = document.getElementById(id);
  if (!el) return; // elemento non presente nell'HTML corrente
  el.addEventListener('click', function () {
    fn();
    this.classList.toggle('active');
    scheduleRender();
  });
});

// ── Popup autore ──────────────────────────────────────────────────────────────
function initAuthor() {
  const link      = document.getElementById('author-link');
  const popup     = document.getElementById('author-popup');
  const closeBtn  = document.getElementById('author-popup-close');
  const editBtn   = document.getElementById('author-edit-btn');
  const viewEl    = document.getElementById('author-view');
  const editEl    = document.getElementById('author-edit');
  const cancelBtn = document.getElementById('ae-cancel-btn');
  const saveBtn   = document.getElementById('ae-save-btn');
  const addLinkBtn= document.getElementById('ae-add-link');
  if (!link || !popup) return;

  let authorData = {};
  let loaded = false;

  function isEditing() { return editEl.classList.contains('active'); }

  // ── Carica author.json ───────────────────────────────────────────────────────
  async function loadAuthor() {
    if (loaded) return;
    try {
      const res = await fetch('./data/author.json', { cache: 'no-cache' });
      if (res.ok) authorData = await res.json();
    } catch (e) { /* file non trovato, partiamo vuoti */ }
    loaded = true;
    renderView();
  }

  // ── Vista lettura ─────────────────────────────────────────────────────────────
  function renderView() {
    const d = authorData;
    const photo = document.getElementById('author-photo');
    if (d.photo) { photo.src = d.photo; photo.style.display = ''; }
    else photo.style.display = 'none';

    document.getElementById('author-name').textContent     = d.name     || '';
    document.getElementById('author-location').textContent = d.location || '';
    document.getElementById('author-bio').textContent      = d.bio      || '';

    const det = document.getElementById('author-details');
    det.innerHTML = '';
    if (d.experience) det.innerHTML += `<div><span class="ad-label">Esperienza</span>${d.experience.replace(/\n/g,'<br>')}</div>`;
    if (d.equipment)  det.innerHTML += `<div><span class="ad-label">Setup</span>${d.equipment.replace(/\n/g,'<br>')}</div>`;
    det.style.display = (d.experience || d.equipment) ? '' : 'none';

    const linksEl = document.getElementById('author-links');
    linksEl.innerHTML = '';
    (d.links || []).forEach(l => {
      const a = document.createElement('a');
      a.href = l.url; a.textContent = l.label;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      linksEl.appendChild(a);
    });
    linksEl.style.display = (d.links && d.links.length) ? '' : 'none';
  }

  // ── Apri modifica ─────────────────────────────────────────────────────────────
  function openEdit() {
    const d = authorData;
    document.getElementById('ae-photo').value      = d.photo      || '';
    document.getElementById('ae-name').value       = d.name       || '';
    document.getElementById('ae-location').value   = d.location   || '';
    document.getElementById('ae-bio').value        = d.bio        || '';
    document.getElementById('ae-experience').value = d.experience || '';
    document.getElementById('ae-equipment').value  = d.equipment  || '';

    const list = document.getElementById('ae-links-list');
    list.innerHTML = '';
    (d.links || []).forEach(l => addLinkRow(l.label, l.url));

    viewEl.classList.add('hidden');
    editEl.classList.add('active');
  }

  // ── Chiudi modifica (torna alla vista, popup resta aperto) ────────────────────
  function closeEdit() {
    editEl.classList.remove('active');
    viewEl.classList.remove('hidden');
  }

  // ── Riga link ─────────────────────────────────────────────────────────────────
  function addLinkRow(label = '', url = '') {
    const list = document.getElementById('ae-links-list');
    const row  = document.createElement('div');
    row.className = 'ae-link-row';
    row.innerHTML = `
      <input type="text"  placeholder="Etichetta" value="${label}" style="max-width:90px">
      <input type="text"  placeholder="https://..." value="${url}">
      <button title="Rimuovi">&#x2715;</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  // ── Salva e scarica JSON ──────────────────────────────────────────────────────
  function saveAuthor() {
    const rows  = document.querySelectorAll('.ae-link-row');
    const links = [];
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      const lbl    = inputs[0].value.trim();
      const url    = inputs[1].value.trim();
      if (lbl && url) links.push({ label: lbl, url });
    });

    authorData = {
      name:       document.getElementById('ae-name').value.trim(),
      photo:      document.getElementById('ae-photo').value.trim(),
      location:   document.getElementById('ae-location').value.trim(),
      bio:        document.getElementById('ae-bio').value.trim(),
      experience: document.getElementById('ae-experience').value.trim(),
      equipment:  document.getElementById('ae-equipment').value.trim(),
      links,
    };

    const blob = new Blob([JSON.stringify(authorData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'author.json'; a.click();
    URL.revokeObjectURL(url);

    renderView();
    closeEdit();
  }

  // ── Apertura programmatica (riusata dal click e dalla prima visita) ───────────
  async function openPopup() {
    await loadAuthor();
    popup.classList.add('visible');
  }

  // ── Event listeners ───────────────────────────────────────────────────────────
  link.addEventListener('click', async e => {
    e.stopPropagation();
    await loadAuthor();
    popup.classList.toggle('visible');
    if (!popup.classList.contains('visible')) closeEdit();
  });

  // ✕ in edit mode: torna alla vista senza chiudere il popup
  // ✕ in view mode: chiude il popup
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (isEditing()) { closeEdit(); }
    else             { popup.classList.remove('visible'); }
  });

  editBtn.addEventListener('click',    e => { e.stopPropagation(); openEdit(); });
  cancelBtn.addEventListener('click',  e => { e.stopPropagation(); closeEdit(); });
  saveBtn.addEventListener('click',    e => { e.stopPropagation(); saveAuthor(); });
  addLinkBtn.addEventListener('click', e => { e.stopPropagation(); addLinkRow(); });

  // Click esterno: chiude solo se NON siamo in edit mode
  document.addEventListener('click', e => {
    if (popup.classList.contains('visible') &&
        !popup.contains(e.target) &&
        e.target !== link &&
        !isEditing()) {
      popup.classList.remove('visible');
    }
  });

  return { openPopup };
}

// ── Init ──────────────────────────────────────────────────────────────────────
const BIO_SEEN_KEY = 'astrogallery_bio_seen';

initModeSwitch();
const author = initAuthor();
loadObjects().then(() => {
  initAdmin();
});
loadData().then(() => {
  resize();
  setTimeout(initAuth, 1700);

  // Prima visita su questo dispositivo: mostra la bio una sola volta
  if (author && !localStorage.getItem(BIO_SEEN_KEY)) {
    localStorage.setItem(BIO_SEEN_KEY, '1');
    setTimeout(() => author.openPopup(), 1700);
  }
});
