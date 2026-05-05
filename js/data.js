// ─── Dati DSO: defaults + persistenza localStorage ───────────────────────────
import { state, STORAGE_KEY } from './state.js';

// Catalogo demo (placeholder Cloudinary → in produzione URL reali)
export const DSO_DEFAULTS = [
  {
    id: 'M42', name: 'Nebulosa di Orione', ra: 83.82, dec: -5.39,
    type: 'Nebulosa a emissione', distance: '1.344 al', magnitude: 4.0, constellation: 'Orione',
    info: 'La Grande Nebulosa di Orione è una delle nebulose a emissione più luminose del cielo. A circa 1.344 anni luce, il suo diametro è di ~40 anni luce. Al centro si trova il Trapezio, ammasso di giovani stelle calde che ionizzano il gas.',
    photos: [1,2,3,4,5,6,7,8].map(i => ({
      id: `m42_${i}`,
      thumb: `https://picsum.photos/seed/orion${i}/320/240`,
      full:  `https://picsum.photos/seed/orion${i}/1600/1200`,
      date:  `2024-${String(10 + i).padStart(2,'0')}-15`,
    })),
  },
  {
    id: 'M45', name: 'Pleiadi', ra: 56.75, dec: 24.12,
    type: 'Ammasso aperto', distance: '444 al', magnitude: 1.6, constellation: 'Toro',
    info: 'Le Pleiadi sono uno degli ammassi aperti più famosi. Centinaia di stelle giovani di tipo B, molte avvolte da nebulose di riflessione che danno all\'ammasso il caratteristico aspetto azzurrognolo.',
    photos: [1,2,3].map(i => ({
      id: `m45_${i}`,
      thumb: `https://picsum.photos/seed/pld${i}/320/240`,
      full:  `https://picsum.photos/seed/pld${i}/1600/1200`,
      date:  `2024-10-${10 + i}`,
    })),
  },
  {
    id: 'M1', name: 'Nebulosa del Granchio', ra: 83.63, dec: 22.01,
    type: 'Resto di supernova', distance: '6.523 al', magnitude: 8.4, constellation: 'Toro',
    info: 'Resto dell\'esplosione di una supernova osservata nel 1054. Al centro si trova una pulsar che ruota 30 volte al secondo. Il gas si espande ancora a ~1.500 km/s.',
    photos: [1,2,3,4].map(i => ({
      id: `m1_${i}`,
      thumb: `https://picsum.photos/seed/crab${i}/320/240`,
      full:  `https://picsum.photos/seed/crab${i}/1600/1200`,
      date:  `2024-12-${i + 10}`,
    })),
  },
  {
    id: 'M31', name: 'Galassia di Andromeda', ra: 10.68, dec: 41.27,
    type: 'Galassia a spirale', distance: '2.537.000 al', magnitude: 3.44, constellation: 'Andromeda',
    info: 'La galassia a spirale più grande del Gruppo Locale. Destinata a fondersi con la Via Lattea tra ~4,5 miliardi di anni. Visibile a occhio nudo come nebulosità allungata.',
    photos: [1,2,3,4,5].map(i => ({
      id: `m31_${i}`,
      thumb: `https://picsum.photos/seed/androm${i}/320/240`,
      full:  `https://picsum.photos/seed/androm${i}/1600/1200`,
      date:  `2024-09-${i + 5}`,
    })),
  },
  {
    id: 'NGC7000', name: 'Nebulosa Nord America', ra: 314.75, dec: 44.53,
    type: 'Nebulosa a emissione', distance: '1.600 al', magnitude: 4.0, constellation: 'Cigno',
    info: 'Prende il nome dalla caratteristica forma che ricorda il continente nordamericano. Ionizzata da una stella non ancora identificata con certezza.',
    photos: [1,2,3,4,5,6].map(i => ({
      id: `ngc7k_${i}`,
      thumb: `https://picsum.photos/seed/northam${i}/320/240`,
      full:  `https://picsum.photos/seed/northam${i}/1600/1200`,
      date:  `2024-08-${i + 15}`,
    })),
  },
  {
    id: 'M13', name: 'Ammasso di Ercole', ra: 250.42, dec: 36.46,
    type: 'Ammasso globulare', distance: '25.100 al', magnitude: 5.8, constellation: 'Ercole',
    info: 'Uno dei più spettacolari ammassi globulari dell\'emisfero nord. ~300.000 stelle in una sfera di ~145 anni luce. Nel 1974 fu inviato verso di lui il messaggio di Arecibo.',
    photos: [1,2,3,4].map(i => ({
      id: `m13_${i}`,
      thumb: `https://picsum.photos/seed/herc${i}/320/240`,
      full:  `https://picsum.photos/seed/herc${i}/1600/1200`,
      date:  `2024-06-${i + 10}`,
    })),
  },
];

// ── Carica da localStorage → /data/objects.json → DSO_DEFAULTS ───────────────
export async function loadObjects() {
  // 1. localStorage — priorità massima (modifiche recenti dell'utente)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        state.allObjects = parsed;
        return;
      }
    }
  } catch (e) { /* localStorage non disponibile */ }

  // 2. /data/objects.json — catalogo dell'utente versionato su disco
  try {
    const res = await fetch('./data/objects.json', { cache: 'no-cache' });
    if (res.ok) {
      const parsed = await res.json();
      if (Array.isArray(parsed) && parsed.length) {
        state.allObjects = parsed;
        // Ricopiamo in localStorage per le sessioni successive
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return;
      }
    }
  } catch (e) { /* file non presente o non raggiungibile */ }

  // 3. DSO_DEFAULTS hardcoded — ultima spiaggia
  state.allObjects = JSON.parse(JSON.stringify(DSO_DEFAULTS));
}

export function saveObjects() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.allObjects));
  } catch (e) { console.warn('localStorage non disponibile:', e); }
}
