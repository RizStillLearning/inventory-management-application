import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const isConfigured = Boolean(url && key && !url.includes('your-project-ref'));

const client: SupabaseClient | null = isConfigured ? createClient(url!, key!) : null;

/** The Supabase client. The app only renders data views once `isConfigured` is true. */
export function db(): SupabaseClient {
  if (!client) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.');
  return client;
}
