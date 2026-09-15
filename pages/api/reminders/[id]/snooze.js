import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuth } from '../../../../lib/auth';

// POST /api/reminders/:id/snooze
// body: { minutes: number }  e.g. { minutes: 15 }, { minutes: 60 }, { minutes: 1440 } (tomorrow)
// Pushes due_at to now + minutes and clears notified/done so it fires again.
// This is what the app's snooze buttons call, what the notification action buttons call,
// and what Claude calls for "snooze this for 30 mins" / "snooze for 5 hours" style requests.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { id } = req.query;
  const minutes = Number(req.body?.minutes);
  if (!minutes || minutes <= 0) {
    return res.status(400).json({ error: 'minutes must be a positive number' });
  }

  const newDueAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('reminders')
    .update({ due_at: newDueAt, notified: false, done: false })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ reminder: data });
}
