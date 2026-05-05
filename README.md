# AstroGallery — Stellario interattivo

Gallery fotografica astrofotografica con stellario navigabile.

## Struttura

```
astrogallery/
├── index.html          ← HTML puro (solo struttura)
├── css/
│   └── style.css       ← tutto il CSS
├── js/
│   ├── main.js         ← entry point: interazione, toggles, init
│   ├── state.js        ← stato condiviso (unica istanza per tutti i moduli)
│   ├── math.js         ← funzioni matematiche pure
│   ├── starmap.js      ← proiezione gnomonica + rendering canvas
│   ├── dso.js          ← popup hover + lightbox galleria
│   ├── admin.js        ← pannello gestione catalogo
│   ├── data.js         ← oggetti DSO defaults + localStorage
│   └── catalog.js      ← caricamento catalogo stellare (d3-celestial)
└── data/               ← cartella per objects.json esportati
```

## Sviluppo locale

I moduli ES (`type="module"`) richiedono un server HTTP.
**Non aprire `index.html` direttamente nel browser** — i moduli non funzionano su `file://`.

### Opzione 1 — VS Code Live Server
Installa l'estensione **Live Server**, click destro su `index.html` → *Open with Live Server*.

### Opzione 2 — Python (nessuna installazione)
```bash
cd astrogallery
python3 -m http.server 8080
# poi apri http://localhost:8080
```

### Opzione 3 — Node.js
```bash
npx serve astrogallery
```

## Deploy su GitHub Pages

1. Crea un repository su GitHub
2. Carica la cartella `astrogallery/` nella root del repo
3. Vai su **Settings → Pages** → Source: `main` branch, cartella `/ (root)`
4. Il sito sarà disponibile su `https://username.github.io/astrogallery/`

## Foto e Cloudinary

Le URL delle foto sono nel formato Cloudinary:
- Full:  `https://res.cloudinary.com/{cloud}/image/upload/mia_foto.jpg`
- Thumb: auto-generata dal pannello admin inserendo l'URL full

Il pannello admin (pulsante GESTIONE) riconosce automaticamente le URL Cloudinary
e genera la thumbnail con trasformazione `w_320,h_240,c_fill`.

## Aggiungere oggetti DSO

1. Naviga lo stellario fino all'area desiderata
2. Apri il pannello GESTIONE
3. Clicca sulla mappa per inserire le coordinate (AR/Dec si auto-compilano)
4. Completa i campi e aggiungi le URL delle foto
5. Click AGGIUNGI AL CATALOGO → salvato automaticamente in localStorage
6. Usa ESPORTA JSON per avere una copia del catalogo da versionare nel repo
