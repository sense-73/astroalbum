// ─── Stato condiviso dell'applicazione ───────────────────────────────────────
// Tutti i moduli importano questo oggetto e lo mutano direttamente.
// I moduli ES garantiscono che sia la stessa istanza per tutti.

export const state = {
  // Vista
  viewRA:  83,    // AR centro vista (gradi)
  viewDec: 5,     // Dec centro vista (gradi)
  fov:     60,    // Campo visivo totale (gradi)

  // Canvas
  W: 0, H: 0, scale: 0,

  // Catalogo stellare
  stars:     [],   // [{ra, dec, mag, bv, name}]
  constSegs: [],   // [[p0, p1], ...]  tutti i segmenti costellazioni
  constData: [],   // [{name, segs, centRa, centDec}]

  // Oggetti DSO
  allObjects: [],  // [{id, name, ra, dec, type, distance, magnitude, constellation, info, photos}]

  // Hover / Popup
  hoveredDSO:  null,
  isOverPopup: false,

  // Lightbox
  lbObject:   null,
  lbIndex:    0,
  lbInfoOpen: false,

  // Layer toggle
  showConstLines: true,
  showConstNames: false,
  showStarNames:  false,

  // Alpha per fade morbido dei layer nomi (0=invisibile, 1=pieno)
  constNamesAlpha: 0,
  starNamesAlpha:  0,

  // Crosshair centro vista
  showCrosshair: false,

  // Inerzia del pan
  inertia: {
    vRA:    0,   // velocità angolare RA (deg/frame)
    vDec:   0,   // velocità angolare Dec (deg/frame)
    active: false,
  },

  // Snap gravitazionale verso marker DSO
  snapTarget: null,   // oggetto DSO agganciato { ra, dec, id, … }
  snapPhase:  'none', // 'none' | 'snapping'

  // Animazione volo verso un DSO
  flyTo:    null,   // { raFrom, decFrom, raTo, decTo, startTime, duration } oppure null
  flyToObj: null,   // oggetto DSO target del volo (per illuminare il marker all'arrivo)

  // Auth
  isAdmin:      false,
  isAuthorized: false,  // true per tutta la sessione se aperto con URL segreto

  // Admin panel
  adminOpen: false,

  // Cache base vettoriale proiezione
  _basis:    null,
  _basisKey: '',

  // Render loop
  _animActive: false,
};

export const STORAGE_KEY = 'astrogallery_v1';
