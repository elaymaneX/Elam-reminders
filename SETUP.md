# Setup & deploy

## 1. Create the Supabase project
1. Go to supabase.com, create a free account/project (any name, any region close to Spain).
2. Once it's created, open **SQL Editor -> New query**, paste the contents of `supabase/schema.sql`, and run it. This creates the `reminders` and `push_subscriptions` tables.
3. Go to **Project Settings -> API**. You'll need three values from here:
   - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY` (not actually used by the API routes, but keep it filled in)
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — it bypasses all database restrictions)

## 2. Generate your keys
Run these locally once (needs Node.js installed):

```bash
npm install
npx web-push generate-vapid-keys
```

This prints a public and private key. Put the public one in both `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and the private one in `VAPID_PRIVATE_KEY`.

Also generate your own access code/secret:

```bash
openssl rand -hex 32
```

Put that in `APP_SECRET`. This is the one password/token that both you (typed into the app once) and Claude (via API calls) will use — keep it private, it's the only thing standing between the internet and your reminders.

## 3. Local env file
Copy `.env.example` to `.env.local` and fill in all the values above.

```bash
cp .env.example .env.local
```

Test locally:

```bash
npm run dev
```

Open http://localhost:3000, enter your `APP_SECRET` as the access code, and try adding a reminder.

## 4. Deploy to Vercel
1. Push this project to a GitHub repo (or `vercel` CLI can deploy straight from the folder).
2. In Vercel, import the project.
3. In the Vercel project's **Settings -> Environment Variables**, add every variable from `.env.local` (same names, same values) for the Production environment.
4. Deploy.

Note: this app does NOT use Vercel Cron — the free (Hobby) plan only allows once-a-day schedules, too infrequent for timely reminders. Instead, Supabase's own scheduler (`pg_cron` + `pg_net`, both free) calls the app's `/api/push/send-due` endpoint every 5 minutes directly from the database. Set that up in step 4.5 below, once you know your deployed Vercel URL.

## 4.5. Schedule the due-reminder check (Supabase pg_cron)

1. In Supabase, go to **Database -> Extensions**, and enable `pg_cron` and `pg_net` (search for each, toggle on).
2. Go to **SQL Editor -> New query** and run this, with your real Vercel URL and `APP_SECRET` substituted in:

```sql
select cron.schedule(
  'send-due-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/push/send-due',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_APP_SECRET"}'::jsonb
  );
  $$
);
```

That's it — Supabase will hit the endpoint every 5 minutes forever, independent of Vercel's plan limits. To check it's firing: **Database -> Cron Jobs** in Supabase shows run history. To stop/change it later: `select cron.unschedule('send-due-reminders');` then re-run `cron.schedule` with new values.

## 5. Install on iPhone/iPad
1. Open the deployed Vercel URL in **Safari** (must be Safari, not Chrome, for iOS install to work).
2. Tap the Share icon -> **Add to Home Screen**.
3. Open the app from the home screen icon (not Safari) and enter your access code.
4. Tap **Enable notifications** and allow when prompted. This only works because you added it to the home screen first (iOS 16.4+) — opening it in a regular Safari tab won't offer real push notifications.

## 6. Connect Claude to it
Give Claude (in any conversation) these three things once, and ask it to remember them:
- The deployed URL, e.g. `https://your-app.vercel.app`
- The `APP_SECRET` value
- That it should call `GET/POST https://your-app.vercel.app/api/reminders` and `PATCH/DELETE https://your-app.vercel.app/api/reminders/:id`, with header `Authorization: Bearer <APP_SECRET>`, to read or create reminders — using `created_by: "claude"` when it creates one.

From then on, Claude can read what's on your list and add to it directly, and anything you add yourself in the app is visible to Claude the same way.

## API reference (for Claude, or for yourself)

All requests need header: `Authorization: Bearer <APP_SECRET>`

- `GET /api/reminders` — list all. Filters: `?done=false`, `?kind=reminder` or `?kind=project`.
- `POST /api/reminders` — body: `{ "title": "...", "notes": "...", "due_at": "2026-09-20T17:00:00Z", "created_by": "claude", "kind": "reminder" }`
  - `notes`, `due_at`, `created_by`, `kind` are all optional. `kind` defaults to `"reminder"`; pass `"project"` for an untimed project idea (its `due_at` is forced to null regardless of what you send).
- `PATCH /api/reminders/:id` — body: any of `{ title, notes, due_at, done, kind }`
- `DELETE /api/reminders/:id`
- `POST /api/reminders/:id/snooze` — body: `{ "minutes": 30 }`. Pushes `due_at` to now+minutes and clears `done`/`notified` so it fires again. This is what "snooze this for 30 mins" / "snooze for 5 hours" means for Claude to call — any number of minutes works, not just the app's 15/60/1440 quick buttons.

## Snoozing from a notification (and the iOS caveat)

The push notification itself carries three quick-snooze buttons (15m / 1h / Tomorrow) that call the snooze endpoint straight from the notification, no need to open the app. This works on Chrome/Android/desktop.

Honest limitation: **iOS Safari does not support action buttons on web push notifications** at all — this is a long-standing Apple platform gap, not a bug in this app. On iPhone/iPad, tapping the notification just opens the app instead; there is no way around this without a native app using Apple's own push framework. Since iOS is your main use case, plan on doing quick snoozes either by asking Claude ("snooze that for 30 mins") or by opening the app and tapping the snooze buttons shown under each reminder there.
