import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Edit2, Trash2, X, Link } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'rep';
  active: boolean;
  state?: string;
}

interface UserManagementTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'rep';
}

export default function UserManagementTab({ currentUserId, currentUserRole }: UserManagementTabProps) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'rep' as 'admin' | 'manager' | 'rep',
  });

  const [setupLinkModal, setSetupLinkModal] = useState<{ email: string; link: string } | null>(null);
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('profiles').select('*').order('name');
      if (fetchError) throw fetchError;
      if (data) {
        setUsers(data.map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          state: user.state || undefined,
        })));
      }
    } catch (err: any) {
      setError('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserForm.name || !newUserForm.email || !newUserForm.password) {
      setError('Name, email, and password are required');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const { error: fnError } = await supabase.functions.invoke('create-user', {
        body: {
          name: newUserForm.name,
          email: newUserForm.email,
          password: newUserForm.password,
          role: newUserForm.role,
          allowedStatuses: [],
        },
      });

      if (fnError) throw fnError;

      setSuccess(`User ${newUserForm.name} created successfully! Edit them to assign a state.`);
      setShowAddForm(false);
      setNewUserForm({ name: '', email: '', password: '', role: 'rep' });
      await fetchUsers();
    } catch (err: any) {
      setError('Failed to create user: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<Profile>) => {
    try {
      setLoading(true);
      setError('');
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: updates.role, active: updates.active, state: updates.state || null })
        .eq('id', userId);
      if (updateError) throw updateError;
      setSuccess('User updated successfully!');
      await fetchUsers();
      setEditingUser(null);
    } catch (err: any) {
      setError('Failed to update user: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      setLoading(true);
      setError('');
      const { error: deleteError } = await supabase.from('profiles').delete().eq('id', userId);
      if (deleteError) throw deleteError;
      setSuccess('User deleted successfully!');
      await fetchUsers();
    } catch (err: any) {
      setError('Failed to delete user: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSetupLink = async (email: string) => {
    try {
      setGeneratingLink(email);
      setError('');
      const { data, error: fnError } = await supabase.functions.invoke('generate-reset-link', {
        body: { email },
      });
      if (fnError) throw fnError;
      setSetupLinkModal({ email, link: data.link });
    } catch (err: any) {
      setError('Failed to generate link: ' + err.message);
    } finally {
      setGeneratingLink(null);
    }
  };

  if (currentUserRole !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-400">You do not have permission to access this page.</p>
      </div>
    );
  }

  const roleLabel = (role: string) => {
    if (role === 'admin') return '👑 Admin';
    if (role === 'manager') return '🏅 Manager';
    return 'Sales Rep';
  };

  const roleBadgeColor = (role: string) => {
    if (role === 'admin') return 'bg-purple-900 text-purple-200';
    if (role === 'manager') return 'bg-yellow-900 text-yellow-200';
    return 'bg-blue-900 text-blue-200';
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">{error}</div>
      )}
      {success && (
        <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded">{success}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">User Management</h2>
          <p className="text-gray-400 text-sm mt-1">Manage user accounts and permissions</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <UserPlus className="w-5 h-5" />
          Add New User
        </button>
      </div>

      {showAddForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-100">Create New User</h3>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Name *</label>
              <input
                type="text"
                value={newUserForm.name}
                onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                placeholder="John Doe"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
              <input
                type="email"
                value={newUserForm.email}
                onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="john@example.com"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Temporary Password *</label>
              <input
                type="password"
                value={newUserForm.password}
                onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
              <select
                value={newUserForm.role}
                onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as 'admin' | 'manager' | 'rep' })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="rep">Sales Rep</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">* After creating, use the 🔗 link button to send them a setup link.</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreateUser}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-750">
                <td className="px-6 py-4 text-sm text-gray-300">{user.name}</td>
                <td className="px-6 py-4 text-sm text-gray-300">{user.email}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadgeColor(user.role)}`}>
                    {roleLabel(user.role)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-300">
                  {user.role === 'rep'
                    ? (user.state || <span className="text-gray-600 italic">Not set</span>)
                    : <span className="text-gray-500 italic">All states</span>}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.active ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="p-2 text-blue-400 hover:text-blue-300 hover:bg-gray-700 rounded transition"
                      title="Edit user"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleGenerateSetupLink(user.email)}
                      disabled={generatingLink === user.email}
                      className="p-2 text-green-400 hover:text-green-300 hover:bg-gray-700 rounded transition disabled:opacity-50"
                      title="Generate setup link"
                    >
                      <Link className="w-4 h-4" />
                    </button>
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded transition"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Edit User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                <input
                  type="text"
                  value={editingUser.name}
                  disabled
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Name cannot be changed here</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
                <select
                  value={editingUser.role}
                  onChange={e => setEditingUser({ ...editingUser, role: e.target.value as 'admin' | 'manager' | 'rep' })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="rep">Sales Rep</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={editingUser.active ? 'active' : 'inactive'}
                  onChange={e => setEditingUser({ ...editingUser, active: e.target.value === 'active' })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              {editingUser.role === 'rep' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Assigned State</label>
                  <input
                    type="text"
                    value={editingUser.state || ''}
                    onChange={e => setEditingUser({ ...editingUser, state: e.target.value.toUpperCase() })}
                    placeholder="e.g. CA, TX, FL"
                    maxLength={2}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Two-letter state abbreviation.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleUpdateUser(editingUser.id, editingUser)}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Link Modal */}
      {setupLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-100">Setup Link</h3>
              <button onClick={() => setSetupLinkModal(null)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Share this link with <span className="text-white font-semibold">{setupLinkModal.email}</span>. They will be prompted to set their password when they click it.
            </p>
            <div className="bg-gray-700 rounded-lg p-3 mb-4 break-all">
              <p className="text-xs text-blue-300 font-mono">{setupLinkModal.link}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(setupLinkModal.link);
                  alert('Link copied to clipboard!');
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                Copy Link
              </button>
              <button
                onClick={() => setSetupLinkModal(null)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
              This link expires after 24 hours.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}