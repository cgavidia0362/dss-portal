import { useState, useEffect } from 'react';
import { UserPlus, Edit2, Trash2, Shield, Copy, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'rep';
  active: boolean;
  allowedStatuses: string[];
}

interface UserManagementTabProps {
  currentUserRole: 'admin' | 'rep';
  users: User[];
  setUsers: (users: User[]) => void;
}

export default function UserManagementTab({
  currentUserRole,
  users,
  setUsers,
}: UserManagementTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'rep' as 'admin' | 'rep',
  });
  const [inviteLink, setInviteLink] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUserRole === 'admin') {
      fetchUsers();
    }
  }, [currentUserRole]);

  const fetchUsers = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      if (data) {
        const formattedUsers: User[] = data.map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          allowedStatuses: user.allowed_statuses || [],
        }));

        setUsers(formattedUsers);
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError('Failed to load users: ' + err.message);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email) {
      setError('Name and email are required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Create user in Supabase Auth with a random temporary password
      const tempPassword = Math.random().toString(36).slice(-12) + 'Aa1!';
      
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: tempPassword,
        email_confirm: true,
      });

      if (authError) throw authError;

      if (!authData.user) throw new Error('Failed to create user');

      // Create profile in database
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          {
            id: authData.user.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            active: true,
            allowed_statuses: newUser.role === 'admin' ? [] : ['Deal', 'No Deal', 'Pending'],
          },
        ]);

      if (profileError) throw profileError;

      // Generate password reset link
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: newUser.email,
      });

      if (linkError) throw linkError;

      // Show the invite link
      setInviteLink(linkData.properties.action_link);
      setShowInviteModal(true);

      // Refresh users list
      await fetchUsers();

      // Reset form
      setNewUser({ name: '', email: '', role: 'rep' });
      setShowAddForm(false);
    } catch (err: any) {
      console.error('Error adding user:', err);
      setError('Failed to add user: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      // Delete from profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      // Delete from auth
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) throw authError;

      // Refresh users list
      await fetchUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setError('Failed to delete user: ' + err.message);
    }
  };

  if (currentUserRole !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">User Management</h2>
          <p className="text-gray-400 mt-1">Manage user accounts and permissions</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <UserPlus className="w-5 h-5" />
          Add User
        </button>
      </div>

      {/* Add User Form */}
      {showAddForm && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Add New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="John Doe"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="john@example.com"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Role
              </label>
              <select
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({ ...newUser, role: e.target.value as 'admin' | 'rep' })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="rep">Sales Rep</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAddUser}
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition"
            >
              {loading ? 'Adding...' : 'Add User'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewUser({ name: '', email: '', role: 'rep' });
                setError('');
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Invite Link Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-100">User Created Successfully!</h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteLink('');
                  setCopied(false);
                }}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <p className="text-gray-300 mb-4">
              Copy this invite link and send it to the user. They'll use it to set their password.
            </p>

            <div className="bg-gray-900 rounded-lg p-4 mb-4 border border-gray-700">
              <div className="flex items-center gap-3">
                <code className="flex-1 text-sm text-gray-300 break-all">
                  {inviteLink}
                </code>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-5 h-5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-blue-900 border border-blue-700 rounded-lg p-4">
              <p className="text-blue-200 text-sm">
                <strong>Important:</strong> This link expires in 1 hour. Send it to the user
                immediately via Slack, Teams, text, or in person.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Allowed Statuses
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-750">
                <td className="px-6 py-4 text-sm text-gray-300">{user.name}</td>
                <td className="px-6 py-4 text-sm text-gray-300">{user.email}</td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-purple-900 text-purple-200'
                        : 'bg-blue-900 text-blue-200'
                    }`}
                  >
                    {user.role === 'admin' ? '👑 Admin' : 'Sales Rep'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.active
                        ? 'bg-green-900 text-green-200'
                        : 'bg-red-900 text-red-200'
                    }`}
                  >
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {user.role === 'admin' ? (
                    <span className="italic">All statuses (Admin)</span>
                  ) : (
                    <span>{user.allowedStatuses.length} statuses</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-blue-400 hover:bg-gray-700 rounded transition">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-2 text-red-400 hover:bg-gray-700 rounded transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* About Status Access Control */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-3">
          About Status Access Control
        </h3>
        <ul className="space-y-2 text-gray-300 text-sm">
          <li>• Admins have access to all statuses automatically</li>
          <li>• Sales reps are restricted to specific statuses you assign</li>
          <li>
            • Default rep statuses: Deal, No Deal, Pending (you can customize this)
          </li>
        </ul>
      </div>
    </div>
  );
}