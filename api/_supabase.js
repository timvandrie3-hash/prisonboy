// Shared helper for the leaderboard API (not a route: files starting with "_" are ignored by Vercel).
const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function configured() { return Boolean(SB_URL && SB_KEY); }

async function sb(path, { method = 'GET', body, prefer, range } = {}) {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  if (range) { headers['Range-Unit'] = 'items'; headers.Range = range; }
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) { const e = new Error(`Supabase ${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`); e.status = r.status; throw e; }
  return { data, count: parseCount(r.headers.get('content-range')) };
}
function parseCount(cr) { if (!cr) return null; const n = cr.split('/')[1]; return n && n !== '*' ? parseInt(n, 10) : null; }

// Number of players whose best score in the view is higher than `score` (excluding this device).
async function playersAbove(view, score, deviceId) {
  const dev = deviceId ? `&device_id=neq.${encodeURIComponent(deviceId)}` : '';
  const { count } = await sb(`${view}?select=device_id&score=gt.${score}${dev}`, { prefer: 'count=exact', range: '0-0' });
  return count || 0;
}

function cleanDevice(d) { d = String(d || ''); return /^[A-Za-z0-9-]{8,64}$/.test(d) ? d : ''; }

module.exports = { configured, sb, playersAbove, cleanDevice };
