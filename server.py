#!/usr/bin/env python3
"""
Jouw Converteer Expert - Local Server
Serves the HTML app and handles YouTube downloads via yt-dlp.

Usage:
    pip install yt-dlp    (eenmalig)
    python3 server.py     (start de server)

Open daarna: http://localhost:3002/index.html
"""

import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
from pathlib import Path
from html.parser import HTMLParser

PORT = 3002
SERVE_DIR = os.path.dirname(os.path.abspath(__file__))

# Node.js path (needed by yt-dlp for YouTube extraction)
NODE_DIR = os.path.expanduser('~/local/node-v22.16.0-darwin-x64/bin')

# Build PATH with Node.js included
ENV_WITH_NODE = os.environ.copy()
ENV_WITH_NODE['PATH'] = NODE_DIR + ':' + ENV_WITH_NODE.get('PATH', '')

# Store active jobs for progress tracking
jobs = {}


def check_ytdlp():
    """Check if yt-dlp is installed."""
    return shutil.which('yt-dlp') is not None


def check_ffmpeg():
    """Check if ffmpeg is installed."""
    return shutil.which('ffmpeg', path=ENV_WITH_NODE['PATH']) is not None


class ConvertHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SERVE_DIR, **kwargs)

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/youtube/info':
            self._handle_youtube_info()
        elif self.path == '/api/youtube/download':
            self._handle_youtube_download()
        elif self.path == '/api/article':
            self._handle_article()
        else:
            self.send_error(404, 'Not found')

    def do_GET(self):
        if self.path.startswith('/api/youtube/status/'):
            self._handle_job_status()
        elif self.path.startswith('/api/youtube/file/'):
            self._handle_job_file()
        else:
            super().do_GET()

    def _read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        return json.loads(body)

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _handle_youtube_info(self):
        """Get video info (title, duration, thumbnail)."""
        if not check_ytdlp():
            self._send_json({'error': 'yt-dlp is niet geïnstalleerd. Voer uit: pip install yt-dlp'}, 500)
            return

        try:
            body = self._read_json_body()
            url = body.get('url', '')

            if not url:
                self._send_json({'error': 'Geen URL opgegeven'}, 400)
                return

            # Get video info without downloading
            cmd = [
                'yt-dlp', '--dump-json', '--no-download',
                '--no-warnings', '--no-playlist',
                '--js-runtimes', 'nodejs',
                url
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=ENV_WITH_NODE)

            if result.returncode != 0:
                error_msg = result.stderr.strip() or 'Kon video-informatie niet ophalen'
                self._send_json({'error': error_msg}, 400)
                return

            info = json.loads(result.stdout)
            self._send_json({
                'title': info.get('title', 'Onbekend'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'uploader': info.get('uploader', ''),
                'view_count': info.get('view_count', 0),
            })

        except subprocess.TimeoutExpired:
            self._send_json({'error': 'Timeout bij ophalen video-info'}, 500)
        except Exception as e:
            self._send_json({'error': str(e)}, 500)

    def _handle_youtube_download(self):
        """Start a YouTube download job."""
        if not check_ytdlp():
            self._send_json({'error': 'yt-dlp is niet geïnstalleerd. Voer uit: pip install yt-dlp'}, 500)
            return

        try:
            body = self._read_json_body()
            url = body.get('url', '')
            fmt = body.get('format', 'mp3')

            if not url:
                self._send_json({'error': 'Geen URL opgegeven'}, 400)
                return

            if fmt not in ('mp3', 'mp4'):
                self._send_json({'error': 'Ongeldig formaat. Kies mp3 of mp4.'}, 400)
                return

            # Create job
            job_id = f"job_{int(time.time() * 1000)}"
            temp_dir = tempfile.mkdtemp(prefix='converteer_')
            output_template = os.path.join(temp_dir, '%(title)s.%(ext)s')

            job = {
                'id': job_id,
                'status': 'downloading',
                'progress': 0,
                'title': '',
                'filename': '',
                'filepath': '',
                'temp_dir': temp_dir,
                'error': None,
            }
            jobs[job_id] = job

            # Start download in background thread
            thread = threading.Thread(
                target=self._run_download,
                args=(job_id, url, fmt, output_template, temp_dir),
                daemon=True
            )
            thread.start()

            self._send_json({'job_id': job_id})

        except Exception as e:
            self._send_json({'error': str(e)}, 500)

    def _run_download(self, job_id, url, fmt, output_template, temp_dir):
        """Run yt-dlp download in background thread."""
        job = jobs[job_id]

        try:
            if fmt == 'mp3':
                cmd = [
                    'yt-dlp',
                    '-x', '--audio-format', 'mp3',
                    '--audio-quality', '0',
                    '--no-playlist',
                    '--newline',
                    '--js-runtimes', 'nodejs',
                    '--progress-template', '%(progress._percent_str)s',
                    '-o', output_template,
                    url
                ]
            else:
                cmd = [
                    'yt-dlp',
                    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                    '--merge-output-format', 'mp4',
                    '--no-playlist',
                    '--newline',
                    '--js-runtimes', 'nodejs',
                    '--progress-template', '%(progress._percent_str)s',
                    '-o', output_template,
                    url
                ]

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=ENV_WITH_NODE
            )

            # Parse progress from stdout
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                # Try to parse percentage
                try:
                    if '%' in line:
                        pct_str = line.replace('%', '').strip()
                        pct = float(pct_str)
                        job['progress'] = min(pct, 99)
                except (ValueError, IndexError):
                    pass
                # Check for title in metadata lines
                if line.startswith('[download] Destination:'):
                    job['title'] = Path(line.split('Destination:')[1].strip()).stem

            process.wait()

            if process.returncode != 0:
                stderr = process.stderr.read()
                job['status'] = 'error'
                job['error'] = stderr or 'Download mislukt'
                return

            # Find the output file
            files = os.listdir(temp_dir)
            if not files:
                job['status'] = 'error'
                job['error'] = 'Geen bestand gevonden na download'
                return

            # Get the most recently modified file (in case of conversion)
            files_with_time = [(f, os.path.getmtime(os.path.join(temp_dir, f))) for f in files]
            files_with_time.sort(key=lambda x: x[1], reverse=True)
            filename = files_with_time[0][0]

            job['status'] = 'done'
            job['progress'] = 100
            job['filename'] = filename
            job['filepath'] = os.path.join(temp_dir, filename)
            if not job['title']:
                job['title'] = Path(filename).stem

        except Exception as e:
            job['status'] = 'error'
            job['error'] = str(e)

    def _handle_job_status(self):
        """Check job status."""
        job_id = self.path.split('/')[-1]
        job = jobs.get(job_id)

        if not job:
            self._send_json({'error': 'Job niet gevonden'}, 404)
            return

        self._send_json({
            'status': job['status'],
            'progress': job['progress'],
            'title': job['title'],
            'filename': job['filename'],
            'error': job['error'],
        })

    def _handle_job_file(self):
        """Download the completed file."""
        job_id = self.path.split('/')[-1]
        job = jobs.get(job_id)

        if not job:
            self.send_error(404, 'Job niet gevonden')
            return

        if job['status'] != 'done' or not job['filepath']:
            self.send_error(400, 'Bestand nog niet klaar')
            return

        filepath = job['filepath']
        filename = job['filename']

        if not os.path.exists(filepath):
            self.send_error(404, 'Bestand niet meer beschikbaar')
            return

        # Determine content type
        if filename.endswith('.mp3'):
            content_type = 'audio/mpeg'
        elif filename.endswith('.mp4'):
            content_type = 'video/mp4'
        else:
            content_type = 'application/octet-stream'

        file_size = os.path.getsize(filepath)

        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(file_size))
        self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        with open(filepath, 'rb') as f:
            shutil.copyfileobj(f, self.wfile)

        # Cleanup after download
        try:
            os.remove(filepath)
            os.rmdir(job['temp_dir'])
            del jobs[job_id]
        except Exception:
            pass

    def _handle_article(self):
        """Fetch a URL and extract the article content (like Reader Mode)."""
        try:
            body = self._read_json_body()
            url = body.get('url', '')

            if not url:
                self._send_json({'error': 'Geen URL opgegeven'}, 400)
                return

            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url

            # Try readability-lxml first, fall back to built-in extractor
            try:
                import requests
                from readability import Document
                has_readability = True
            except ImportError:
                has_readability = False

            if has_readability:
                resp = requests.get(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                }, timeout=15, allow_redirects=True)
                resp.raise_for_status()
                resp.encoding = resp.apparent_encoding or 'utf-8'

                doc = Document(resp.text)
                title = doc.title()
                content_html = doc.summary()

                # Clean up with BeautifulSoup if available
                try:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(content_html, 'html.parser')
                    # Remove scripts, styles, iframes, SVGs, nav, aside, forms
                    for tag in soup.find_all(['script', 'style', 'iframe', 'noscript', 'svg', 'nav', 'aside', 'form', 'button', 'input']):
                        tag.decompose()
                    content_html = str(soup)
                except ImportError:
                    import re as _re
                    # Basic cleanup without BS4 - remove SVGs and scripts
                    content_html = _re.sub(r'<svg[^>]*>.*?</svg>', '', content_html, flags=_re.DOTALL | _re.IGNORECASE)
                    content_html = _re.sub(r'<script[^>]*>.*?</script>', '', content_html, flags=_re.DOTALL | _re.IGNORECASE)
                    content_html = _re.sub(r'<style[^>]*>.*?</style>', '', content_html, flags=_re.DOTALL | _re.IGNORECASE)

                self._send_json({
                    'title': title,
                    'content': content_html,
                    'url': url,
                    'method': 'readability'
                })
            else:
                # Fallback: use urllib (no external dependencies)
                import urllib.request
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
                })
                with urllib.request.urlopen(req, timeout=15) as resp:
                    html = resp.read().decode('utf-8', errors='replace')

                title, content_html = self._extract_article_fallback(html)

                self._send_json({
                    'title': title,
                    'content': content_html,
                    'url': url,
                    'method': 'fallback'
                })

        except Exception as e:
            self._send_json({'error': str(e)}, 500)

    @staticmethod
    def _extract_article_fallback(html):
        """Basic article extraction without external libraries."""
        # Extract title
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else 'Onbekend'
        title = re.sub(r'<[^>]+>', '', title)  # strip tags from title

        # Try to find article content
        # Priority: <article>, <main>, role="main", common content class names
        content = ''

        # Try <article> tag
        article_match = re.search(r'<article[^>]*>(.*?)</article>', html, re.DOTALL | re.IGNORECASE)
        if article_match:
            content = article_match.group(1)
        else:
            # Try <main> tag
            main_match = re.search(r'<main[^>]*>(.*?)</main>', html, re.DOTALL | re.IGNORECASE)
            if main_match:
                content = main_match.group(1)
            else:
                # Try common content divs
                for pattern in [
                    r'class="[^"]*(?:article|post|entry|content|story|body-text)[^"]*"[^>]*>(.*?)</div>',
                    r'id="[^"]*(?:article|content|main|story)[^"]*"[^>]*>(.*?)</div>',
                ]:
                    match = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
                    if match:
                        content = match.group(1)
                        break

        if not content:
            # Last resort: get all <p> tags
            paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', html, re.DOTALL | re.IGNORECASE)
            # Filter out short paragraphs (likely navigation/UI elements)
            content = '\n'.join(f'<p>{p}</p>' for p in paragraphs if len(re.sub(r'<[^>]+>', '', p).strip()) > 40)

        # Clean the content
        # Remove script and style tags
        content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
        content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL | re.IGNORECASE)
        content = re.sub(r'<iframe[^>]*>.*?</iframe>', '', content, flags=re.DOTALL | re.IGNORECASE)
        # Keep basic formatting tags
        content = re.sub(r'<(?!/?(?:p|h[1-6]|a|strong|em|b|i|ul|ol|li|blockquote|br|img|figure|figcaption)\b)[^>]+>', '', content)

        return title, content


def main():
    print("🔄 Jouw Converteer Expert - Server Setup\n")

    # Check dependencies
    has_ytdlp = check_ytdlp()
    has_ffmpeg = check_ffmpeg()
    has_node = shutil.which('node', path=ENV_WITH_NODE['PATH']) is not None

    if has_ytdlp:
        print("   ✅ yt-dlp gevonden")
    else:
        print("   ❌ yt-dlp NIET gevonden — installeer met: pip3 install yt-dlp")

    if has_ffmpeg:
        print("   ✅ ffmpeg gevonden")
    else:
        print("   ❌ ffmpeg NIET gevonden — installeer met:")
        print("      /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"")
        print("      brew install ffmpeg")

    if has_node:
        print(f"   ✅ Node.js gevonden ({NODE_DIR})")
    else:
        print("   ❌ Node.js NIET gevonden — YouTube-extractie kan falen")

    # Check article reader dependencies
    try:
        import requests
        from readability import Document
        print("   ✅ Artikel-lezer (readability + requests)")
    except ImportError:
        print("   ⚠️  Artikel-lezer beperkt — installeer voor beste resultaat:")
        print("      pip3 install requests readability-lxml")

    if not has_ytdlp or not has_ffmpeg:
        print("\n   ⚠️  YouTube-downloads werken pas als alle dependencies geïnstalleerd zijn.\n")

    server = http.server.HTTPServer(('0.0.0.0', PORT), ConvertHandler)
    print(f"\n🌐 Server draait op:")
    print(f"   http://localhost:{PORT}/converteeralles.html")
    print(f"\n   Druk Ctrl+C om te stoppen.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server gestopt.")
        server.server_close()

        # Cleanup any remaining temp files
        for job in jobs.values():
            try:
                if os.path.exists(job.get('temp_dir', '')):
                    shutil.rmtree(job['temp_dir'])
            except Exception:
                pass


if __name__ == '__main__':
    main()
