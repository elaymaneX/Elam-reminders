import { createClient } from '@supabase/supabase-js';

// Server-side only client. Uses the service role key which bypasses Row Level
// Security, so this file must NEVER be imported from client-side ("use client")
// code - only from pages/api/* routes, which run on the server.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env vars are missing. Check .env.local / Vercel project settings.');
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
