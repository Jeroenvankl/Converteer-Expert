/**
 * Jouw Converteer Expert — Cloudflare Worker
 *
 * Handles:
 * - /api/article   → Fetches article HTML (CORS proxy)
 * - /api/youtube/info → Gets YouTube video info via Piped API
 * - /api/youtube/stream → Proxies audio/video stream for download
 *
 * Deploy: Cloudflare Dashboard → Workers → Create → paste this code
 */

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function fetchWithFallback(instances, path) {
  for (const instance of instances) {
    try {
      const resp = await fetch(`${instance}${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (resp.ok) {
        const data = await resp.json();
        return { data, instance };
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('Alle Piped instances zijn momenteel onbereikbaar. Probeer het later opnieuw.');
}

// ==================== ARTICLE HANDLER ====================

async function handleArticle(request) {
  let url;
  if (request.method === 'POST') {
    const body = await request.json();
    url = body.url;
  } else {
    url = new URL(request.url).searchParams.get('url');
  }

  if (!url) {
    return corsResponse(JSON.stringify({ error: 'Geen URL opgegeven' }), 400);
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    const html = await resp.text();

    return corsResponse(JSON.stringify({
      html,
      url: resp.url,
      status: resp.status,
    }));
  } catch (e) {
    return corsResponse(JSON.stringify({ error: 'Kon pagina niet ophalen: ' + e.message }), 500);
  }
}

// ==================== YOUTUBE HANDLER ====================

async function handleYoutubeInfo(request) {
  let url;
  if (request.method === 'POST') {
    const body = await request.json();
    url = body.url;
  } else {
    url = new URL(request.url).searchParams.get('url');
  }

  if (!url) {
    return corsResponse(JSON.stringify({ error: 'Geen YouTube URL opgegeven' }), 400);
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return corsResponse(JSON.stringify({ error: 'Ongeldige YouTube URL' }), 400);
  }

  try {
    const { data } = await fetchWithFallback(PIPED_INSTANCES, `/streams/${videoId}`);

    // Find best audio stream (prefer m4a for compatibility)
    const audioStreams = (data.audioStreams || [])
      .filter(s => s.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    const bestM4a = audioStreams.find(s => s.mimeType?.includes('mp4') || s.format === 'M4A');
    const bestAudio = bestM4a || audioStreams[0];

    // Find best video stream with audio (prefer mp4)
    const videoStreams = (data.videoStreams || [])
      .filter(s => s.url && s.videoOnly !== true)
      .sort((a, b) => {
        const qualA = parseInt(a.quality) || 0;
        const qualB = parseInt(b.quality) || 0;
        return qualB - qualA;
      });

    const bestMp4 = videoStreams.find(s => s.mimeType?.includes('mp4'));
    const bestVideo = bestMp4 || videoStreams[0];

    return corsResponse(JSON.stringify({
      title: data.title || 'Onbekend',
      thumbnail: data.thumbnailUrl || '',
      duration: data.duration || 0,
      uploader: data.uploader || '',
      audioStream: bestAudio ? {
        url: bestAudio.url,
        mimeType: bestAudio.mimeType,
        bitrate: bestAudio.bitrate,
        format: bestAudio.format || (bestAudio.mimeType?.includes('mp4') ? 'M4A' : 'WebM Audio'),
        size: bestAudio.contentLength,
      } : null,
      videoStream: bestVideo ? {
        url: bestVideo.url,
        mimeType: bestVideo.mimeType,
        quality: bestVideo.quality,
        format: bestVideo.format || 'MP4',
        size: bestVideo.contentLength,
      } : null,
      allAudioStreams: audioStreams.slice(0, 5).map(s => ({
        url: s.url,
        mimeType: s.mimeType,
        bitrate: s.bitrate,
        format: s.format,
        size: s.contentLength,
      })),
    }));
  } catch (e) {
    return corsResponse(JSON.stringify({ error: e.message }), 500);
  }
}

// ==================== STREAM PROXY ====================

async function handleStreamProxy(request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return corsResponse(JSON.stringify({ error: 'Geen stream URL opgegeven' }), 400);
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Range': request.headers.get('Range') || '',
      },
    });

    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', resp.headers.get('Content-Type') || 'application/octet-stream');
    if (resp.headers.get('Content-Length')) {
      headers.set('Content-Length', resp.headers.get('Content-Length'));
    }
    if (resp.headers.get('Content-Range')) {
      headers.set('Content-Range', resp.headers.get('Content-Range'));
    }
    headers.set('Content-Disposition', 'attachment');

    return new Response(resp.body, {
      status: resp.status,
      headers,
    });
  } catch (e) {
    return corsResponse(JSON.stringify({ error: 'Stream niet beschikbaar: ' + e.message }), 500);
  }
}

// ==================== MAIN ROUTER ====================

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/article') {
        return await handleArticle(request);
      }
      if (path === '/api/youtube/info') {
        return await handleYoutubeInfo(request);
      }
      if (path === '/api/youtube/stream') {
        return await handleStreamProxy(request);
      }

      // Health check / info
      if (path === '/' || path === '/api') {
        return corsResponse(JSON.stringify({
          service: 'Jouw Converteer Expert API',
          endpoints: ['/api/article', '/api/youtube/info', '/api/youtube/stream'],
          status: 'ok',
        }));
      }

      return corsResponse(JSON.stringify({ error: 'Endpoint niet gevonden' }), 404);
    } catch (e) {
      return corsResponse(JSON.stringify({ error: 'Server fout: ' + e.message }), 500);
    }
  },
};
