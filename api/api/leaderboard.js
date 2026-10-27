// GET /api/leaderboard?period=week|all&device=<id>
// Returns the top 50 players (best score per player) and the caller's own rank.
const { configured, sb, playersAbove, cleanDevice } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!configured()) return res.status(500).json({ error: 'Supabase environment variables are missing' });
  const period = req.query.period === 'all' ? 'all' : 'week';
  const view = period === 'all' ? 'leaderboard_all' : 'leaderboard_week';
  const device = cleanDevice(req.query.device);
  try {
    const { data } = await sb(`${view}?select=device_id,name,score,level,rider&order=score.desc,created_at.asc&limit=50`);
    const rows = (data || []).map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, level: r.level, character: r.rider, me: !!device && r.device_id === device }));
    let me = null;
    if (device) {
      const own = await sb(`${view}?select=name,score,level,rider&device_id=eq.${encodeURIComponent(device)}&limit=1`);
      if (own.data && own.data[0]) {
        const o = own.data[0];
        me = { rank: (await playersAbove(view, o.score, device)) + 1, name: o.name, score: o.score, level: o.level, character: o.rider };
      }
    }
    const total = (await sb(`${view}?select=device_id`, { prefer: 'count=exact', range: '0-0' })).count || rows.length;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ period, rows, me, total });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Leaderboard unavailable', detail: String(e.message || e).slice(0, 300) });
  }
};
