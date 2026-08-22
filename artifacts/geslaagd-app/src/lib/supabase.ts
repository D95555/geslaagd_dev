import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase-configuratie ontbreekt. Voeg VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY toe.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

export function appUrl(pathname: string): string {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${basePath}${pathname}`;
}