// POST /api/score  { device, name, score, level, character, duration }
// Validates and stores one finished run, then returns the player's weekly + all-time rank.
const { configured, sb, playersAbove, cleanDevice } = require('./_supabase');

const BLOCK = ['nazi', 'hitler', 'fuck', 'fick', 'hure', 'nigger', 'neger', 'fotze', 'cunt', 'bitch', 'arsch', 'wichser', 'schlampe'];
function cleanName(n) {
  n = String(n || '').normalize('NFKC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (n.length < 2) return '';
  const low = n.toLowerCase().replace(/[^a-zäöüß]/g, '');
  return BLOCK.some(b => low.includes(b)) ? '' : n;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!configured()) return res.status(500).json({ error: 'Supabase environment variables are missing' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = {}; } }
  b = b || {};
  const device = cleanDevice(b.device);
  const name = cleanName(b.name);
  const score = Math.floor(Number(b.score));
  const level = Math.floor(Number(b.level));
  const character = Math.floor(Number(b.character)) || 0;
  const duration = Math.max(0, Math.min(7200, Number(b.duration) || 0));
  if (!device) return res.status(400).json({ error: 'Invalid device' });
  if (!name) return res.status(400).json({ error: 'Invalid name' });
  if (!Number.isFinite(score) || score < 0 || score > 10000000) return res.status(400).json({ error: 'Invalid score' });
  if (!(level >= 1 && level <= 5)) return res.status(400).json({ error: 'Invalid level' });
  if (!(character >= 0 && character <= 7)) return res.status(400).json({ error: 'Invalid character' });
  // Plausibility: points per second are limited by the game (distance + bonuses) times the level multiplier (max ×5).
  const mult = [0, 1, 1.5, 2, 3, 5][level];
  const maxScore = (duration * 120 + 1500) * mult;
  if (score > maxScore) return res.status(422).json({ error: 'Score not plausible' });
  try {
    // Rate limit: one run per device every 5 seconds.
    const since = new Date(Date.now() - 5000).toISOString();
    const recent = await sb(`scores?select=id&device_id=eq.${encodeURIComponent(device)}&created_at=gt.${encodeURIComponent(since)}&limit=1`);
    if (recent.data && recent.data.length) return res.status(429).json({ error: 'Too many submissions' });
    await sb('scores', { method: 'POST', body: { device_id: device, name, score, level, rider: character, duration }, prefer: 'return=minimal' });
    const out = {};
    for (const [key, view] of [['week', 'leaderboard_week'], ['all', 'leaderboard_all']]) {
      const own = await sb(`${view}?select=score&device_id=eq.${encodeURIComponent(device)}&limit=1`);
      const best = own.data && own.data[0] ? own.data[0].score : score;
      out[key] = { rank: (await playersAbove(view, best, device)) + 1, best, isBest: score >= best };
    }
    return res.status(200).json({ ok: true, name, ...out });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save score', detail: String(e.message || e).slice(0, 300) });
  }
};
