# Jouw Converteer Expert

Gratis bestandsconverter die volledig in je browser draait. Geen uploads, geen accounts, geen limieten.

## Features

- **Bestandsconversies** - Afbeeldingen, video, audio en documenten converteren (PNG, JPEG, WebP, BMP, SVG, GIF, PDF, DOCX, CSV, JSON, Markdown, en meer)
- **YouTube Downloader** - YouTube video's downloaden als audio of video
- **Artikel Lezer** - Artikelen lezen zonder afleiding, omzeilt zachte paywalls

## Hoe werkt het?

| Feature | Lokaal (server.py) | GitHub Pages + Worker |
|---------|-------------------|----------------------|
| Bestandsconversies | Ja (client-side) | Ja (client-side) |
| YouTube downloads | Ja (MP3 via yt-dlp) | Ja (M4A via Piped API) |
| Artikel lezer | Ja (server-side) | Ja (Readability.js) |

## Snel starten

### Optie 1: GitHub Pages + Cloudflare Worker (online, overal toegankelijk)

Alle features werken online met een gratis Cloudflare Worker:

1. **Deploy naar GitHub Pages** (zie onderaan)
2. **Maak een Cloudflare Worker** (zie "Cloudflare Worker Setup")
3. **Plak je Worker URL** in de app (YouTube-tab > Cloudflare Worker URL)

### Optie 2: Lokale server (thuis, met MP3-conversie)

```bash
# Eenmalige setup
pip3 install yt-dlp requests readability-lxml
brew install ffmpeg

# Start de server
python3 server.py
# Open: http://localhost:3002/index.html
```

## Cloudflare Worker Setup (gratis)

De Worker zorgt ervoor dat YouTube en Artikelen ook op GitHub Pages werken.

### Stap 1: Cloudflare account
Ga naar [dash.cloudflare.com](https://dash.cloudflare.com) en maak een gratis account aan.

### Stap 2: Worker aanmaken
1. Ga naar **Workers & Pages** > **Create**
2. Klik **Create Worker**
3. Geef het een naam, bijv. `converteer-api`
4. Klik **Deploy**
5. Klik **Edit code**
6. Verwijder alle code en plak de inhoud van `worker.js`
7. Klik **Save and Deploy**

Je krijgt een URL: `https://converteer-api.jouw-naam.workers.dev`

### Stap 3: In de app configureren
1. Open de app op GitHub Pages
2. Ga naar de **YouTube** tab
3. Plak je Worker URL in het invoerveld
4. Klik **Opslaan**

De URL wordt onthouden in je browser. YouTube en Artikelen werken nu online!

### Limieten (gratis plan)
- 100.000 requests per dag
- Meer dan genoeg voor persoonlijk gebruik

## GitHub Pages deployment

1. Maak een nieuwe repository op [github.com/new](https://github.com/new)
2. Push deze bestanden:
   ```bash
   cd converteer-expert
   git remote add origin https://github.com/JOUW-USERNAME/converteer-expert.git
   git push -u origin main
   ```
3. Ga naar Settings > Pages > Source: **main** branch > Save
4. Je app is beschikbaar op `https://JOUW-USERNAME.github.io/converteer-expert/`

## Bestanden

| Bestand | Beschrijving |
|---------|-------------|
| `index.html` | De volledige app (single file, ~2000 regels) |
| `server.py` | Optionele lokale server voor YouTube/Artikelen |
| `worker.js` | Cloudflare Worker voor online YouTube/Artikelen |

## Technologie

| Feature | Technologie |
|---------|-------------|
| Afbeeldingen | Canvas API, heic2any, custom BMP encoder |
| Video/Audio | FFmpeg.wasm (lazy loaded) |
| PDF lezen | PDF.js (Mozilla) |
| PDF maken | jsPDF + html2canvas |
| DOCX | mammoth.js |
| EPUB | JSZip |
| Markdown | marked.js |
| YouTube (lokaal) | yt-dlp + ffmpeg |
| YouTube (online) | Piped API (open-source) |
| Artikelen (lokaal) | readability-lxml |
| Artikelen (online) | Readability.js (Mozilla) |

## Licentie

MIT
