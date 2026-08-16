import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://xogfqpeubtcqehaadywm.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IbQqX6KVjmNnCEJwCOMxIw_Znd34ZyD';
export const SITE_URL = 'https://radar-crm-lac.vercel.app';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
