// Shared helper for the leaderboard API (not a route: files starting with "_" are ignored by Vercel).
// Finds the Supabase settings under any name Vercel gives them (also prefixed ones like STORAGE_SUPABASE_URL)
const ENV = process.env;
const findEnv = (...ends) => { for (const e of ends) { if (ENV[e]) return ENV[e]; } for (const e of ends) { const k = Object.keys(ENV).find(n => n.toUpperCase().endsWith(e) && ENV[n]); if (k) return ENV[k]; } return ''; };
const SB_URL = String(findEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')).trim().replace(/\/$/, '');
const SB_KEY = String(findEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY')).trim();

function configured() { return Boolean(SB_URL && SB_KEY); }

async function sb(path, { method = 'GET', body, prefer, range } = {}) {
  // Legacy keys are JWTs (start with "eyJ") and go in both headers; new sb_secret_ keys go in the apikey header only.
  const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (SB_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SB_KEY}`;
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
