import { createClient, type User } from '@supabase/supabase-js';
import type { AuthError as SupabaseAuthError } from '@supabase/supabase-js';

export class AuthError extends Error {
  status = 401;
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = 'Access restricted.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

function readBearer(request: Request): string | null {
  const value = request.headers.get('authorization');
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return { url, anonKey };
}

function supabaseServerClient(accessToken: string) {
  const { url, anonKey } = supabaseEnv();
  if (!url || !anonKey) {
    throw new Error('Supabase environment variables are not configured on the server.');
  }
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function throwIfInvalidUser(error: SupabaseAuthError | null, user: User | null): asserts user is User {
  if (user) return;
  const message = error?.message || '';
  if (/fetch|network|enotfound|econn|eai_again|timeout/i.test(message)) {
    throw new Error('Unable to verify your session with the authentication server. Retry Analyze, or restart the local Vite server.');
  }
  throw new AuthError('Invalid or expired session.');
}

async function userFromRequest(request: Request): Promise<{ user: User; supabase: ReturnType<typeof supabaseServerClient> }> {
  const token = readBearer(request);
  if (!token) {
    throw new AuthError('Authentication required.');
  }

  const supabase = supabaseServerClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  throwIfInvalidUser(error, data.user);
  return { user: data.user, supabase };
}

/** Verify DSS Supabase JWT. All Income Verification APIs must call this first. */
export async function requireDssUser(request: Request): Promise<User> {
  const { user } = await userFromRequest(request);
  return user;
}

/** Require authenticated admin/manager, or a profile granted Income Verification via allowed_tabs. */
export async function requireDssAdminOrManager(request: Request): Promise<User> {
  const { user, supabase } = await userFromRequest(request);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, allowed_tabs')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error('Unable to verify user role.');
  }

  const role = typeof profile?.role === 'string' ? profile.role : '';
  if (role === 'admin' || role === 'manager') {
    return user;
  }

  const allowedTabs = Array.isArray(profile?.allowed_tabs) ? profile.allowed_tabs : [];
  if (allowedTabs.includes('income-verification')) {
    return user;
  }

  throw new ForbiddenError(
    'Income Verification is available to admin, manager, or users granted access.',
  );
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
