// ─── Caricamento catalogo stellare ────────────────────────────────────────────
import { state } from './state.js';
import { s2c, c2s, norm } from './math.js';

const BASE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/';

// ── Nomi costellazioni in italiano ────────────────────────────────────────────
const CONST_IT = {
  'Andromeda':'Andromeda','Antlia':'Macchina Pneumatica','Apus':'Uccello del Paradiso',
  'Aquarius':'Acquario','Aquila':'Aquila','Ara':'Altare','Aries':'Ariete',
  'Auriga':'Auriga','Boötes':'Boote','Bootes':'Boote','Caelum':'Bulino',
  'Camelopardalis':'Giraffa','Cancer':'Cancro','Canes Venatici':'Cani da Caccia',
  'Canis Major':'Cane Maggiore','Canis Minor':'Cane Minore','Capricornus':'Capricorno',
  'Carina':'Carena','Cassiopeia':'Cassiopea','Centaurus':'Centauro','Cepheus':'Cefeo',
  'Cetus':'Balena','Chamaeleon':'Camaleonte','Circinus':'Compasso','Columba':'Colomba',
  'Coma Berenices':'Chioma di Berenice','Corona Australis':'Corona Australe',
  'Corona Borealis':'Corona Boreale','Corvus':'Corvo','Crater':'Coppa',
  'Crux':'Croce del Sud','Cygnus':'Cigno','Delphinus':'Delfino','Dorado':'Pesce Spada',
  'Draco':'Dragone','Equuleus':'Puledro','Eridanus':'Eridano','Fornax':'Fornace',
  'Gemini':'Gemelli','Grus':'Gru','Hercules':'Ercole','Horologium':'Orologio',
  'Hydra':'Idra','Hydrus':'Idra Maschio','Indus':'Indiano','Lacerta':'Lucertola',
  'Leo':'Leone','Leo Minor':'Leone Minore','Lepus':'Lepre','Libra':'Bilancia',
  'Lupus':'Lupo','Lynx':'Lince','Lyra':'Lira','Mensa':'Mensa',
  'Microscopium':'Microscopio','Monoceros':'Unicorno','Musca':'Mosca',
  'Norma':'Squadra','Octans':'Ottante','Ophiuchus':'Ofiuco','Orion':'Orione',
  'Pavo':'Pavone','Pegasus':'Pegaso','Perseus':'Perseo','Phoenix':'Fenice',
  'Pictor':'Pittore','Pisces':'Pesci','Piscis Austrinus':'Pesce Australe',
  'Puppis':'Poppa','Pyxis':'Bussola','Reticulum':'Reticolo','Sagitta':'Freccia',
  'Sagittarius':'Sagittario','Scorpius':'Scorpione','Sculptor':'Scultore',
  'Scutum':'Scudo','Serpens':'Serpente','Sextans':'Sestante','Taurus':'Toro',
  'Telescopium':'Telescopio','Triangulum':'Triangolo',
  'Triangulum Australe':'Triangolo Australe','Tucana':'Tucano',
  'Ursa Major':'Orsa Maggiore','Ursa Minor':'Orsa Minore','Vela':'Vele',
  'Virgo':'Vergine','Volans':'Pesce Volante','Vulpecula':'Volpetta',
};

// ── Nomi propri stelle (forma italiana o tradizionale) ────────────────────────
const STAR_IT = {
  'Sirius':'Sirio','Canopus':'Canopo','Arcturus':'Arturo','Capella':'Capella',
  'Procyon':'Procione','Pollux':'Polluce','Castor':'Castore','Regulus':'Regolo',
  'Achernar':'Achernar','Betelgeuse':'Betelgeuse','Rigel':'Rigel','Vega':'Vega',
  'Altair':'Altair','Deneb':'Deneb','Antares':'Antares','Spica':'Spica',
  'Fomalhaut':'Fomalhaut','Aldebaran':'Aldebaran','Hadar':'Hadar','Mimosa':'Mimosa',
  'Gacrux':'Gacrux','Acrux':'Acrux','Adhara':'Adhara','Bellatrix':'Bellatrix',
  'Alnilam':'Alnilam','Alnitak':'Alnitak','Mintaka':'Mintaka','Saiph':'Saiph',
  'Rigil Kentaurus':'Rigil Kent.','Toliman':'Toliman',
  'Polaris':'Polaris','Alioth':'Alioth','Dubhe':'Dubhe','Merak':'Merak',
  'Phecda':'Phecda','Megrez':'Megrez','Mizar':'Mizar','Alkaid':'Alkaid',
  'Alcor':'Alcor','Thuban':'Thuban','Alphard':'Alfard','Denebola':'Denebola',
  'Algieba':'Algieba','Zosma':'Zosma','Chara':'Chara','Cor Caroli':'Cor Caroli',
  'Izar':'Izar','Muphrid':'Muphrid','Seginus':'Seginus',
  'Alphecca':'Alfecca','Nunki':'Nunki',
  'Kaus Australis':'Kaus Australis','Kaus Media':'Kaus Media','Kaus Borealis':'Kaus Borealis',
  'Shaula':'Shaula','Lesath':'Lesath','Dschubba':'Dschubba','Graffias':'Graffias',
  'Sargas':'Sargas','Girtab':'Girtab',
  'Alcyone':'Alcione','Merope':'Merope','Maia':'Maia','Taygeta':'Taigete',
  'Electra':'Elettra','Celaeno':'Celeno','Sterope':'Sterope','Pleione':'Pleione',
  'Atlas':'Atlante',
  'Algol':'Algol','Mirfak':'Mirfak','Algenik':'Algenik',
  'Algenib':'Algenib','Alpheratz':'Alpheratz','Mirach':'Mirach','Almach':'Almach',
  'Hamal':'Hamal','Sheratan':'Sheratan','Mesarthim':'Mesarthim',
  'Elnath':'Elnath','Alhena':'Alhena','Tejat':'Tejat',
  'Propus':'Propus','Mebsuda':'Mebsuda','Alzirr':'Alzirr',
  'Ascella':'Ascella','Alnasl':'Alnasl',
  'Rasalhague':'Rasalhague','Sabik':'Sabik',
  'Yed Prior':'Yed Prior','Yed Posterior':'Yed Posterior','Cebalrai':'Cebalrai',
  'Enif':'Enif','Scheat':'Scheat','Markab':'Markab',
  'Deneb Algedi':'Deneb Algedi','Sadalsuud':'Sadalsuud','Sadalmelik':'Sadalmelik',
  'Skat':'Skat','Ancha':'Ancha',
  'Peacock':'Pavone','Atria':'Atria',
  'Acamar':'Acamar','Cursa':'Cursa','Zaurak':'Zaurak',
  'Phact':'Phact','Wazn':'Wazn',
  'Wezen':'Wezen','Aludra':'Aludra','Furud':'Furud',
  'Naos':'Naos','Regor':'Regor',
  'Avior':'Avior','Miaplacidus':'Miaplacidus','Aspidiske':'Aspidiske','Tureis':'Tureis',
  'Alnair':'Alnair','Tiaki':'Tiaki',
  'Alderamin':'Alderamin','Errai':'Errai','Alfirk':'Alfirk',
  'Schedar':'Schedar','Caph':'Caph','Tsih':'Tsih','Segin':'Segin','Ruchbah':'Ruchbah',
  'Navi':'Navi','Ankaa':'Ankaa','Suhail':'Suhail',
  'Zubenelgenubi':'Zubenelgenubi','Zubeneschamali':'Zubeneschamali',
  'Gienah':'Gienah','Gienah Cygni':'Gienah','Algorab':'Algorab','Kraz':'Kraz','Minkar':'Minkar',
  'Porrima':'Porrima','Vindemiatrix':'Vindemiatrix','Heze':'Heze','Unukalhai':'Unukalhai',
  'Eltanin':'Eltanin','Rastaban':'Rastaban','Grumium':'Grumium',
  'Alwaid':'Alwaid','Alrakis':'Alrakis',
  'Kochab':'Kochab','Pherkad':'Pherkad','Yildun':'Yildun','Sadalbari':'Sadalbari',
  'Sadr':'Sadr','Aljanah':'Aljanah','Rukh':'Rukh','Albireo':'Albireo',
  'Tarazed':'Tarazed','Alshain':'Alshain',
  'Sulafat':'Sulafat','Sheliak':'Sheliak','Unuk':'Unuk','Phad':'Phad',
};

// ── Abbreviazioni IAU → nome esteso (usate come feat.id in d3-celestial) ──────
const CONST_IAU = {
  'And':'Andromeda','Ant':'Antlia','Aps':'Apus','Aqr':'Aquarius','Aql':'Aquila',
  'Ara':'Ara','Ari':'Aries','Aur':'Auriga','Boo':'Boötes','Cae':'Caelum',
  'Cam':'Camelopardalis','Cnc':'Cancer','CVn':'Canes Venatici','CMa':'Canis Major',
  'CMi':'Canis Minor','Cap':'Capricornus','Car':'Carina','Cas':'Cassiopeia',
  'Cen':'Centaurus','Cep':'Cepheus','Cet':'Cetus','Cha':'Chamaeleon',
  'Cir':'Circinus','Col':'Columba','Com':'Coma Berenices','CrA':'Corona Australis',
  'CrB':'Corona Borealis','Crv':'Corvus','Crt':'Crater','Cru':'Crux',
  'Cyg':'Cygnus','Del':'Delphinus','Dor':'Dorado','Dra':'Draco',
  'Equ':'Equuleus','Eri':'Eridanus','For':'Fornax','Gem':'Gemini',
  'Gru':'Grus','Her':'Hercules','Hor':'Horologium','Hya':'Hydra',
  'Hyi':'Hydrus','Ind':'Indus','Lac':'Lacerta','Leo':'Leo',
  'LMi':'Leo Minor','Lep':'Lepus','Lib':'Libra','Lup':'Lupus',
  'Lyn':'Lynx','Lyr':'Lyra','Men':'Mensa','Mic':'Microscopium',
  'Mon':'Monoceros','Mus':'Musca','Nor':'Norma','Oct':'Octans',
  'Oph':'Ophiuchus','Ori':'Orion','Pav':'Pavo','Peg':'Pegasus',
  'Per':'Perseus','Phe':'Phoenix','Pic':'Pictor','Psc':'Pisces',
  'PsA':'Piscis Austrinus','Pup':'Puppis','Pyx':'Pyxis','Ret':'Reticulum',
  'Sge':'Sagitta','Sgr':'Sagittarius','Sco':'Scorpius','Scl':'Sculptor',
  'Sct':'Scutum','Ser':'Serpens','Sex':'Sextans','Tau':'Taurus',
  'Tel':'Telescopium','Tri':'Triangulum','TrA':'Triangulum Australe',
  'Tuc':'Tucana','UMa':'Ursa Major','UMi':'Ursa Minor','Vel':'Vela',
  'Vir':'Virgo','Vol':'Volans','Vul':'Vulpecula',
};

function transConst(name) {
  // Prova prima il nome esteso, poi l'abbreviazione IAU
  return CONST_IT[name] || CONST_IT[CONST_IAU[name]] || CONST_IAU[name] || name;
}
function transStar(name)  { return STAR_IT[name]  || name; }

// ── Catalogo di riserva (se GitHub non è raggiungibile) ───────────────────────
const FALLBACK = [
  {ra:101.29,dec:-16.72,mag:-1.46,bv: 0.00,name:'Sirio'},
  {ra: 95.99,dec:-52.70,mag:-0.72,bv: 0.15,name:'Canopo'},
  {ra:213.92,dec: 19.18,mag:-0.04,bv: 1.23,name:'Arturo'},
  {ra:219.92,dec:-60.83,mag:-0.27,bv: 0.71,name:'Rigil Kent.'},
  {ra:279.23,dec: 38.78,mag: 0.03,bv: 0.00,name:'Vega'},
  {ra: 79.17,dec: 45.99,mag: 0.08,bv: 0.80,name:'Capella'},
  {ra: 78.63,dec: -8.20,mag: 0.12,bv:-0.03,name:'Rigel'},
  {ra:114.83,dec:  5.22,mag: 0.34,bv: 0.42,name:'Procione'},
  {ra: 88.79,dec:  7.41,mag: 0.42,bv: 1.85,name:'Betelgeuse'},
  {ra: 24.43,dec:-57.24,mag: 0.46,bv:-0.16,name:'Achernar'},
  {ra:210.96,dec:-60.37,mag: 0.61,bv:-0.23,name:'Hadar'},
  {ra:297.70,dec:  8.87,mag: 0.77,bv: 0.22,name:'Altair'},
  {ra: 68.98,dec: 16.51,mag: 0.85,bv: 1.54,name:'Aldebaran'},
  {ra:247.35,dec:-26.43,mag: 0.96,bv: 1.83,name:'Antares'},
  {ra:201.30,dec:-11.16,mag: 1.04,bv:-0.24,name:'Spica'},
  {ra:116.33,dec: 28.03,mag: 1.14,bv: 1.00,name:'Polluce'},
  {ra:344.41,dec:-29.62,mag: 1.16,bv: 0.09,name:'Fomalhaut'},
  {ra:310.36,dec: 45.28,mag: 1.25,bv: 0.09,name:'Deneb'},
  {ra:191.93,dec:-59.69,mag: 1.30,bv:-0.24,name:'Mimosa'},
  {ra:152.09,dec: 11.97,mag: 1.35,bv:-0.11,name:'Regolo'},
  {ra:186.65,dec:-63.10,mag: 1.63,bv:-0.24,name:'Gacrux'},
  {ra:113.65,dec: 31.89,mag: 1.58,bv: 0.03,name:'Castore'},
  {ra: 95.17,dec:-17.96,mag: 1.50,bv:-0.21,name:'Adhara'},
  {ra: 76.37,dec:  6.35,mag: 1.64,bv:-0.22,name:'Bellatrix'},
  {ra: 85.19,dec: -1.20,mag: 1.70,bv:-0.19,name:'Alnilam'},
  {ra: 37.95,dec: 89.26,mag: 2.02,bv: 0.63,name:'Polaris'},
  {ra:194.01,dec: 54.93,mag: 1.86,bv: 0.08,name:'Alioth'},
  {ra:165.93,dec: 61.75,mag: 1.79,bv: 0.17,name:'Dubhe'},
].sort((a, b) => b.mag - a.mag);

// ── Caricamento asincrono ─────────────────────────────────────────────────────
export async function loadData() {
  const lfill   = document.getElementById('lfill');
  const loading = document.getElementById('loading');

  try {
    lfill.style.width = '10%';
    const [sRes, cRes, nRes] = await Promise.all([
      fetch(BASE + 'stars.6.json'),
      fetch(BASE + 'constellations.lines.json'),
      fetch(BASE + 'starnames.json'),
    ]);
    lfill.style.width = '50%';
    if (!sRes.ok || !cRes.ok) throw new Error('fetch failed');

    const [sJson, cJson, nJson] = await Promise.all([
      sRes.json(), cRes.json(),
      nRes.ok ? nRes.json() : Promise.resolve({}),
    ]);
    lfill.style.width = '85%';

    // starnames.json: { "hipId": { "name": "Sirius", ... }, ... }
    // Costruiamo mappa id → nome tradotto in italiano
    const nameMap = {};
    for (const [hip, data] of Object.entries(nJson)) {
      const raw = (data.name || data.proper || '').trim();
      if (raw) nameMap[String(hip)] = transStar(raw);
    }

    // Stelle — abbina il nome tramite id Hipparcos
    state.stars = sJson.features.map(f => ({
      ra:   ((f.geometry.coordinates[0] % 360) + 360) % 360,
      dec:  f.geometry.coordinates[1],
      mag:  f.properties.mag,
      bv:   f.properties.bv,
      name: nameMap[String(f.id)] || '',
      asterism: false,
    })).sort((a, b) => b.mag - a.mag);

    // Raccoglie coordinate vertici asterismi per marcare le stelle coinvolte
    const asterismSet = new Set();
    for (const feat of cJson.features) {
      const geom  = feat.geometry;
      const lines = geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates];
      for (const line of lines)
        for (const [ra, dec] of line)
          asterismSet.add(`${(((ra % 360) + 360) % 360).toFixed(1)},${dec.toFixed(1)}`);
    }
    for (const s of state.stars)
      s.asterism = asterismSet.has(`${s.ra.toFixed(1)},${s.dec.toFixed(1)}`);

    // Costellazioni — applica nomi italiani
    state.constSegs = [];
    state.constData = [];

    for (const feat of cJson.features) {
      const geom  = feat.geometry;
      const lines = geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates];
      const segs  = [];

      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const seg = [
            [((line[i][0]   % 360) + 360) % 360, line[i][1]],
            [((line[i+1][0] % 360) + 360) % 360, line[i+1][1]],
          ];
          segs.push(seg);
          state.constSegs.push(seg);
        }
      }

      const pts = segs.flat();
      let sx = 0, sy = 0, sz = 0;
      for (const [ra, dec] of pts) {
        const v = s2c(ra, dec); sx += v[0]; sy += v[1]; sz += v[2];
      }
      const { ra: centRa, dec: centDec } =
        c2s(norm([sx / pts.length, sy / pts.length, sz / pts.length]));
      const rawName = (feat.properties.name || feat.id || '').trim();

      state.constData.push({
        name: transConst(rawName),
        segs, centRa, centDec,
      });
    }

    lfill.style.width = '100%';

  } catch (e) {
    console.warn('Catalogo non disponibile — fallback:', e);
    state.stars     = FALLBACK;
    state.constSegs = [];
    state.constData = [];
    const toast = document.getElementById('error-toast');
    if (toast) { toast.style.display = 'block'; setTimeout(() => toast.style.display = 'none', 5000); }
  }

  await new Promise(r => setTimeout(r, 300));
  loading.classList.add('out');
  setTimeout(() => loading.style.display = 'none', 1500);
}
