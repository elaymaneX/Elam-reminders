import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/auth';

// PATCH  /api/reminders/:id   -> partial update (e.g. { done: true }, { title, notes, due_at })
// DELETE /api/reminders/:id   -> delete a reminder
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const supabase = getSupabaseAdmin();
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const allowed = ['title', 'notes', 'due_at', 'done', 'notified', 'kind'];
    const updates = {};
    for (const key of allowed) {
      if (key in (req.body || {})) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    const { data, error } = await supabase
      .from('reminders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ reminder: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('reminders').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['PATCH', 'DELETE']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
