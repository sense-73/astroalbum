// ─── Popup DSO (hover) e Lightbox (galleria fullscreen) ──────────────────────
import { state } from './state.js';
import { project, scheduleRender } from './starmap.js';
import { R2D } from './math.js';

// ── Popup ─────────────────────────────────────────────────────────────────────
const popup = document.getElementById('popup');
let hideTimer = null;

export function showPopup(obj, mx, my, fromTouch = false) {
  clearTimeout(hideTimer);

  // Header
  document.getElementById('popup-name').textContent = `${obj.id} — ${obj.name}`;
  const rH  = Math.floor(obj.ra / 15);
  const rM  = Math.floor((obj.ra / 15 - rH) * 60);
  const ds  = obj.dec >= 0 ? '+' : '−';
  document.getElementById('popup-meta').textContent =
    `${obj.type}  ·  AR ${rH}h ${String(rM).padStart(2,'0')}m  ${ds}${Math.abs(obj.dec).toFixed(1)}°`;

  // Griglia thumbnail 2×N
  const grid = document.getElementById('popup-grid');
  grid.innerHTML = '';
  (obj.photos || []).forEach((ph, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'popup-thumb';
    const img = document.createElement('img');
    img.src = ph.thumb; img.alt = `Foto ${i + 1}`; img.loading = 'lazy';
    const ov  = document.createElement('div'); ov.className  = 'tov';
    const idx = document.createElement('div'); idx.className = 'tidx';
    idx.textContent = `${i + 1}/${obj.photos.length}`;
    wrap.append(img, ov, idx);
    wrap.addEventListener('click', e => { e.stopPropagation(); openLightbox(obj, i); });
    grid.appendChild(wrap);
  });

  if (fromTouch) {
    popup.classList.add('popup-mobile');
    popup.style.left    = '';
    popup.style.top     = '';
    popup.style.display = 'block';
    requestAnimationFrame(() => popup.classList.add('visible'));

    setTimeout(() => {
      document.addEventListener('touchstart', function closeMobilePopup(e) {
        if (!popup.contains(e.target)) {
          hidePopup();
          document.removeEventListener('touchstart', closeMobilePopup);
        }
      });
    }, 50);
  } else {
    popup.classList.remove('popup-mobile');
    const p = project(obj.ra, obj.dec);
    positionPopup(p ? p.x : mx, p ? p.y : my);
    popup.style.display = 'block';
    requestAnimationFrame(() => popup.classList.add('visible'));
  }
}

function positionPopup(markerX, markerY) {
  const margin = 16, offset = 22;
  const popupH = popup.scrollHeight || 360;
  let x = markerX + offset;
  let y = markerY - popupH / 2;
  if (x + 280 > state.W - margin) x = markerX - 280 - offset;
  if (y < margin)                 y = margin;
  if (y + popupH > state.H - margin) y = state.H - margin - popupH;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';
}

export function hidePopup() {
  popup.classList.remove('visible');
  setTimeout(() => {
    if (!popup.classList.contains('visible')) {
      popup.style.display = 'none';
      popup.classList.remove('popup-mobile');
    }
  }, 220);
}

export function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!state.hoveredDSO && !state.isOverPopup) {
      hidePopup();
      state._animActive = false;
    }
  }, 180);
}

popup.addEventListener('mouseenter', () => { state.isOverPopup = true;  clearTimeout(hideTimer); });
popup.addEventListener('mouseleave', () => { state.isOverPopup = false; scheduleHide(); });

// ── Lightbox ──────────────────────────────────────────────────────────────────
const lightbox    = document.getElementById('lightbox');
const lbImg       = document.getElementById('lb-img');
const lbInfoPanel = document.getElementById('lb-info-panel');
const lbInfoTab   = document.getElementById('lb-info-tab');

// ── Watermark + CC popup ──────────────────────────────────────────────────────
const wmCanvas  = document.getElementById('lb-watermark');
const ccPopup   = document.getElementById('cc-popup');

// Precarica logo watermark
const wmImg = new Image();
wmImg.src = 'img/logo_watermark.png';

function drawWatermark() {
  if (!wmCanvas || !wmImg.complete || !wmImg.naturalWidth) return;
  if (!lbImg.naturalWidth || !lbImg.naturalHeight) return;

  const mainRect = wmCanvas.parentElement.getBoundingClientRect();
  const imgRect  = lbImg.getBoundingClientRect();

  // Calcola dimensioni reali foto con object-fit: contain
  const scaleX   = imgRect.width  / lbImg.naturalWidth;
  const scaleY   = imgRect.height / lbImg.naturalHeight;
  const scale    = Math.min(scaleX, scaleY);
  const rendW    = lbImg.naturalWidth  * scale;
  const rendH    = lbImg.naturalHeight * scale;

  // Bordi reali della foto dentro l'elemento img (centrata)
  const photoLeft   = imgRect.left   + (imgRect.width  - rendW) / 2;
  const photoBottom = imgRect.top    + (imgRect.height - rendH) / 2 + rendH;
  const photoRight  = photoLeft + rendW;

  // Dimensione watermark: 5% larghezza foto, max 60px
  const WM_W = Math.round(Math.max(45, Math.min(rendW * 0.07, 80)));
  const WM_H = Math.round(WM_W * wmImg.naturalHeight / wmImg.naturalWidth);
  const PAD  = 10;

  // Posizione relativa a lb-main
  const dpr   = window.devicePixelRatio || 1;
  wmCanvas.width  = WM_W * dpr;
  wmCanvas.height = WM_H * dpr;
  wmCanvas.style.width  = WM_W + 'px';
  wmCanvas.style.height = WM_H + 'px';
  wmCanvas.style.right  = (mainRect.right  - photoRight  + PAD) + 'px';
  wmCanvas.style.bottom = (mainRect.bottom - photoBottom + PAD) + 'px';

  const ctx = wmCanvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, WM_W, WM_H);
  ctx.globalAlpha = 0.50;
  ctx.drawImage(wmImg, 0, 0, WM_W, WM_H);
  ctx.globalAlpha = 1;
}

// Right-click → popup CC BY
lbImg.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!ccPopup) return;
  const main   = lbImg.parentElement.getBoundingClientRect();
  const x      = Math.min(e.clientX - main.left, main.width  - 240);
  const y      = Math.min(e.clientY - main.top,  main.height - 120);
  ccPopup.style.left = Math.max(8, x) + 'px';
  ccPopup.style.top  = Math.max(8, y) + 'px';
  ccPopup.classList.add('visible');
});

// Long press mobile → popup CC BY
let lpTimer = null;
lbImg.addEventListener('touchstart', e => {
  lpTimer = setTimeout(() => {
    e.preventDefault();
    if (!ccPopup) return;
    const touch  = e.touches[0];
    const main   = lbImg.parentElement.getBoundingClientRect();
    const x      = Math.min(touch.clientX - main.left, main.width  - 240);
    const y      = Math.min(touch.clientY - main.top,  main.height - 120);
    ccPopup.style.left = Math.max(8, x) + 'px';
    ccPopup.style.top  = Math.max(8, y) + 'px';
    ccPopup.classList.add('visible');
  }, 500);
}, { passive: true });

lbImg.addEventListener('touchend',   () => clearTimeout(lpTimer));
lbImg.addEventListener('touchmove',  () => clearTimeout(lpTimer));

document.getElementById('cc-popup-close')?.addEventListener('click', e => {
  e.stopPropagation(); ccPopup.classList.remove('visible');
});

document.addEventListener('click', e => {
  if (ccPopup && !ccPopup.contains(e.target)) ccPopup.classList.remove('visible');
});

// Ridisegna watermark al resize
window.addEventListener('resize', drawWatermark);

// ── Stato zoom ────────────────────────────────────────────────────────────────
const zoom = {
  scale: 1,
  x: 0, y: 0,          // offset traslazione (px)
  dragging: false,
  startX: 0, startY: 0,
  originX: 0, originY: 0,
  MIN: 1, MAX: 8,
};

function applyZoom() {
  if (!lbImg) return;
  lbImg.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
  lbImg.classList.toggle('zoomed', zoom.scale > 1);

  const ind = document.getElementById('lb-zoom-indicator');
  const lbl = document.getElementById('lb-zoom-label');
  if (ind && lbl) {
    lbl.textContent = Math.round(zoom.scale * 100) + '%';
    ind.classList.toggle('visible', zoom.scale > 1);
  }
}

function resetZoom() {
  zoom.scale = 1; zoom.x = 0; zoom.y = 0;
  if (lbImg) lbImg.style.transition = 'transform .25s ease, opacity .35s ease';
  applyZoom();
  setTimeout(() => { if (lbImg) lbImg.style.transition = 'opacity .35s ease'; }, 260);
}

// Clamp traslazione in modo che la foto non esca dal contenitore
function clampTranslation() {
  if (!lbImg) return;
  const rect   = lbImg.getBoundingClientRect();
  const parent = lbImg.parentElement.getBoundingClientRect();
  // Margine massimo consentito: metà della dimensione scalata meno metà contenitore
  const maxX = Math.max(0, (rect.width  - parent.width)  / 2);
  const maxY = Math.max(0, (rect.height - parent.height) / 2);
  zoom.x = Math.max(-maxX, Math.min(maxX, zoom.x));
  zoom.y = Math.max(-maxY, Math.min(maxY, zoom.y));
}

// Zoom centrato sul punto (clientX, clientY)
function zoomAt(clientX, clientY, factor) {
  if (!lbImg) return;
  const rect    = lbImg.parentElement.getBoundingClientRect();
  const cx      = clientX - rect.left - rect.width  / 2;
  const cy      = clientY - rect.top  - rect.height / 2;
  const prevScale = zoom.scale;
  zoom.scale = Math.max(zoom.MIN, Math.min(zoom.MAX, zoom.scale * factor));
  const ratio  = zoom.scale / prevScale;
  zoom.x = cx + (zoom.x - cx) * ratio;
  zoom.y = cy + (zoom.y - cy) * ratio;
  clampTranslation();
  applyZoom();
}

// ── Inizializza eventi zoom sul lightbox ──────────────────────────────────────
function initZoom() {
  if (!lbImg) return;
  const main = document.getElementById('lb-main');

  // Wheel → zoom (non intercettare se si è sul pannello info)
  main.addEventListener('wheel', e => {
    if (e.target.closest('#lb-info-panel')) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }, { passive: false });

  // Doppio click → reset oppure zoom 2x
  lbImg.addEventListener('dblclick', e => {
    if (zoom.scale > 1) { resetZoom(); }
    else                { zoomAt(e.clientX, e.clientY, 2.5); }
  });

  // Mouse drag → pan
  lbImg.addEventListener('mousedown', e => {
    if (zoom.scale <= 1) return;
    e.preventDefault();
    zoom.dragging = true;
    zoom.startX   = e.clientX - zoom.x;
    zoom.startY   = e.clientY - zoom.y;
    lbImg.classList.add('panning');
  });

  window.addEventListener('mousemove', e => {
    if (!zoom.dragging) return;
    zoom.x = e.clientX - zoom.startX;
    zoom.y = e.clientY - zoom.startY;
    clampTranslation();
    applyZoom();
  });

  window.addEventListener('mouseup', () => {
    if (!zoom.dragging) return;
    zoom.dragging = false;
    if (lbImg) lbImg.classList.remove('panning');
  });

  // Touch: pinch zoom + pan + swipe orizzontale per navigare foto
  let lastTouches  = null;
  let swipeStartX  = 0;
  let swipeStartY  = 0;

  main.addEventListener('touchstart', e => {
    lastTouches = e.touches;
    if (e.touches.length === 1) {
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  main.addEventListener('touchmove', e => {
    if (e.target.closest('#lb-info-panel')) return;
    if (e.touches.length === 2 && lastTouches?.length === 2) {
      e.preventDefault();
      const prevDist = Math.hypot(
        lastTouches[0].clientX - lastTouches[1].clientX,
        lastTouches[0].clientY - lastTouches[1].clientY);
      const currDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomAt(midX, midY, currDist / prevDist);
    } else if (e.touches.length === 1 && zoom.scale > 1) {
      e.preventDefault();
      if (lastTouches?.length === 1) {
        zoom.x += e.touches[0].clientX - lastTouches[0].clientX;
        zoom.y += e.touches[0].clientY - lastTouches[0].clientY;
        clampTranslation();
        applyZoom();
      }
    }
    lastTouches = e.touches;
  }, { passive: false });

  main.addEventListener('touchend', e => {
    // Swipe orizzontale solo se zoom=1 e un solo dito
    if (zoom.scale > 1 || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      navLB(dx < 0 ? +1 : -1);
    }
  });

  // Reset button
  document.getElementById('lb-zoom-reset')?.addEventListener('click', resetZoom);
}


function setLbField(wrapperId, spanId, value, suffix = '') {
  const wrap = document.getElementById(wrapperId);
  const span = document.getElementById(spanId);
  if (!wrap || !span) return;
  if (value) {
    span.textContent = value + suffix;
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
}

export function openLightbox(obj, idx) {
  state.lbObject   = obj;
  state.lbIndex    = idx;
  state.lbInfoOpen = false;
  lbInfoPanel.classList.remove('open');

  // Popola info DSO (sempre visibili nel pannello)
  document.getElementById('lb-obj-name').textContent = `${obj.id} — ${obj.name}`;
  document.getElementById('li-type').textContent  = obj.type || '—';
  document.getElementById('li-dist').textContent  = obj.distance || '—';
  document.getElementById('li-mag').textContent   = obj.magnitude != null ? obj.magnitude : '—';
  const rH = Math.floor(obj.ra / 15), rM = Math.floor((obj.ra / 15 - rH) * 60);
  document.getElementById('li-ra').textContent    = `${rH}h ${String(rM).padStart(2,'0')}m`;
  document.getElementById('li-dec').textContent   = `${obj.dec >= 0 ? '+' : '−'}${Math.abs(obj.dec).toFixed(2)}°`;
  document.getElementById('li-const').textContent = obj.constellation || '—';
  const infoText = document.getElementById('lb-info-text');
  infoText.style.display = obj.info ? '' : 'none';
  if (obj.info) {
    // Converte [testo](url) in link cliccabili, escape del resto per sicurezza
    const html = obj.info
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="info-link">$1</a>');
    infoText.innerHTML = html;
  } else {
    infoText.innerHTML = '';
  }

  lightbox.style.display = 'flex';
  requestAnimationFrame(() => lightbox.classList.add('visible'));

  hidePopup();
  state.hoveredDSO  = null;
  state._animActive = false;
  document.body.classList.add('popup-cursor');

  updateLB();
}

export function closeLightbox() {
  lightbox.classList.remove('visible');
  setTimeout(() => lightbox.style.display = 'none', 320);
  document.body.classList.remove('popup-cursor');
  lbInfoPanel.classList.remove('open');
  state.lbObject = null;
}

export function navLB(delta) {
  if (!state.lbObject) return;
  state.lbIndex = Math.max(0, Math.min(state.lbObject.photos.length - 1, state.lbIndex + delta));
  updateLB();
}

function updateLB() {
  if (!state.lbObject) return;
  const photos = state.lbObject.photos || [];
  const ph     = photos[state.lbIndex];

  // Reset zoom ad ogni cambio foto
  zoom.scale = 1; zoom.x = 0; zoom.y = 0;
  if (lbImg) { lbImg.style.transition = 'opacity .35s ease'; lbImg.style.transform = ''; }

  // Counter
  document.getElementById('lb-counter').textContent =
    `${state.lbIndex + 1} / ${photos.length}`;

  // Nav buttons
  document.getElementById('lb-prev').disabled = (state.lbIndex === 0);
  document.getElementById('lb-next').disabled = (state.lbIndex === photos.length - 1);

  // Dots
  const dotsEl = document.getElementById('lb-nav-dots');
  dotsEl.innerHTML = '';
  const maxDots = 12;
  if (photos.length > 1 && photos.length <= maxDots) {
    photos.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'lb-dot' + (i === state.lbIndex ? ' active' : '');
      d.addEventListener('click', () => { state.lbIndex = i; updateLB(); });
      dotsEl.appendChild(d);
    });
  }

  // Foto
  lbImg.classList.remove('loaded');
  lbImg.onload = () => { lbImg.classList.add('loaded'); drawWatermark(); };
  lbImg.src = ph ? ph.full : '';

  // Info foto nel pannello laterale
  const photoSection = document.getElementById('lbi-photo-section');
  const acqSection   = document.getElementById('lbi-acq-section');

  if (!ph) { photoSection.style.display = 'none'; acqSection.style.display = 'none'; return; }

  // Sezione foto
  photoSection.style.display = '';
  document.getElementById('li-ph-title').textContent = ph.title || '—';

  const dateWrap = document.getElementById('li-ph-date-wrap');
  if (ph.date) {
    document.getElementById('li-ph-date').textContent = ph.date;
    dateWrap.style.display = '';
  } else {
    dateWrap.style.display = 'none';
  }

  const commentEl = document.getElementById('li-ph-comment');
  if (ph.comment) {
    const html = ph.comment
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="info-link">$1</a>');
    commentEl.innerHTML = html;
    commentEl.style.display = '';
  } else {
    commentEl.innerHTML = '';
    commentEl.style.display = 'none';
  }

  // Sezione acquisizione
  const acq = ph.acquisition;
  const hasAcq = acq && Object.values(acq).some(v => v !== '' && v !== null && v !== undefined);
  acqSection.style.display = hasAcq ? '' : 'none';

  if (hasAcq) {
    setLbField('li-acq-telescope-w', 'li-acq-telescope', acq.telescope);
    setLbField('li-acq-mount-w',     'li-acq-mount',     acq.mount);
    setLbField('li-acq-camera-w',    'li-acq-camera',    acq.camera);
    setLbField('li-acq-filters-w',   'li-acq-filters',   acq.filters);
    setLbField('li-acq-frames-w',    'li-acq-frames',    acq.frames,   ' pose');
    setLbField('li-acq-exposure-w',  'li-acq-exposure',  acq.exposure, 's');
    setLbField('li-acq-gain-w',      'li-acq-gain',      acq.gain);
    setLbField('li-acq-temp-w',      'li-acq-temp',      acq.temp,     '°C');
    const notesEl = document.getElementById('li-acq-notes');
    if (acq.notes) { notesEl.textContent = acq.notes; notesEl.style.display = ''; }
    else           { notesEl.style.display = 'none'; }
  }
}

// ── Pulsanti lightbox ─────────────────────────────────────────────────────────
initZoom();

if (lbInfoTab) {
  lbInfoTab.addEventListener('click', () => {
    state.lbInfoOpen = !state.lbInfoOpen;
    if (lbInfoPanel) lbInfoPanel.classList.toggle('open', state.lbInfoOpen);
  });
}

document.getElementById('lb-close')?.addEventListener('click', closeLightbox);
document.getElementById('lb-prev')?.addEventListener('click', () => navLB(-1));
document.getElementById('lb-next')?.addEventListener('click', () => navLB(+1));
