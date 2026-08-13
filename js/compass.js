// ─── Bussola: orientamento dispositivo → vista celeste ───────────────────────
// Opzione B: la bussola guida la vista; al primo drag col dito va in PAUSA
// (gestita in main.js che chiama pauseCompass()). Ripremendo 🧭 riprende.
//
// Flusso:
//   toggleCompass() → permesso sensori (tap, richiesto da iOS) + geolocalizzazione
//   → listener 'deviceorientation' → orientationToAltAz() → altAzToEqu()
//   → scrive state.viewRA/viewDec → scheduleRender()

import { state } from './state.js';
import { scheduleRender } from './starmap.js';
import { D2R, R2D, localSiderealTime, altAzToEqu, parallacticAngle } from './math.js';

// ── Stato interno del modulo ──────────────────────────────────────────────────
let listening    = false;   // listener deviceorientation attivo
let paused       = false;   // true dopo un drag (Opzione B)
let haveLocation = false;   // lat/lon disponibili (GPS o manuali)
let calibOffset  = 0;       // offset azimut manuale (gradi) per la bussola magnetica

// Callback verso la UI (impostata dal passo 3) per aggiornare pulsante/indicatori
let onStateChange = null;
export function setCompassUICallback(fn) { onStateChange = fn; }
function notifyUI() { if (onStateChange) onStateChange(getCompassState()); }

// Stato leggibile dall'esterno (per la UI)
export function getCompassState() {
  return {
    active: state.compassActive,
    paused,
    haveLocation,
    lat: state.observerLat,
    lon: state.observerLon,
  };
}

// ── Permesso sensori (iOS 13+ richiede requestPermission su gesto utente) ─────
async function requestOrientationPermission() {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission();
      return res === 'granted';
    } catch (e) {
      return false;  // negato o non su gesto valido
    }
  }
  return true;  // Android / browser senza gate esplicito
}

// ── Geolocalizzazione automatica (una lettura) ────────────────────────────────
function requestGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.observerLat = pos.coords.latitude;
        state.observerLon = pos.coords.longitude;
        haveLocation = true;
        notifyUI();
        resolve(true);
      },
      ()  => resolve(false),   // negato / non disponibile → fallback manuale
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}

// Impostazione manuale della posizione (dal menu 📍 → Manuale)
export function setManualLocation(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (isNaN(la) || isNaN(lo)) return false;
  state.observerLat = Math.max(-90, Math.min(90, la));
  state.observerLon = ((lo + 180) % 360 + 360) % 360 - 180;  // normalizza a [-180,180]
  haveLocation = true;
  notifyUI();
  return true;
}

// Offset di calibrazione azimut (per correggere la bussola magnetica)
export function adjustCalibration(deltaDeg) {
  calibOffset = ((calibOffset + deltaDeg) % 360 + 360) % 360;
}
export function getCalibration() { return calibOffset; }

// ── Orientamento dispositivo → {alt, az} del punto puntato dal RETRO ──────────
//
// Costruisce la matrice di rotazione del dispositivo dagli angoli alpha/beta/gamma
// (convenzione W3C, ordine Z-X'-Y''), poi ricava la direzione dell'asse -Z del
// telefono (dove "guarda" la fotocamera posteriore) nel sistema del mondo
// (X=Est, Y=Nord, Z=alto). Da quel vettore estrae azimut e altezza.
// Il roll (rotazione attorno all'asse di vista) è ignorato: v1 a orizzonte fisso.
function orientationToAltAz(alphaDeg, betaDeg, gammaDeg) {
  const a = alphaDeg * D2R;  // Z
  const b = betaDeg  * D2R;  // X'
  const g = gammaDeg * D2R;  // Y''

  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);

  // Terza colonna della matrice R = Rz(a)·Rx(b)·Ry(g) → asse Z del dispositivo
  // nel frame mondo (device-frame: X destra, Y alto-schermo, Z esce dallo schermo)
  const zx =  cA * sG + sA * sB * cG;
  const zy =  sA * sG - cA * sB * cG;
  const zz =  cB * cG;

  // La fotocamera posteriore punta lungo -Z del dispositivo
  let vx = -zx, vy = -zy, vz = -zz;

  // Frame mondo del deviceorientation: X=Est, Y=Nord, Z=su (verticale locale)
  // altezza = angolo sopra l'orizzonte; azimut = da Nord verso Est
  const alt = Math.asin(Math.max(-1, Math.min(1, vz))) * R2D;
  // -vx: convenzione alpha ANTIORARIA → azimut ORARIO da Nord verso Est.
  // Verificato col Sole (Δ≈0). L'effetto "diagonale" non era il segno azimut ma
  // il roll d'orizzonte mancante, ora gestito via state.viewRoll (parallasse).
  let az = Math.atan2(-vx, vy) * R2D;        // 0=N, 90=E, 180=S, 270=O
  az = ((az + calibOffset) % 360 + 360) % 360;

  return { alt, az };
}

// ── Handler evento orientamento ───────────────────────────────────────────────
function handleOrientation(ev) {
  if (!state.compassActive || paused || !haveLocation) return;
  if (ev.alpha === null || ev.beta === null || ev.gamma === null) return;

  // Sorgente dell'azimut, in ordine di affidabilità:
  //  1. iOS: webkitCompassHeading → bussola vera (Nord magnetico), heading orario.
  //  2. Android: evento 'deviceorientationabsolute' (ev.absolute === true) →
  //     alpha già riferito al Nord. Verificato sul campo (Δ≈0 puntando il Sole).
  //  3. Fallback: alpha dell'evento relativo — NON ancorato al Nord, impreciso;
  //     usato solo se non arriva nulla di meglio, correggibile con adjustCalibration.
  let alpha = ev.alpha;
  if (typeof ev.webkitCompassHeading === 'number') {
    alpha = 360 - ev.webkitCompassHeading;   // heading orario → alpha antiorario
  }
  // (se l'evento è 'absolute', ev.alpha è già corretto: nessuna trasformazione)

  const { alt, az } = orientationToAltAz(alpha, ev.beta, ev.gamma);
  const lst = localSiderealTime(new Date(), state.observerLon);
  const { ra, dec } = altAzToEqu(alt, az, state.observerLat, lst);

  state.viewRA  = ra;
  state.viewDec = Math.max(-89.5, Math.min(89.5, dec));
  // Roll = -angolo di parallasse: ruota la vista per tenere l'orizzonte dritto
  // come Stellarium. Applicato in getBasis solo quando compassActive è true.
  state.viewRoll = -parallacticAngle(alt, az, state.observerLat) * D2R;
  scheduleRender();
}

// Preferenza per l'evento absolute (Android): quando è disponibile, ignoriamo
// l'evento relativo per non sovrascrivere con dati non ancorati al Nord.
let absoluteSeen = false;
function handleAbsolute(ev) {
  if (ev && ev.alpha !== null) absoluteSeen = true;
  handleOrientation(ev);
}
// L'evento relativo viene ignorato una volta che l'absolute è attivo su Android.
function handleRelative(ev) {
  // iOS non emette 'deviceorientationabsolute' ma popola webkitCompassHeading:
  // in quel caso l'evento relativo è la nostra sorgente valida.
  if (absoluteSeen && typeof ev.webkitCompassHeading !== 'number') return;
  handleOrientation(ev);
}

// ── Attiva / disattiva la bussola (dal pulsante 🧭) ───────────────────────────
export async function toggleCompass() {
  if (state.compassActive) { stopCompass(); return; }

  const ok = await requestOrientationPermission();
  if (!ok) {
    notifyUI();
    return { error: 'permission' };   // la UI mostra un messaggio
  }

  // Geolocalizzazione automatica al primo avvio, se non già impostata
  if (!haveLocation) await requestGeolocation();

  // Interrompe inerzia/snap/volo per non litigare con la bussola
  state.inertia.active = false;
  state.inertia.vRA = 0; state.inertia.vDec = 0;
  state.snapTarget = null; state.snapPhase = 'none';
  state.flyTo = null; state.flyToObj = null;

  state.compassActive = true;
  paused = false;

  if (!listening) {
    // Android: 'deviceorientationabsolute' dà alpha riferito al Nord vero.
    // iOS / fallback: 'deviceorientation' con webkitCompassHeading.
    window.addEventListener('deviceorientationabsolute', handleAbsolute, true);
    window.addEventListener('deviceorientation', handleRelative, true);
    listening = true;
  }
  notifyUI();

  // Se non abbiamo posizione, segnala alla UI di aprire l'inserimento manuale
  return haveLocation ? { ok: true } : { needLocation: true };
}

export function stopCompass() {
  state.compassActive = false;
  paused = false;
  state.viewRoll = 0;  // ripristina vista non ruotata per il drag col dito
  if (listening) {
    window.removeEventListener('deviceorientationabsolute', handleAbsolute, true);
    window.removeEventListener('deviceorientation', handleRelative, true);
    listening = false;
    absoluteSeen = false;
  }
  notifyUI();
}

// ── Pausa (Opzione B): chiamata da main.js quando parte un drag col dito ──────
export function pauseCompass() {
  if (!state.compassActive || paused) return;
  paused = true;
  notifyUI();
}

// Riprende il puntamento (ripremendo 🧭 dopo una pausa)
export function resumeCompass() {
  if (!state.compassActive) return;
  paused = false;
  notifyUI();
}

// Il pulsante 🧭 gestisce i tre stati: spento → acceso → (se in pausa) riprende
export async function compassButtonPressed() {
  if (!state.compassActive) return toggleCompass();     // spento → accendi
  if (paused) { resumeCompass(); return { ok: true }; } // in pausa → riprendi
  stopCompass(); return { ok: true };                   // attivo → spegni
}

export function isPaused()   { return paused; }
export function isActive()   { return state.compassActive; }
export function hasLocation(){ return haveLocation; }
