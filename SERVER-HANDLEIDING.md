# 🎬🎵 Lokale Server Handleiding — YouTube & Spotify Downloads

Met de lokale server download je betrouwbaar YouTube-video's en Spotify-muziek als MP3, MP4 of FLAC.

---

## ⚡ Snelstart (3 stappen)

### 1. Installeer dependencies (eenmalig)

```bash
pip install yt-dlp spotdl
```

> **Heb je geen pip?** Installeer eerst Python 3: [python.org/downloads](https://www.python.org/downloads/)
>
> **Alleen YouTube nodig?** Dan is `pip install yt-dlp` voldoende.
> **Alleen Spotify nodig?** Dan is `pip install spotdl` voldoende.

### 2. Start de server

```bash
cd pad/naar/converteer-expert
python3 server.py
```

Je ziet: `Server draait op http://localhost:3002`

### 3. Open de app

Ga naar **http://localhost:3002** in je browser → YouTube of Spotify tab → plak een link → download!

---

## 📱 Gebruiken op iPad / iPhone

Je kunt de app ook op je telefoon/tablet gebruiken zolang je Mac de server draait:

1. Zoek je Mac's IP-adres: **Systeeminstellingen → Wi-Fi → Details → IP-adres** (bijv. `192.168.1.42`)
2. Open op je iPad/iPhone: `http://192.168.1.42:3002`
3. Beide apparaten moeten op hetzelfde Wi-Fi-netwerk zitten

---

## 🎵 Spotify Downloads

Spotify-downloads gebruiken **spotdl**, dat nummers zoekt op YouTube en met de juiste metadata als MP3/FLAC downloadt.

### Wat werkt?
- **Enkel nummer**: `https://open.spotify.com/track/...` → download als MP3 of FLAC
- **Album**: `https://open.spotify.com/album/...` → download alle nummers als ZIP
- **Playlist**: `https://open.spotify.com/playlist/...` → download alle nummers als ZIP

### Tips
- Albums/playlists met veel nummers kunnen even duren
- FLAC-bestanden zijn groter maar van betere kwaliteit
- Metadata (artiest, album, albumhoes) wordt automatisch toegevoegd

---

## 🔧 Veelgestelde vragen

**yt-dlp niet gevonden?**
```bash
pip3 install yt-dlp
# of:
python3 -m pip install yt-dlp
```

**spotdl niet gevonden?**
```bash
pip3 install spotdl
# of:
python3 -m pip install spotdl
```

**Poort 3002 is bezet?**
```bash
lsof -i :3002
kill -9 <PID>
python3 server.py
```

**ffmpeg niet gevonden?**
Zowel yt-dlp als spotdl hebben ffmpeg nodig voor conversies:
```bash
brew install ffmpeg    # macOS
# of download van https://ffmpeg.org
```

**Spotify rate limit fout?**
Als je de foutmelding "rate limit" krijgt, kun je eigen Spotify API credentials instellen:
1. Ga naar [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Maak een nieuwe app aan (redirect URI: `http://localhost:8888/callback`)
3. Kopieer je Client ID en Client Secret
4. Start de server met:
```bash
SPOTIFY_CLIENT_ID=jouw_id SPOTIFY_CLIENT_SECRET=jouw_secret python3 server.py
```

**yt-dlp of spotdl updaten (bij fouten)?**
```bash
pip install --upgrade yt-dlp spotdl
```

---

## 📝 Dagelijks gebruik

1. Open Terminal
2. `cd pad/naar/converteer-expert && python3 server.py`
3. Open `http://localhost:3002` in je browser
4. Gebruik de YouTube tab om video's te downloaden
5. Sluit de server af met `Ctrl+C`
