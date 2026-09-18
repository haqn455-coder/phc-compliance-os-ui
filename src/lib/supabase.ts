import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://auzbkudpqdmrgyxtwaiy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3G6sjO0orxo7FjoS2hUNDw_bbsavIbw';
export const PILOT_API = `${SUPABASE_URL}/functions/v1/pilot-onboarding`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true
  }
});
