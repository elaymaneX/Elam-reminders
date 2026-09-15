import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getWebPush } from '../../../lib/push';

// GET /api/push/send-due
// Called every 5 minutes by Vercel Cron (see vercel.json). Finds reminders whose
// due_at has passed and haven't been notified yet, pushes a notification to every
// subscribed device, then marks them notified so they don't fire twice.
//
// Vercel Cron requests carry a special header instead of our normal app secret,
// so this route checks that instead of requireAuth.
export default async function handler(req, res) {
  const isVercelCron = req.headers['x-vercel-cron'] !== undefined;
  const hasValidSecret = req.headers.authorization === `Bearer ${process.env.APP_SECRET}`;
  if (!isVercelCron && !hasValidSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('reminders')
    .select('*')
    .lte('due_at', nowIso)
    .eq('done', false)
    .eq('notified', false);

  if (error) return res.status(500).json({ error: error.message });
  if (!due || due.length === 0) return res.status(200).json({ sent: 0 });

  const { data: subs, error: subError } = await supabase.from('push_subscriptions').select('*');
  if (subError) return res.status(500).json({ error: subError.message });

  let sent = 0;
  const webpush = subs && subs.length > 0 ? getWebPush() : null;

  for (const reminder of due) {
    if (webpush && subs.length > 0) {
      const payload = JSON.stringify({
        title: 'Reminder',
        body: reminder.title,
        id: reminder.id,
      });
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            sent += 1;
          } catch (err) {
            // Subscription is likely stale/expired - remove it.
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
          }
        })
      );
    }
    await supabase.from('reminders').update({ notified: true }).eq('id', reminder.id);
  }

  return res.status(200).json({ sent, dueCount: due.length });
}
