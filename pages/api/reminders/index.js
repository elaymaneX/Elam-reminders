import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/auth';

// GET  /api/reminders          -> list reminders (?done=false to filter, default: all)
// POST /api/reminders          -> create a reminder
//      body: { title, notes?, due_at? (ISO string or null), created_by? ('user'|'claude') }
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    let query = supabase.from('reminders').select('*').order('due_at', { ascending: true, nullsFirst: false });
    if (req.query.done === 'false') query = query.eq('done', false);
    if (req.query.done === 'true') query = query.eq('done', true);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ reminders: data });
  }

  if (req.method === 'POST') {
    const { title, notes, due_at, created_by } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    const { data, error } = await supabase
      .from('reminders')
      .insert({
        title,
        notes: notes || null,
        due_at: due_at || null,
        created_by: created_by === 'claude' ? 'claude' : 'user',
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ reminder: data });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
