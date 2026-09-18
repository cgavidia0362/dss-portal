import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dss-canvas px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded bg-dss-navy text-xs font-bold text-white">
            DSS
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-dss-ink">DSS Portal</h1>
          <p className="mt-1 text-sm text-dss-muted">Sign in to continue</p>
        </div>

        <div className="dss-panel p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-dss-sm border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-dss-danger">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-dss-muted">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="dss-input"
                placeholder="admin@yourcompany.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-dss-muted">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="dss-input"
                placeholder="Enter your password"
              />
            </div>

            <button type="submit" disabled={loading} className="dss-btn-primary w-full">
              {loading ? (
                'Signing in…'
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
