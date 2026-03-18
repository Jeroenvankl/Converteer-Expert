/**
 * Jouw Converteer Expert — Cloudflare Worker
 *
 * - /api/article       → Fetches article HTML (CORS proxy)
 * - /api/youtube/info  → Gets YouTube video info + stream URLs
 * - /api/youtube/stream → Proxies audio/video stream for download
 */

// Extended list of Piped & Invidious instances for stream URLs
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.drgns.space',
  'https://pipedapi.moomoo.me',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://inv.tux.pizza',
  'https://invidious.protokolla.fi',
  'https://iv.ggtyler.dev',
  'https://vid.puffyan.us',
  'https://yewtu.be',
  'https://invidious.fdn.fr',
  'https://invidious.perennialte.ch',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function extractVideoId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : url.match(/^([a-zA-Z0-9_-]{11})$/) ? url : null;
}

// ==================== YOUTUBE: Get info directly from YouTube ====================

async function getYoutubeInfoDirect(videoId) {
  // 1. oEmbed for basic info (always works)
  const oembedResp = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!oembedResp.ok) throw new Error('Video niet gevonden');
  const oembed = await oembedResp.json();

  // 2. Scrape watch page for more details (duration, exact thumbnail)
  let duration = 0;
  let thumbnail = oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const html = await pageResp.text();
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
    if (match) {
      const pr = JSON.parse(match[1]);
      duration = parseInt(pr.videoDetails?.lengthSeconds) || 0;
      const thumbs = pr.videoDetails?.thumbnail?.thumbnails;
      if (thumbs?.length) thumbnail = thumbs[thumbs.length - 1].url;
    }
  } catch (e) { /* oEmbed data is enough */ }

  return {
    title: oembed.title || 'Onbekend',
    uploader: oembed.author_name || '',
    thumbnail,
    duration,
  };
}

// ==================== YOUTUBE: Try Piped for stream URLs ====================

async function tryPipedStreams(videoId) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const resp = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (text.startsWith('<') || text.startsWith('S')) continue; // HTML or error
      const data = JSON.parse(text);
      if (data.audioStreams?.length || data.videoStreams?.length) {
        return data;
      }
    } catch (e) { continue; }
  }
  return null;
}

// ==================== YOUTUBE: Try Invidious for stream URLs ====================

async function tryInvidiousStreams(videoId) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const resp = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (text.startsWith('<')) continue;
      const data = JSON.parse(text);
      if (data.adaptiveFormats?.length) {
        // Convert Invidious format to our format
        const audioStreams = data.adaptiveFormats
          .filter(f => f.type?.startsWith('audio') && f.url)
          .map(f => ({ url: f.url, mimeType: f.type, bitrate: parseInt(f.bitrate) || 0, format: f.container?.toUpperCase() || 'AUDIO' }));
        const videoStreams = data.adaptiveFormats
          .filter(f => f.type?.startsWith('video') && f.url)
          .map(f => ({ url: f.url, mimeType: f.type, quality: f.qualityLabel, format: f.container?.toUpperCase() || 'VIDEO', videoOnly: true }));
        return { audioStreams, videoStreams };
      }
    } catch (e) { continue; }
  }
  return null;
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

  if (!url) return corsJson({ error: 'Geen YouTube URL opgegeven' }, 400);

  const videoId = extractVideoId(url);
  if (!videoId) return corsJson({ error: 'Ongeldige YouTube URL' }, 400);

  try {
    // Step 1: Get video info directly from YouTube (reliable)
    const info = await getYoutubeInfoDirect(videoId);

    // Step 2: Try to get stream URLs from Piped, then Invidious
    let audioStream = null, videoStream = null, streamsAvailable = false;

    const pipedData = await tryPipedStreams(videoId);
    if (pipedData) {
      const audios = (pipedData.audioStreams || []).filter(s => s.url).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const bestAudio = audios.find(s => s.mimeType?.includes('mp4')) || audios[0];
      const videos = (pipedData.videoStreams || []).filter(s => s.url && s.videoOnly !== true);
      const bestVideo = videos.find(s => s.mimeType?.includes('mp4')) || videos[0];

      if (bestAudio) {
        audioStream = { url: bestAudio.url, mimeType: bestAudio.mimeType, bitrate: bestAudio.bitrate, format: bestAudio.format || 'M4A' };
        streamsAvailable = true;
      }
      if (bestVideo) {
        videoStream = { url: bestVideo.url, mimeType: bestVideo.mimeType, quality: bestVideo.quality, format: bestVideo.format || 'MP4' };
        streamsAvailable = true;
      }
    }

    if (!streamsAvailable) {
      const invData = await tryInvidiousStreams(videoId);
      if (invData) {
        const audios = invData.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (audios.length) {
          audioStream = audios[0];
          streamsAvailable = true;
        }
        const videos = invData.videoStreams;
        if (videos.length) {
          videoStream = videos.find(v => v.mimeType?.includes('mp4')) || videos[0];
          streamsAvailable = true;
        }
      }
    }

    return corsJson({
      ...info,
      audioStream,
      videoStream,
      streamsAvailable,
      downloadNote: streamsAvailable ? null : 'Download streams zijn momenteel niet beschikbaar online. Gebruik de lokale server (server.py) voor downloads.',
    });

  } catch (e) {
    return corsJson({ error: e.message }, 500);
  }
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

  if (!url) return corsJson({ error: 'Geen URL opgegeven' }, 400);
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    return corsJson({ html: await resp.text(), url: resp.url, status: resp.status });
  } catch (e) {
    return corsJson({ error: 'Kon pagina niet ophalen: ' + e.message }, 500);
  }
}

// ==================== STREAM PROXY ====================

async function handleStreamProxy(request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return corsJson({ error: 'Geen stream URL opgegeven' }, 400);

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Range': request.headers.get('Range') || '' },
    });
    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', resp.headers.get('Content-Type') || 'application/octet-stream');
    if (resp.headers.get('Content-Length')) headers.set('Content-Length', resp.headers.get('Content-Length'));
    if (resp.headers.get('Content-Range')) headers.set('Content-Range', resp.headers.get('Content-Range'));
    headers.set('Content-Disposition', 'attachment');
    return new Response(resp.body, { status: resp.status, headers });
  } catch (e) {
    return corsJson({ error: 'Stream niet beschikbaar: ' + e.message }, 500);
  }
}

// ==================== MAIN ROUTER ====================

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/article') return await handleArticle(request);
      if (path === '/api/youtube/info') return await handleYoutubeInfo(request);
      if (path === '/api/youtube/stream') return await handleStreamProxy(request);
      if (path === '/' || path === '/api') {
        return corsJson({ service: 'Jouw Converteer Expert API', endpoints: ['/api/article', '/api/youtube/info', '/api/youtube/stream'], status: 'ok' });
      }
      return corsJson({ error: 'Endpoint niet gevonden' }, 404);
    } catch (e) {
      return corsJson({ error: 'Server fout: ' + e.message }, 500);
    }
  },
};

