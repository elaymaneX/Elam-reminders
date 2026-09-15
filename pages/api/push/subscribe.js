import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/auth';

// POST /api/push/subscribe -> save a browser's push subscription
// DELETE /api/push/subscribe -> remove one (body: { endpoint })
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const supabase = getSupabaseAdmin();

  if (req.method === 'POST') {
    const sub = req.body;
    if (!sub || !sub.endpoint || !sub.keys) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['POST', 'DELETE']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
