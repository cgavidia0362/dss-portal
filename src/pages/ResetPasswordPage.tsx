import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound } from 'lucide-react';

interface ResetPasswordPageProps {
  onSuccess: () => void;
}

export default function ResetPasswordPage({ onSuccess }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => onSuccess(), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to set password');
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
          <p className="mt-1 text-sm text-dss-muted">Set up your password to get started</p>
        </div>

        <div className="dss-panel p-6">
          {success ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <KeyRound className="h-6 w-6 text-dss-success" />
              </div>
              <h3 className="text-lg font-semibold text-dss-success">Password set</h3>
              <p className="mt-1 text-sm text-dss-muted">Redirecting you to the portal…</p>
            </div>
          ) : (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="mb-2 text-center">
                <KeyRound className="mx-auto mb-2 h-8 w-8 text-dss-accent" />
                <h2 className="text-lg font-semibold text-dss-ink">Create your password</h2>
                <p className="mt-1 text-sm text-dss-muted">Choose a password to access DSS Portal</p>
              </div>

              {error && (
                <div className="rounded-dss-sm border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-dss-danger">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-dss-muted">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  className="dss-input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-dss-muted">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter your password"
                  className="dss-input"
                />
              </div>

              <button type="submit" disabled={loading} className="dss-btn-primary w-full">
                {loading ? 'Setting password…' : 'Set password & enter portal'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
