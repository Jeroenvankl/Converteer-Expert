# Jouw Converteer Expert — Handleiding

## Dagelijks gebruik op je Mac

### Stap 1: Open Terminal
Zoek "Terminal" via Spotlight (Cmd + Spatiebalk) of vind het in Programma's > Hulpprogramma's.

### Stap 2: Start de server
Kopieer en plak dit in Terminal:

```
cd ~/Downloads/AI\ Apps && python3 server.py
```

Je ziet dan:
```
=== Jouw Converteer Expert - Server ===
  yt-dlp:         OK
  ffmpeg:         OK
  Node.js:        OK
  readability:    OK
Server draait op http://localhost:3002
```

### Stap 3: Open de app
Ga in je browser (Safari/Chrome) naar:

```
http://localhost:3002/converteeralles.html
```

### Stap 4: Gebruik de app
- **Bestanden tab** — Sleep een bestand of klik om te kiezen, kies formaat, klik Converteer
- **YouTube tab** — Plak een YouTube-link, kies MP3 of MP4, klik Download
- **Artikelen tab** — Plak een artikel-URL, klik Lees

### Stap 5: Server stoppen
Druk op `Ctrl + C` in Terminal wanneer je klaar bent.

---

## YouTube Downloader — Hoe werkt het?

De YouTube-downloader werkt als volgt:

1. Jij plakt een YouTube-link in de app
2. De app stuurt de link naar `server.py` op je Mac
3. `server.py` gebruikt `yt-dlp` (een programma op je Mac) om de video op te halen
4. Het bestand wordt gedownload naar je Mac en aangeboden als download in de browser

**Belangrijk:** Dit werkt ALLEEN als `server.py` draait. Zonder server is er geen YouTube-functie.

### Op andere apparaten (iPad/iPhone)

YouTube downloaden werkt ook op je iPad/iPhone, mits:

1. Je Mac staat AAN en `server.py` draait
2. Je iPad/iPhone zit op hetzelfde WiFi-netwerk als je Mac
3. Je opent de app via het IP-adres van je Mac (bijv. `http://192.168.1.x:3002/converteeralles.html`)

Het gedownloade bestand wordt dan opgeslagen op je iPad/iPhone (via Safari's downloadfunctie).

### Op GitHub Pages

YouTube downloaden werkt NIET op GitHub Pages. Er is geen server beschikbaar om yt-dlp te draaien. Alleen bestandsconversies werken online.

---

## iPad/iPhone toegang

### Methode 1: Lokaal netwerk (aanbevolen)

1. Zorg dat je Mac en iPad/iPhone op hetzelfde WiFi zitten
2. Vind je Mac's IP-adres:
   - Mac: ga naar Systeeminstellingen > Wi-Fi > klik op je netwerk > Details
   - Of typ in Terminal: `ifconfig en0 | grep inet`
   - Je IP is iets als `192.168.1.42`
3. Start de server op je Mac: `cd ~/Downloads/AI\ Apps && python3 server.py`
4. Open Safari op je iPad/iPhone en ga naar:
   `http://192.168.1.42:3002/converteeralles.html`
   (vervang IP door jouw IP)
5. Optioneel: tik op deel-icoon > "Zet op beginscherm" voor app-icoon

### Methode 2: GitHub Pages (altijd beschikbaar)

Na deployment op GitHub Pages kun je overal de bestandsconversies gebruiken. YouTube en Artikelen werken dan niet.

---

## Probleemoplossing

### Server start niet (poort 3002 bezet)
```
lsof -i :3002
kill -9 [PID]
```
Start daarna opnieuw: `python3 server.py`

### YouTube download mislukt
- Check of yt-dlp up-to-date is: `pip3 install -U yt-dlp`
- Check of ffmpeg werkt: `ffmpeg -version`
- Sommige video's zijn geblokkeerd in bepaalde regio's

### Firewall blokkeert toegang vanaf iPad/iPhone
- Ga naar Systeeminstellingen > Netwerk > Firewall
- Schakel tijdelijk uit, of voeg uitzondering toe voor Python

---

## Eenmalige setup (als je dit nog niet gedaan hebt)

```bash
# Python dependencies
pip3 install yt-dlp requests readability-lxml

# ffmpeg (voor audio/video verwerking)
brew install ffmpeg

# Node.js (als je het nog niet hebt)
# Download van https://nodejs.org
```
