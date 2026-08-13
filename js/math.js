// ─── Costanti e funzioni matematiche pure ────────────────────────────────────

export const D2R    = Math.PI / 180;
export const R2D    = 180 / Math.PI;
export const TWO_PI = Math.PI * 2;

export const norm = v => {
  const l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return l > 1e-10 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 0, 1];
};

export const cross = (a, b) => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0],
];

export const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

// Coordinate sferiche (gradi) → vettore cartesiano su sfera unitaria
export const s2c = (raDeg, decDeg) => {
  const ra = raDeg * D2R, dec = decDeg * D2R;
  return [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ];
};

// Vettore cartesiano → {ra, dec} in gradi
export const c2s = v => ({
  ra:  ((Math.atan2(v[1], v[0]) * R2D) + 360) % 360,
  dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D,
});

// Raggio pixel da magnitudine
export const magToR = m =>
  m <= 0 ? 4.2 : m <= 1 ? 3.5 : m <= 2 ? 2.8 :
  m <= 3 ? 2.1 : m <= 4 ? 1.55 : m <= 5 ? 1.1 : 0.75;

// Escape HTML per output dinamico
export const escHtml = s =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

// Formatta AR decimale → "Xh XXm XXs"
export const raToHMS = ra => {
  const h = Math.floor(ra / 15);
  const m = Math.floor((ra / 15 - h) * 60);
  const s = ((ra / 15 - h - m / 60) * 3600).toFixed(1);
  return `${h}h ${String(m).padStart(2,'0')}m ${s}s`;
};

// Formatta Dec decimale → "±XX° XX' XX""
export const decToDMS = dec => {
  const sign = dec >= 0 ? '+' : '−';
  const ad = Math.abs(dec);
  const d  = Math.floor(ad);
  const m  = Math.floor((ad - d) * 60);
  const s  = ((ad - d - m / 60) * 3600).toFixed(1);
  return `${sign}${d}° ${String(m).padStart(2,'0')}' ${s}"`;
};

// HMS → gradi decimali (AR)
export const hmsToRa = (h, m, s) =>
  (parseFloat(h) + parseFloat(m) / 60 + parseFloat(s) / 3600) * 15;

// DMS → gradi decimali (Dec)
export const dmsToDecl = (sign, d, m, s) =>
  (sign === '-' ? -1 : 1) * (parseFloat(d) + parseFloat(m) / 60 + parseFloat(s) / 3600);

// Gradi decimali → componenti HMS
export const raToHMSParts = ra => {
  const h = Math.floor(ra / 15);
  const m = Math.floor((ra / 15 - h) * 60);
  const s = +((ra / 15 - h - m / 60) * 3600).toFixed(1);
  return { h, m, s };
};

// Gradi decimali → componenti DMS
export const declToDMSParts = dec => {
  const sign = dec >= 0 ? '+' : '-';
  const ad = Math.abs(dec);
  const d  = Math.floor(ad);
  const m  = Math.floor((ad - d) * 60);
  const s  = +((ad - d - m / 60) * 3600).toFixed(1);
  return { sign, d, m, s };
};

// SHA-256 via Web Crypto API (async) — usata per hashing password
export async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ─── Bussola: conversioni per orientamento dispositivo ───────────────────────

// Tempo siderale locale (gradi [0,360)) — da Date + longitudine (Est positivo)
export const localSiderealTime = (date, lonDeg) => {
  const jd = date.getTime() / 86400000 + 2440587.5;  // Unix ms → Julian Date
  const d  = jd - 2451545.0;                          // giorni da J2000.0
  const gmst = ((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360;
  return ((gmst + lonDeg) % 360 + 360) % 360;
};

// Alt-Az → Equatoriale {ra, dec} (gradi). az da Nord verso Est (0=N,90=E,180=S)
export const altAzToEqu = (altDeg, azDeg, latDeg, lstDeg) => {
  const alt = altDeg * D2R, az = azDeg * D2R, lat = latDeg * D2R;
  const dec = Math.asin(Math.max(-1, Math.min(1,
    Math.sin(alt) * Math.sin(lat) + Math.cos(alt) * Math.cos(lat) * Math.cos(az))));
  const cosH = (Math.sin(alt) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  const sinH = -Math.sin(az) * Math.cos(alt) / Math.cos(dec);
  const ra = ((lstDeg - Math.atan2(sinH, Math.max(-1, Math.min(1, cosH))) * R2D) % 360 + 360) % 360;
  return { ra, dec: dec * R2D };
};
