import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/auth';

// GET  /api/reminders          -> list reminders
//      query params: ?done=false|true, ?kind=reminder|project (omit either to get all)
// POST /api/reminders          -> create a reminder or a project idea
//      body: { title, notes?, due_at? (ISO string or null), created_by? ('user'|'claude'), kind? ('reminder'|'project') }
//      kind defaults to 'reminder'. A 'project' always has due_at forced to null (no timing, by design).
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    let query = supabase.from('reminders').select('*').order('due_at', { ascending: true, nullsFirst: false });
    if (req.query.done === 'false') query = query.eq('done', false);
    if (req.query.done === 'true') query = query.eq('done', true);
    if (req.query.kind === 'reminder' || req.query.kind === 'project') {
      query = query.eq('kind', req.query.kind);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ reminders: data });
  }

  if (req.method === 'POST') {
    const { title, notes, due_at, created_by, kind } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    const resolvedKind = kind === 'project' ? 'project' : 'reminder';
    const { data, error } = await supabase
      .from('reminders')
      .insert({
        title,
        notes: notes || null,
        due_at: resolvedKind === 'project' ? null : due_at || null,
        created_by: created_by === 'claude' ? 'claude' : 'user',
        kind: resolvedKind,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ reminder: data });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
