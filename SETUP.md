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
4. Deploy. Vercel will also automatically pick up the cron job defined in `vercel.json` (checks for due reminders every 5 minutes) — no extra setup needed, though Vercel Cron on the free (Hobby) plan currently allows a minimum interval, so if it's rejected, change `*/5 * * * *` in `vercel.json` to `0 * * * *` (hourly) or check your plan's minimum.

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

- `GET /api/reminders` — list all. Add `?done=false` for only open ones.
- `POST /api/reminders` — body: `{ "title": "...", "notes": "...", "due_at": "2026-09-20T17:00:00Z", "created_by": "claude" }` (`due_at` and `notes` optional; `due_at` omitted = no specific time, just a list item)
- `PATCH /api/reminders/:id` — body: any of `{ title, notes, due_at, done }`
- `DELETE /api/reminders/:id`
