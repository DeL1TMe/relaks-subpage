import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.HWID_PROXY_PORT || 3020);
const PANEL = (process.env.REMNAWAVE_PANEL_URL || 'http://remnawave:3000').replace(/\/$/, '');
const TOKEN = process.env.REMNAWAVE_API_TOKEN || '';
const CADDY_TOKEN = process.env.CADDY_AUTH_API_TOKEN || '';
const REAL_IP_HEADER = (process.env.REMNAWAVE_REAL_IP_HEADER || 'x-remnawave-real-ip').toLowerCase();
const FETCH_TIMEOUT_MS = 15_000;

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});

function json(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function panelHeaders(req, extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${TOKEN}`,
    'user-agent': 'subpage-hwid-proxy',
    ...extra,
  };
  if (CADDY_TOKEN) headers['X-Api-Key'] = CADDY_TOKEN;
  if (PANEL.startsWith('http://')) {
    headers['X-Forwarded-Proto'] = 'https';
    headers['X-Forwarded-For'] = '127.0.0.1';
  }
  const clientIp =
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.headers['x-real-ip']?.toString() ||
    '127.0.0.1';
  headers[REAL_IP_HEADER] = clientIp;
  return headers;
}

async function panelFetch(path, req, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${PANEL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: panelHeaders(req, options.headers),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text?.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'panel timeout' : err?.message || 'panel fetch failed';
    console.error(`panelFetch ${path}:`, message);
    return { ok: false, status: 0, data: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function extractUser(data) {
  if (!data || typeof data !== 'object') return null;
  const candidate = data.response ?? data.user ?? data;
  if (candidate?.uuid) return candidate;
  if (candidate?.response?.uuid) return candidate.response;
  return null;
}

async function resolveUser(req, shortUuid, username) {
  const attempts = [];

  if (username) {
    attempts.push(`/api/users/by-username/${encodeURIComponent(username)}`);
  }
  if (shortUuid) {
    attempts.push(`/api/users/by-short-uuid/${encodeURIComponent(shortUuid)}`);
  }

  let lastError = null;

  for (const path of attempts) {
    const result = await panelFetch(path, req);
    if (result.error) {
      lastError = result.error;
      continue;
    }
    if (!result.ok) {
      lastError = result.data?.message || `panel HTTP ${result.status}`;
      continue;
    }
    const user = extractUser(result.data);
    if (user?.uuid) return { user, error: null };
    lastError = 'user payload missing uuid';
  }

  return { user: null, error: lastError || 'user not found' };
}

async function getDevices(req, userUuid) {
  const path = `/api/hwid/devices/${encodeURIComponent(userUuid)}`;
  const result = await panelFetch(path, req);
  if (result.error) {
    return { devices: [], error: result.error };
  }
  if (!result.ok) {
    console.error('getDevices panel error', result.status, result.data);
    return {
      devices: [],
      error: result.data?.message || `hwid list HTTP ${result.status}`,
    };
  }
  const response = result.data?.response;
  if (Array.isArray(response)) return { devices: response, error: null };
  if (Array.isArray(response?.devices)) return { devices: response.devices, error: null };
  if (Array.isArray(result.data?.devices)) return { devices: result.data.devices, error: null };
  return { devices: [], error: null };
}

function normalizeDeviceLimit(value) {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') {
    return '∞';
  }
  return value;
}

async function deleteAllDevices(req, userUuid) {
  const path = '/api/hwid/devices/delete-all';
  const body = JSON.stringify({ userUuid });
  const result = await panelFetch(path, req, { method: 'POST', body });
  if (result.error) return { ok: false, error: result.error };
  if (!result.ok) {
    console.error('deleteAllDevices panel error', result.status, result.data);
    return { ok: false, error: result.data?.message || `delete HTTP ${result.status}` };
  }
  return { ok: true, error: null };
}

async function handleDevices(req, res, shortUuid, username) {
  if (!shortUuid && !username) {
    return json(res, 400, { error: 'shortUuid or username required' });
  }

  const { user, error: resolveError } = await resolveUser(req, shortUuid, username);
  if (!user) {
    return json(res, resolveError?.includes('timeout') || resolveError?.includes('fetch') ? 502 : 404, {
      error: resolveError || 'User not found',
    });
  }

  if (req.method === 'GET') {
    const { devices, error } = await getDevices(req, user.uuid);
    if (error) return json(res, 502, { error });
    const limit = normalizeDeviceLimit(user.hwidDeviceLimit ?? user.hwid_device_limit);
    return json(res, 200, {
      count: devices.length,
      limit,
      devices: devices.map((d) => ({
        uuid: d.uuid,
        hwid: d.hwid,
        deviceOs: d.deviceOs || d.device_os,
        deviceModel: d.deviceModel || d.device_model,
        createdAt: d.createdAt || d.created_at,
      })),
    });
  }

  if (req.method === 'DELETE') {
    const { ok, error } = await deleteAllDevices(req, user.uuid);
    if (!ok) return json(res, 502, { error: error || 'Failed to delete devices' });
    return json(res, 200, { success: true });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

async function handleReady(req, res) {
  if (!TOKEN) {
    return json(res, 503, { ok: false, error: 'REMNAWAVE_API_TOKEN is not configured' });
  }
  const result = await panelFetch('/api/system/metadata', req);
  if (result.error) {
    return json(res, 502, { ok: false, panel: PANEL, error: result.error });
  }
  if (!result.ok) {
    return json(res, 502, {
      ok: false,
      panel: PANEL,
      error: result.data?.message || `panel HTTP ${result.status}`,
    });
  }
  return json(res, 200, {
    ok: true,
    panel: PANEL,
    version: result.data?.response?.version ?? null,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      return json(res, 204, {});
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/ready') {
      return await handleReady(req, res);
    }

    if (!TOKEN) {
      return json(res, 503, { error: 'REMNAWAVE_API_TOKEN is not configured' });
    }

    if (url.pathname === '/devices') {
      const shortUuid = url.searchParams.get('shortUuid') || undefined;
      const username = url.searchParams.get('username') || undefined;
      return await handleDevices(req, res, shortUuid, username);
    }

    if (url.pathname.startsWith('/devices/')) {
      const shortUuid = decodeURIComponent(url.pathname.replace('/devices/', '').split('/')[0]);
      const username = url.searchParams.get('username') || undefined;
      return await handleDevices(req, res, shortUuid, username);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled proxy error:', err);
    return json(res, 500, { error: 'Internal proxy error' });
  }
});

server.listen(PORT, () => {
  console.log(`hwid-proxy listening on :${PORT}, panel=${PANEL}`);
  if (!TOKEN) console.warn('REMNAWAVE_API_TOKEN is empty — /devices will return 503');
});
