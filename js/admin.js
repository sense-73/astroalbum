// ─── Pannello Admin ───────────────────────────────────────────────────────────
import { state }           from './state.js';
import { scheduleRender, flyToObject } from './starmap.js';
import { saveObjects }     from './data.js';
import { openLightbox }    from './dso.js';
import { escHtml, hmsToRa, dmsToDecl, raToHMSParts, declToDMSParts, sha256 } from './math.js';
import { dsoDatabase }     from './database.js';

const adminPanel = document.getElementById('admin-panel');
const adminBtn   = document.getElementById('admin-btn');

export function openAdmin() {
  state.adminOpen = true;
  adminPanel.classList.add('open');
  adminBtn.classList.add('open');
}
export function closeAdmin() {
  state.adminOpen = false;
  adminPanel.classList.remove('open');
  adminBtn.classList.remove('open');
}

// ── Cloudinary ────────────────────────────────────────────────────────────────
const CLD_CLOUD  = 'dutqdpc2a';
const CLD_PRESET  = 'astrogallery';
const CLD_API_KEY  = '321241524137141';  // ← sostituisci con la tua API Key Cloudinary

// ── Lookup database DSO ────────────────────────────────────────────────────────
const _dsoLookup = new Map();
for (const obj of dsoDatabase) {
  _dsoLookup.set(obj.id, obj);
  const k = obj.name.toLowerCase().replace(/[\s\-\/]/g, '');
  if (k !== obj.id) _dsoLookup.set(k, obj);
}

// ── Costellazioni per id DSO ───────────────────────────────────────────────────
const _dsoConst = {
  m1:'Toro', m3:'Cani da Caccia', m4:'Scorpione', m8:'Sagittario',
  m11:'Scudo', m13:'Ercole', m16:'Serpente', m17:'Sagittario',
  m20:'Sagittario', m27:'Volpetta', m31:'Andromeda', m33:'Triangolo',
  m42:'Orione', m43:'Orione', m45:'Toro', m51:'Cani da Caccia',
  m57:'Lira', m63:'Cani da Caccia', m64:'Chioma di Berenice',
  m74:'Pesci', m78:'Orione', m81:'Orsa Maggiore', m82:'Orsa Maggiore',
  m97:'Orsa Maggiore', m101:'Orsa Maggiore', m104:'Vergine',
  m106:'Cani da Caccia', m65:'Leone', m66:'Leone', m76:'Perseo',
  m83:'Idra', m92:'Ercole', m15:'Pegaso', m22:'Sagittario',
  m44:'Cancro', m35:'Gemelli', m6:'Scorpione', m7:'Scorpione',
  ic1805:'Cassiopea', ic1848:'Cassiopea', ic1396:'Cefeo',
  ic5070:'Cigno', ic434:'Orione', ic410:'Auriga', ic5146:'Cigno',
  ic2177:'Unicorno', ngc7000:'Cigno', ngc2244:'Unicorno', ngc6888:'Cigno',
  ngc6960:'Cigno', ngc6992:'Cigno', ngc7293:'Acquario',
  ngc1499:'Perseo', ngc281:'Cassiopea', ngc869:'Perseo',
  ngc5907:'Dragone', ngc5092:'Vergine', ngc891:'Andromeda',
  ngc7331:'Pegaso', ngc4565:'Chioma di Berenice', ngc253:'Scultore',
  ngc2359:'Cane Maggiore', ngc2264:'Unicorno', ngc6334:'Scorpione',
  ngc6357:'Scorpione', ngc7380:'Cefeo', ngc7023:'Cefeo',
  ngc6946:'Cigno', ngc2403:'Giraffa', ngc4038:'Corvo',
  ngc3372:'Carena', ngc2070:'Dorado', ngc5139:'Centauro',
  ngc5128:'Centauro', ngc3628:'Leone', ngc4631:'Cani da Caccia',
  ngc6543:'Dragone', ngc2392:'Gemelli', ngc3242:'Idra',
  ngc2174:'Orione', lmc:'Dorado', smc:'Tucana',
  markarian:'Vergine', stephan:'Pegaso',
  'sh2-155':'Cefeo', 'sh2-240':'Toro', 'sh2-308':'Cane Maggiore',
  'sh2-101':'Cigno', ou4:'Cefeo',
};

// ── File System Access API ─────────────────────────────────────────────────────
let _fileHandle = null;

function _openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('astrogallery_fs', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = reject;
  });
}
async function _loadFileHandle() {
  try {
    const db  = await _openHandleDB();
    const tx  = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('catalog');
    await new Promise(r => { req.onsuccess = req.onerror = r; });
    if (!req.result) return;
    const perm = await req.result.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') { _fileHandle = req.result; return; }
    if (perm === 'prompt') {
      const asked = await req.result.requestPermission({ mode: 'readwrite' });
      if (asked === 'granted') _fileHandle = req.result;
    }
  } catch (e) { /* ignora */ }
}
async function _saveFileHandle(handle) {
  try {
    const db = await _openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'catalog');
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
  } catch (e) { /* ignora */ }
}
async function _writeCatalog() {
  if (!_fileHandle) return false;
  try {
    const writable = await _fileHandle.createWritable();
    await writable.write(JSON.stringify(state.allObjects, null, 2));
    await writable.close();
    return true;
  } catch (e) { _fileHandle = null; return false; }
}
export async function saveObjectsToFile() {
  if (_fileHandle) { if (await _writeCatalog()) return; }
  try {
    _fileHandle = await window.showSaveFilePicker({
      suggestedName: 'objects.json',
      startIn: 'documents',
      types: [{ description: 'Catalogo AstroGallery', accept: { 'application/json': ['.json'] } }],
    });
    await _saveFileHandle(_fileHandle);
    await _writeCatalog();
  } catch (e) { if (e.name !== 'AbortError') console.warn('showSaveFilePicker:', e); }
}

function makeThumb(url) {
  const m = url.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)/);
  return m ? `${m[1]}w_320,h_240,c_fill/${m[2]}` : url;
}

// URL e thumb della foto appena caricata (temporanee, usate al submit)
let _pendingPhoto = null;

// ── Upload con compressione adattiva PNG→JPEG ─────────────────────────────────
const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024; // 9.5 MB — margine di sicurezza

let _fileInput = null;

function getFileInput() {
  if (_fileInput) return _fileInput;
  _fileInput = document.createElement('input');
  _fileInput.type   = 'file';
  _fileInput.accept = 'image/png,image/jpeg,image/jpg,image/tiff,image/tif';
  _fileInput.style.display = 'none';
  document.body.appendChild(_fileInput);
  return _fileInput;
}

// Compressione adattiva: parte dalla qualità più alta e scende finché
// il file sta sotto la soglia. Garantisce sempre la minima compressione necessaria.
async function compressAdaptive(file, maxBytes) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload  = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Immagine non leggibile')); };
    i.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);

  // Prova da 0.95 a 0.60, step 0.05
  for (let q = 0.95; q >= 0.60; q = Math.round((q - 0.05) * 100) / 100) {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
    if (blob.size <= maxBytes) return { blob, quality: q };
  }
  // Estremo: 0.60 comunque (file troppo grande anche compresso)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.60));
  return { blob, quality: 0.60 };
}

async function uploadToCloudinary(blob, filename, folder) {
  const fd = new FormData();
  fd.append('file',          blob, filename);
  fd.append('upload_preset', CLD_PRESET);
  fd.append('folder',        folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`,
    { method: 'POST', body: fd }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function setUploadBtn(text, disabled) {
  const btn = document.getElementById('add-photo-btn');
  if (!btn) return;
  btn.textContent = text;
  btn.disabled    = disabled;
}

async function handlePhotoUpload(dsoId) {
  const input = getFileInput();
  _pendingPhoto = null;
  document.getElementById('ph-preview').style.display = 'none';
  input.onchange = null;
  input.value    = '';

  input.onchange = async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;

    setUploadBtn('Analisi…', true);
    try {
      let uploadBlob, uploadName, qualityUsed = null;

      const isPNG  = file.type === 'image/png';
      const isTIFF = file.type === 'image/tiff' || file.type === 'image/tif';
      const tooBig = file.size > MAX_UPLOAD_BYTES;

      if (isPNG || isTIFF || tooBig) {
        setUploadBtn('Compressione…', true);
        const result = await compressAdaptive(file, MAX_UPLOAD_BYTES);
        uploadBlob   = result.blob;
        qualityUsed  = result.quality;
        uploadName   = file.name.replace(/\.[^.]+$/i, '.jpg');
        setUploadBtn(`Caricamento (q${Math.round(qualityUsed * 100)}%)…`, true);
      } else {
        uploadBlob = file;
        uploadName = file.name;
        setUploadBtn('Caricamento…', true);
      }

      const data  = await uploadToCloudinary(uploadBlob, uploadName, `astrogallery/${dsoId}`);
      const full  = data.secure_url;
      const thumb = makeThumb(full);
      _pendingPhoto = { full, thumb, filename: file.name };
      showPhotoPreview(_pendingPhoto, qualityUsed);

    } catch (e) {
      photoMsg('Errore upload: ' + e.message, 'err');
    } finally {
      setUploadBtn('☁ CARICA SU CLOUDINARY', false);
    }
  };

  input.click();
}

function showPhotoPreview({ full, thumb, filename }, quality = null) {
  const wrap  = document.getElementById('ph-preview');
  const inner = document.getElementById('ph-preview-inner');
  const qInfo = quality !== null
    ? `<br><small style="opacity:.6">Convertita a JPEG qualità ${Math.round(quality * 100)}%</small>`
    : '';
  inner.innerHTML = `
    <img src="${escHtml(thumb)}" alt="anteprima">
    <div class="ph-preview-info">
      <strong>${escHtml(filename)}</strong>
      Caricata su Cloudinary${qInfo}<br>Pronta per essere aggiunta al catalogo
    </div>`;
  wrap.style.display = 'block';
}

// ── Navigazione pannello (Add / List / Photo) ─────────────────────────────────
let _currentDsoId = null; // DSO su cui si sta lavorando nel pannello foto


function initTabs() {
  document.querySelectorAll('.atab').forEach(btn => {
    btn.addEventListener('click', function () {
      const t = this.dataset.tab;
      showTab(t);
      if (t === 'list') renderAdminList();
    });
  });
}

// ── Sezione cambio password ───────────────────────────────────────────────────
const PW_HASH_KEY = 'astrogallery_pw_hash';
const SESSION_KEY = 'astrogallery_session';

let _pwMsgTimer = null;
function pwMsg(text, type = 'ok') {
  const el = document.getElementById('pw-msg');
  if (!el) return;
  el.textContent = text; el.className = type; el.style.display = 'block';
  clearTimeout(_pwMsgTimer);
  _pwMsgTimer = setTimeout(() => el.style.display = 'none', 3500);
}

function initPasswordSection() {
  const saveBtn = document.getElementById('pw-save-btn');
  if (!saveBtn) return;
  saveBtn.addEventListener('click', async () => {
    const newPw  = document.getElementById('pw-new').value;
    const conf   = document.getElementById('pw-confirm').value;
    if (!newPw)           return pwMsg('Inserisci una password', 'err');
    if (newPw.length < 6) return pwMsg('Minimo 6 caratteri', 'err');
    if (newPw !== conf)   return pwMsg('Le password non coincidono', 'err');
    const hash = await sha256(newPw);
    localStorage.setItem(PW_HASH_KEY, hash);
    sessionStorage.setItem(SESSION_KEY, hash);
    document.getElementById('pw-new').value    = '';
    document.getElementById('pw-confirm').value = '';
    pwMsg('Password salvata', 'ok');
  });
}

// ── Attrezzatura (derivata dal catalogo) + custom dropdown ────────────────────
const EQUIP_FIELDS = ['telescope','mount','camera','filters'];

function loadEquipment() {
  const eq = { telescope:[], mount:[], camera:[], filters:[] };
  for (const obj of state.allObjects) {
    for (const ph of (obj.photos || [])) {
      const acq = ph.acquisition; if (!acq) continue;
      for (const f of EQUIP_FIELDS) {
        const v = (acq[f] || '').trim();
        if (v && !eq[f].includes(v)) eq[f].push(v);
      }
    }
  }
  return eq;
}

function renderDropdown(field, filterVal) {
  const eq   = loadEquipment();
  const dd   = document.getElementById(`dd-${field}`);
  if (!dd) return;
  const items = (eq[field] || []).filter(v =>
    !filterVal || v.toLowerCase().includes(filterVal.toLowerCase()));

  dd.innerHTML = '';
  if (!items.length) {
    dd.innerHTML = '<div class="equip-empty">Nessun valore nel catalogo</div>';
    return;
  }
  items.forEach(val => {
    const row = document.createElement('div');
    row.className = 'equip-option';
    row.innerHTML = `<span>${escHtml(val)}</span>`;
    row.addEventListener('click', () => {
      document.getElementById(`acq-${field}`).value = val;
      dd.classList.remove('open');
    });
    dd.appendChild(row);
  });
}

function initEquipmentMemory() {
  EQUIP_FIELDS.forEach(field => {
    const inp = document.getElementById(`acq-${field}`);
    const dd  = document.getElementById(`dd-${field}`);
    if (!inp || !dd) return;
    inp.addEventListener('focus', () => { renderDropdown(field, inp.value); dd.classList.add('open'); });
    inp.addEventListener('input', () => { renderDropdown(field, inp.value); dd.classList.add('open'); });
    document.addEventListener('click', e => {
      if (!inp.contains(e.target) && !dd.contains(e.target)) dd.classList.remove('open');
    });
  });
}

// ── Lista foto esistenti con eliminazione ─────────────────────────────────────
function renderPhotoList(dsoId) {
  const obj = state.allObjects.find(o => o.id === dsoId);

  // Crea il contenitore una volta sola, inserendolo in cima al tab-photo
  let wrap = document.getElementById('existing-photos-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'existing-photos-wrap';
    const breadcrumb = document.querySelector('.photo-breadcrumb');
    if (breadcrumb) breadcrumb.after(wrap);
  }

  if (!obj || !obj.photos || !obj.photos.length) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = `<div class="fsep">FOTO ESISTENTI (${obj.photos.length})</div>`;

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px';
  grid.classList.add('photo-cascade-grid');

  obj.photos.forEach((ph, i) => {
    const card = document.createElement('div');
    card.style.cssText = 'position:relative;width:90px;flex-shrink:0';

    const img = document.createElement('img');
    img.src   = ph.thumb || ph.full;
    img.alt   = ph.title || '';
    img.style.cssText = 'width:90px;height:68px;object-fit:cover;border-radius:3px;display:block;border:1px solid rgba(60,110,180,0.3)';

    const label = document.createElement('div');
    label.textContent = ph.title || `Foto ${i + 1}`;
    label.style.cssText = 'font-size:8px;color:rgba(160,200,255,0.55);font-family:Raleway,sans-serif;margin-top:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis';

    const del = document.createElement('button');
    del.textContent  = '✕';
    del.title        = 'Elimina foto';
    del.style.cssText = 'position:absolute;top:3px;right:3px;background:rgba(0,3,14,0.75);border:1px solid rgba(255,80,60,0.6);color:rgba(255,100,80,0.9);width:18px;height:18px;border-radius:2px;font-size:9px;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center';

    del.addEventListener('click', () => {
      const label = ph.title ? `"${ph.title}"` : `foto ${i + 1}`;
      if (!confirm(`Eliminare ${label} da ${dsoId}?`)) return;
      obj.photos.splice(i, 1);
      saveObjects(); saveObjectsToFile();
      scheduleRender();
      renderPhotoList(dsoId);
      photoMsg('Foto eliminata', 'ok');
    });

    card.append(img, label, del);
    grid.appendChild(card);
  });

  wrap.appendChild(grid);
}

// ── Pannello foto (aperto da renderAdminList) ─────────────────────────────────
export function openPhotoPanel(dsoId) {
  const obj = state.allObjects.find(o => o.id === dsoId);
  if (!obj) return;
  _currentDsoId = dsoId;
  _pendingPhoto  = null;

  // Reset form foto
  ['ph-title','ph-date','ph-comment',
   'acq-telescope','acq-mount','acq-camera','acq-filters',
   'acq-frames','acq-exposure','acq-gain','acq-temp','acq-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('ph-preview').style.display = 'none';
  document.getElementById('photo-msg').style.display  = 'none';
  document.getElementById('acq-section').style.display = 'none';
  document.getElementById('acq-arr').innerHTML = '&#x25bc;';

  // Label breadcrumb
  document.getElementById('photo-dso-label').textContent = `${obj.id} — ${obj.name}`;

  showTab('photo');
  renderPhotoList(dsoId);
}

// ── Hints RA/Dec ──────────────────────────────────────────────────────────────
export function getRaDecimal() {
  return hmsToRa(
    document.getElementById('f-ra-h').value || 0,
    document.getElementById('f-ra-m').value || 0,
    document.getElementById('f-ra-s').value || 0,
  );
}
export function getDeclDecimal() {
  return dmsToDecl(
    document.getElementById('f-dec-sign').value,
    document.getElementById('f-dec-d').value || 0,
    document.getElementById('f-dec-m').value || 0,
    document.getElementById('f-dec-s').value || 0,
  );
}

function fillCoordFields(ra, dec) {
  const hms = raToHMSParts(ra);
  const dms = declToDMSParts(dec);
  document.getElementById('f-ra-h').value    = hms.h;
  document.getElementById('f-ra-m').value    = hms.m;
  document.getElementById('f-ra-s').value    = hms.s;
  document.getElementById('f-dec-sign').value = dms.sign;
  document.getElementById('f-dec-d').value   = dms.d;
  document.getElementById('f-dec-m').value   = dms.m;
  document.getElementById('f-dec-s').value   = dms.s;
  document.getElementById('ra-hint').textContent  = `= ${ra.toFixed(4)}°`;
  document.getElementById('dec-hint').textContent = `= ${dec.toFixed(4)}°`;
}

function initHints() {
  const updateRA = () => {
    const ra = getRaDecimal();
    document.getElementById('ra-hint').textContent = (ra >= 0 && ra <= 360) ? `= ${ra.toFixed(4)}°` : '';
  };
  const updateDec = () => {
    const dec = getDeclDecimal();
    document.getElementById('dec-hint').textContent = (dec >= -90 && dec <= 90) ? `= ${dec.toFixed(4)}°` : '';
  };
  ['f-ra-h','f-ra-m','f-ra-s'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateRA));
  ['f-dec-sign','f-dec-d','f-dec-m','f-dec-s'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateDec));
}

// ── Messaggi ──────────────────────────────────────────────────────────────────
let _msgTimer = null, _pmsgTimer = null;

function adminMsg(text, type = 'ok') {
  const el = document.getElementById('admin-msg');
  el.textContent = text; el.className = type; el.style.display = 'block';
  clearTimeout(_msgTimer);
  _msgTimer = setTimeout(() => el.style.display = 'none', 3500);
}
function photoMsg(text, type = 'ok') {
  const el = document.getElementById('photo-msg');
  el.textContent = text; el.className = type; el.style.display = 'block';
  clearTimeout(_pmsgTimer);
  _pmsgTimer = setTimeout(() => el.style.display = 'none', 3500);
}

// ── Submit DSO (crea o aggiorna) ──────────────────────────────────────────────
let _editMode = false; // true quando stiamo modificando un DSO esistente

function initSubmitDso() {
  const btn = document.getElementById('submit-btn');
  btn.type = 'button'; // previene submit form nativi

  btn.addEventListener('click', () => {
    const id   = document.getElementById('f-id').value.trim();
    const name = document.getElementById('f-name').value.trim();
    const ra   = getRaDecimal();
    const dec  = getDeclDecimal();

    if (!id || !name)              return adminMsg('ID e Nome sono obbligatori', 'err');
    if (isNaN(ra)  || ra  < 0  || ra  > 360) return adminMsg('AR non valida', 'err');
    if (isNaN(dec) || dec < -90 || dec > 90) return adminMsg('Dec non valida', 'err');

    // Legge _editMode dall'attributo del bottone (più robusto della variabile)
    const isEdit = btn.dataset.editMode === 'true';
    const idx = state.allObjects.findIndex(o => o.id === id);

    if (idx >= 0 && !isEdit) {
      return adminMsg(`ID "${id}" già esistente. Vai in CATALOGO → Modifica.`, 'err');
    }

    const obj = {
      ...(idx >= 0 ? state.allObjects[idx] : {}),
      id, name, ra, dec,
      type:          document.getElementById('f-type').value.trim()     || '—',
      magnitude:     parseFloat(document.getElementById('f-mag').value) || null,
      distance:      document.getElementById('f-dist').value.trim()     || '—',
      constellation: document.getElementById('f-const').value.trim()    || '—',
      info:          document.getElementById('f-info').value.trim()     || '',
    };

    if (idx >= 0) {
      state.allObjects[idx] = obj;
      adminMsg(`${id} aggiornato`, 'ok');
    } else {
      obj.photos = [];
      state.allObjects.push(obj);
      adminMsg(`${id} creato`, 'ok');
    }

    saveObjects(); saveObjectsToFile();
    resetDsoForm();
    scheduleRender();
  });
}

function resetDsoForm() {
  ['f-id','f-name','f-ra-h','f-ra-m','f-ra-s',
   'f-dec-d','f-dec-m','f-dec-s',
   'f-type','f-mag','f-dist','f-const','f-info'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const sign = document.getElementById('f-dec-sign');
  if (sign) sign.value = '+';
  document.getElementById('ra-hint').textContent  = '';
  document.getElementById('dec-hint').textContent = '';
  document.getElementById('f-id').removeAttribute('readonly');
  const sb = document.getElementById('submit-btn');
  sb.textContent = 'CREA DSO';
  sb.dataset.editMode = 'false';
  _editMode = false;
}

// Popola il form DSO con i dati di un oggetto esistente (modalità modifica)
function editDso(obj) {
  document.getElementById('f-id').value    = obj.id;
  document.getElementById('f-id').setAttribute('readonly', true);
  document.getElementById('f-name').value  = obj.name;
  document.getElementById('f-type').value  = obj.type          || '';
  document.getElementById('f-mag').value   = obj.magnitude     != null ? obj.magnitude : '';
  document.getElementById('f-dist').value  = obj.distance      || '';
  document.getElementById('f-const').value = obj.constellation || '';
  document.getElementById('f-info').value  = obj.info          || '';
  fillCoordFields(obj.ra, obj.dec);
  const _sb = document.getElementById('submit-btn');
  _sb.textContent = 'AGGIORNA DSO';
  _sb.dataset.editMode = 'true';
  _editMode = true;
  showTab('add');
  adminPanel.scrollTop = 0;
}

// ── Submit foto ───────────────────────────────────────────────────────────────
function initSubmitPhoto() {
  document.getElementById('submit-photo-btn').addEventListener('click', () => {
    if (!_currentDsoId) return;
    if (!_pendingPhoto) return photoMsg('Carica prima una foto con il pulsante Cloudinary', 'err');

    const title = document.getElementById('ph-title').value.trim();
    if (!title) return photoMsg('Il titolo è obbligatorio', 'err');

    const idx = state.allObjects.findIndex(o => o.id === _currentDsoId);
    if (idx < 0) return;

    const obj   = state.allObjects[idx];
    if (!obj.photos) obj.photos = [];

    // ID univoco: DSO + timestamp
    const photoId = `${_currentDsoId}_${Date.now()}`;

    const photo = {
      id:      photoId,
      title,
      date:    document.getElementById('ph-date').value    || '',
      comment: document.getElementById('ph-comment').value.trim() || '',
      full:    _pendingPhoto.full,
      thumb:   _pendingPhoto.thumb,
      acquisition: {
        telescope: document.getElementById('acq-telescope').value.trim() || '',
        mount:     document.getElementById('acq-mount').value.trim()     || '',
        camera:    document.getElementById('acq-camera').value.trim()    || '',
        filters:   document.getElementById('acq-filters').value.trim()   || '',
        frames:    parseInt(document.getElementById('acq-frames').value)  || null,
        exposure:  parseInt(document.getElementById('acq-exposure').value)|| null,
        gain:      parseInt(document.getElementById('acq-gain').value)    || null,
        temp:      parseInt(document.getElementById('acq-temp').value)    || null,
        notes:     document.getElementById('acq-notes').value.trim()      || '',
      },
    };

    obj.photos.push(photo);
    if (_editPhotoIndex !== null) {
      // Modalità modifica: aggiorna foto esistente preservando full/thumb originali se non ricaricati
      photo.full  = _pendingPhoto.full;
      photo.thumb = _pendingPhoto.thumb;
      obj.photos.splice(_editPhotoIndex, 1, photo);
      obj.photos.pop(); // rimuovi la push fatta sopra
      _editPhotoIndex = null;
      document.getElementById('submit-photo-btn').textContent = 'AGGIUNGI FOTO AL CATALOGO';
    }
    saveObjects(); saveObjectsToFile();
    scheduleRender();
    renderPhotoList(_currentDsoId);
    photoMsg(`Foto "${title}" aggiunta a ${_currentDsoId}`, 'ok');

    // Reset per aggiungere un'altra foto allo stesso DSO
    _pendingPhoto = null;
    document.getElementById('ph-preview').style.display = 'none';
    ['ph-title','ph-date','ph-comment',
     'acq-telescope','acq-mount','acq-camera','acq-filters',
     'acq-frames','acq-exposure','acq-gain','acq-temp','acq-notes'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  });
}

// ── Lista DSO nel tab Catalogo ────────────────────────────────────────────────
export function renderAdminList() {
  const list = document.getElementById('obj-list');
  list.innerHTML = '';

  if (!state.allObjects.length) {
    list.innerHTML = '<p style="font-family:Raleway,sans-serif;font-size:9px;color:rgba(140,175,215,0.3);padding:10px 0">Nessun DSO nel catalogo.</p>';
    return;
  }

  state.allObjects.forEach(obj => {
    const card = document.createElement('div');
    card.className = 'obj-card';

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'obj-card-header';

    const info = document.createElement('div');
    info.className = 'obj-card-info';
    info.innerHTML = `
      <div class="obj-card-id">${escHtml(obj.id)}</div>
      <div class="obj-card-name">${escHtml(obj.name)}</div>
      <div class="obj-card-count">${obj.photos?.length || 0} foto &middot; ${escHtml(obj.type || '—')}</div>`;

    const actions = document.createElement('div');
    actions.className = 'obj-card-actions';
    if (state.isAdmin) {
      actions.innerHTML = `
        <button class="obj-act-btn btn-addphoto" title="Aggiungi foto">+ FOTO</button>
        <button class="obj-act-btn btn-edit">MODIFICA</button>
        <button class="obj-act-btn danger btn-del">&#x2715;</button>`;
      actions.querySelector('.btn-addphoto').addEventListener('click', e => { e.stopPropagation(); openPhotoPanel(obj.id); });
      actions.querySelector('.btn-edit').addEventListener('click',     e => { e.stopPropagation(); editDso(obj); });
      actions.querySelector('.btn-del').addEventListener('click',      e => {
        e.stopPropagation();
        if (!confirm(`Eliminare ${obj.id} — ${obj.name} e tutte le sue foto?`)) return;
        const i = state.allObjects.findIndex(o => o.id === obj.id);
        if (i >= 0) state.allObjects.splice(i, 1);
        saveObjects(); saveObjectsToFile(); renderAdminList(); scheduleRender();
      });
    }

    header.append(info, actions);

    // ── Cascade foto (collassato di default) ──────────────────────────────────
    const cascade = document.createElement('div');
    cascade.className = 'obj-photo-cascade';
    cascade.style.display = 'none';

    // Freccia toggle
    const arrow = document.createElement('span');
    arrow.className = 'cascade-arrow';
    arrow.textContent = '▼';
    header.prepend(arrow);

    // Click header → toggle cascade + vola al DSO
    header.style.cursor = 'pointer';
    header.addEventListener('click', e => {
      if (e.target.closest('.obj-card-actions')) return; // non intercettare i btn azioni
      const isOpen = cascade.style.display !== 'none';
      cascade.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('open', !isOpen);
      if (!isOpen) {
        renderPhotoCascade(cascade, obj);
        flyToObject(obj.ra, obj.dec, obj);
      }
    });

    card.append(header, cascade);
    list.appendChild(card);
  });
}

function renderPhotoCascade(container, obj) {
  container.innerHTML = '';
  if (!obj.photos || !obj.photos.length) {
    container.innerHTML = '<div style="font-family:Raleway,sans-serif;font-size:8px;color:rgba(120,160,210,0.3);padding:8px 0 4px;letter-spacing:0.1em">Nessuna foto</div>';
    return;
  }

  obj.photos.forEach((ph, i) => {
    const row = document.createElement('div');
    row.className = 'photo-cascade-row';

    const thumb = document.createElement('img');
    thumb.src   = ph.thumb || ph.full;
    thumb.alt   = ph.title || '';
    thumb.className = 'photo-cascade-thumb';
    thumb.addEventListener('click', () => {
      flyToObject(obj.ra, obj.dec, obj);
      openLightbox(obj, i);
    });

    const nameEl = document.createElement('div');
    nameEl.className   = 'photo-cascade-name';
    nameEl.textContent = ph.title || `Foto ${i + 1}`;
    nameEl.addEventListener('click', () => {
      flyToObject(obj.ra, obj.dec, obj);
      openLightbox(obj, i);
    });

    const actEl = document.createElement('div');
    actEl.className = 'photo-cascade-actions';

    if (state.isAdmin) {
      const upBtn = document.createElement('button');
      upBtn.className = 'obj-act-btn'; upBtn.textContent = '↑'; upBtn.title = 'Sposta su';
      upBtn.disabled = (i === 0);
      upBtn.addEventListener('click', e => {
        e.stopPropagation();
        [obj.photos[i-1], obj.photos[i]] = [obj.photos[i], obj.photos[i-1]];
        saveObjects(); saveObjectsToFile(); renderPhotoCascade(container, obj);
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'obj-act-btn'; downBtn.textContent = '↓'; downBtn.title = 'Sposta giù';
      downBtn.disabled = (i === obj.photos.length - 1);
      downBtn.addEventListener('click', e => {
        e.stopPropagation();
        [obj.photos[i], obj.photos[i+1]] = [obj.photos[i+1], obj.photos[i]];
        saveObjects(); saveObjectsToFile(); renderPhotoCascade(container, obj);
      });

      const editBtn = document.createElement('button');
      editBtn.className   = 'obj-act-btn';
      editBtn.textContent = 'MODIFICA';
      editBtn.addEventListener('click', () => editPhoto(obj.id, i));

      const delBtn = document.createElement('button');
      delBtn.className   = 'obj-act-btn danger';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        const label = ph.title ? `"${ph.title}"` : `foto ${i + 1}`;
        if (!confirm(`Eliminare ${label}?`)) return;
        obj.photos.splice(i, 1);
        saveObjects(); saveObjectsToFile(); scheduleRender();
        renderPhotoCascade(container, obj);
      });

      actEl.append(upBtn, downBtn, editBtn, delBtn);
    }

    row.append(thumb, nameEl, actEl);
    container.appendChild(row);
  });
}

// ── Modifica foto esistente ───────────────────────────────────────────────────
let _editPhotoIndex = null; // null = nuova foto, numero = modifica esistente

function editPhoto(dsoId, photoIndex) {
  openPhotoPanel(dsoId);
  _editPhotoIndex = photoIndex;

  const obj = state.allObjects.find(o => o.id === dsoId);
  if (!obj) return;
  const ph = obj.photos[photoIndex];
  if (!ph) return;

  // Pre-compila il form
  document.getElementById('ph-title').value   = ph.title   || '';
  document.getElementById('ph-date').value    = ph.date    || '';
  document.getElementById('ph-comment').value = ph.comment || '';

  const acq = ph.acquisition || {};
  ['telescope','mount','camera','filters'].forEach(f => {
    const el = document.getElementById(`acq-${f}`); if (el) el.value = acq[f] || '';
  });
  ['frames','exposure','gain','temp'].forEach(f => {
    const el = document.getElementById(`acq-${f}`); if (el) el.value = acq[f] != null ? acq[f] : '';
  });
  const notesEl = document.getElementById('acq-notes');
  if (notesEl) notesEl.value = acq.notes || '';

  // Usa la foto esistente come pending (nessun re-upload obbligatorio)
  _pendingPhoto = { full: ph.full, thumb: ph.thumb, filename: ph.title || '' };
  showPhotoPreview(_pendingPhoto, null);

  document.getElementById('submit-photo-btn').textContent = 'AGGIORNA FOTO';
}


// ── Autocompilazione form da database ─────────────────────────────────────────
function initDatabaseAutofill() {
  const idInput = document.getElementById('f-id');
  if (!idInput) return;
  idInput.setAttribute('autocomplete', 'new-password');
  idInput.setAttribute('name', 'dso-catalog-id');

  const hint = document.createElement('div');
  hint.className = 'fhint'; hint.id = 'id-db-hint';
  idInput.parentElement.appendChild(hint);

  function setHint(text, ok) {
    hint.textContent = text;
    hint.style.color = ok ? 'rgba(100,200,140,0.75)' : 'rgba(110,155,205,0.32)';
  }

  function autofill(rawInput) {
    const key   = rawInput.toLowerCase().replace(/[\s\-\/]/g, '');
    const entry = _dsoLookup.get(key);
    if (!entry) { setHint('', false); return; }

    const nameEl = document.getElementById('f-name');
    if (nameEl && !nameEl.value) nameEl.value = entry.it || '';

    const raDeg = entry.ra * 15;
    const { h, m, s } = raToHMSParts(raDeg);
    document.getElementById('f-ra-h').value = h;
    document.getElementById('f-ra-m').value = m;
    document.getElementById('f-ra-s').value = s;
    document.getElementById('ra-hint').textContent = `AR = ${raDeg.toFixed(4)}°  (da database)`;

    const { sign, d, m: dm, s: ds } = declToDMSParts(entry.dec);
    document.getElementById('f-dec-sign').value = sign;
    document.getElementById('f-dec-d').value = d;
    document.getElementById('f-dec-m').value = dm;
    document.getElementById('f-dec-s').value = ds;
    document.getElementById('dec-hint').textContent = `Dec = ${entry.dec >= 0 ? '+' : ''}${entry.dec.toFixed(4)}°  (da database)`;

    const typeEl = document.getElementById('f-type');
    if (typeEl) typeEl.value = entry.type || '';
    const magEl  = document.getElementById('f-mag');
    if (magEl)  magEl.value  = parseFloat(entry.mag) || '';
    const distEl = document.getElementById('f-dist');
    if (distEl) distEl.value = (entry.dist || '').replace(' a.l.', ' al');
    const constEl = document.getElementById('f-const');
    if (constEl) constEl.value = _dsoConst[entry.id] || '';
    const infoEl  = document.getElementById('f-info');
    if (infoEl && !infoEl.value) infoEl.value = entry.desc_it || '';

    setHint('✓ Trovato nel database — campi compilati automaticamente', true);
  }

  let _debounce = null;
  idInput.addEventListener('input', () => {
    clearTimeout(_debounce);
    const val = idInput.value.trim();
    if (!val) { setHint('', false); return; }
    _debounce = setTimeout(() => autofill(val), 320);
  });
}

// ── Cloudinary Media Library Widget ───────────────────────────────────────────
let _mlWidget = null;

function initCloudinaryBrowser() {
  const btn = document.getElementById('browse-cloudinary-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!_currentDsoId) return;
    if (!window.cloudinary) {
      const script = document.createElement('script');
      script.src = 'https://media-library.cloudinary.com/global/all.js';
      script.onload = () => openMLWidget();
      document.head.appendChild(script);
    } else {
      openMLWidget();
    }
  });

  function openMLWidget() {
    if (_mlWidget) { _mlWidget.show(); return; }
    _mlWidget = window.cloudinary.createMediaLibrary(
      {
        cloud_name: CLD_CLOUD,
        api_key:    CLD_API_KEY,
        multiple:   false, max_files: 1,
        insert_caption: 'Seleziona',
      },
      {
        insertHandler: data => {
          if (!data.assets?.length) return;
          const asset = data.assets[0];
          const full  = asset.secure_url;
          const thumb = makeThumb(full);
          const filename = asset.public_id?.split('/').pop() || asset.display_name || 'cloudinary';
          _pendingPhoto = { full, thumb, filename };
          showPhotoPreview(_pendingPhoto, null);
          photoMsg('Foto selezionata dalla libreria Cloudinary', 'ok');
        },
      }
    );
    _mlWidget.show();
  }
}

// ── Export / Import ───────────────────────────────────────────────────────────
function initExportImport() {
  _loadFileHandle();   // tenta di recuperare handle catalogo dalla sessione precedente

  document.getElementById('export-btn').addEventListener('click', () => {
    saveObjectsToFile();
  });

  document.getElementById('import-btn').addEventListener('click',
    () => document.getElementById('import-file').click());

  document.getElementById('import-file').addEventListener('change', function () {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error();
        state.allObjects = parsed;
        saveObjects(); saveObjectsToFile(); renderAdminList(); scheduleRender();
        adminMsg(`${parsed.length} oggetti importati`, 'ok');
      } catch { adminMsg('File JSON non valido', 'err'); }
    };
    reader.readAsText(file); this.value = '';
  });
}

// ── showTab aggiornato per gestire settings ───────────────────────────────────
function showTab(name) {
  document.getElementById('tab-add').style.display      = name === 'add'      ? 'block' : 'none';
  document.getElementById('tab-list').style.display     = name === 'list'     ? 'block' : 'none';
  document.getElementById('tab-photo').style.display    = name === 'photo'    ? 'block' : 'none';
  document.getElementById('tab-settings').style.display = name === 'settings' ? 'block' : 'none';

  document.querySelectorAll('.atab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initAdmin() {
  adminBtn.addEventListener('click', () => {
    if (state.adminOpen) { closeAdmin(); return; }
    // Aggiorna visibilità tab in base al ruolo
    const addTab      = document.querySelector('.atab[data-tab="add"]');
    const settingsTab = document.getElementById('tab-settings-btn');
    if (addTab)      addTab.style.display      = state.isAdmin ? '' : 'none';
    if (settingsTab) settingsTab.style.display = state.isAdmin ? '' : 'none';
    // Nascondi export/import per utenti non admin
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    if (exportBtn) exportBtn.style.display = state.isAdmin ? '' : 'none';
    if (importBtn) importBtn.style.display = state.isAdmin ? '' : 'none';
    // Se visitatore, assicura che sia sul tab catalogo
    if (!state.isAdmin) showTab('list');
    openAdmin();
  });
  document.getElementById('admin-close-btn').addEventListener('click', closeAdmin);

  document.getElementById('photo-back-btn').addEventListener('click', () => {
    _editPhotoIndex = null;
    document.getElementById('submit-photo-btn').textContent = 'AGGIUNGI FOTO AL CATALOGO';
    showTab('list'); renderAdminList();
  });

  document.getElementById('add-photo-btn').addEventListener('click', () => {
    if (!_currentDsoId) return;
    handlePhotoUpload(_currentDsoId);
  });

  document.getElementById('acq-toggle-btn').addEventListener('click', () => {
    const sec  = document.getElementById('acq-section');
    const arr  = document.getElementById('acq-arr');
    const open = sec.style.display === 'block';
    sec.style.display = open ? 'none' : 'block';
    arr.innerHTML     = open ? '&#x25bc;' : '&#x25b2;';
  });

  initTabs();
  initHints();
  initDatabaseAutofill();
  initSubmitDso();
  initSubmitPhoto();
  initExportImport();
  initEquipmentMemory();
  initPasswordSection();
  initCloudinaryBrowser();
}
