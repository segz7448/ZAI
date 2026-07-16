/**
 * ZAI - Supabase Client
 *
 * This app has exactly one user (you) and no login screen. There is no
 * auth session, no sign up/in/out - the anon key talks directly to tables
 * that have RLS disabled (see supabase/schema_v2.sql). getCurrentUserId()
 * is kept as a function (rather than inlining the constant everywhere)
 * purely so callers don't need to change if real auth is ever added later.
 */

import { createClient } from '@supabase/supabase-js';

// Set these via a .env file (see .env.example) at build time.
// Never hardcode real project credentials directly in source for a shared repo.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fixed owner id - matches the default on every user_id column in
// schema_v2.sql. This app is single-user, so there's no session to read
// an id from; it's just a constant.
const OWNER_ID = 'local_owner';

/**
 * Returns the fixed owner id. Always succeeds (no auth involved) unless
 * Supabase isn't configured at all, in which case sync should no-op.
 * Never throws.
 */
export async function getCurrentUserId() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return OWNER_ID;
}
