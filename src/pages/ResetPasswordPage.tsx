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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-400 mb-2">DSS Portal</h1>
          <p className="text-gray-400">Set up your password to get started</p>
        </div>

        <div className="bg-gray-800 p-8 rounded-lg shadow-xl border border-gray-700">
          {success ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-green-400 mb-2">Password Set!</h3>
              <p className="text-gray-400">Redirecting you to the portal...</p>
            </div>
          ) : (
            <form onSubmit={handleSetPassword} className="space-y-6">
              <div className="text-center mb-6">
                <KeyRound className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-gray-100">Create Your Password</h2>
                <p className="text-sm text-gray-400 mt-1">Choose a password to access the DSS Portal</p>
              </div>

              {error && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter your password"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition"
              >
                {loading ? 'Setting Password...' : 'Set Password & Enter Portal'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}