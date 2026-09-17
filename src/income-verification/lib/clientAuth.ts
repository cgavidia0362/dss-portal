import { supabase } from '../../lib/supabase';

/** Bearer headers from the active DSS Supabase session. */
export async function dssAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Authentication required. Please sign in again.');
  }
  return {
    ...(extra || {}),
    Authorization: `Bearer ${token}`,
  };
}
