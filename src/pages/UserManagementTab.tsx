import { useState } from 'react';
import { UserPlus, Edit, Trash2, Key, Check, X } from 'lucide-react';

// Inline types
interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: 'admin' | 'rep';
  active: boolean;
  createdAt: Date;
}

interface UserManagementTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'rep';
}

export default function UserManagementTab({
  currentUserId,
  currentUserRole,
}: UserManagementTabProps) {
  // Mock users
  const [users, setUsers] = useState<User[]>([
    {
      id: '1',
      username: 'admin',
      fullName: 'Admin User',
      email: 'admin@dss.com',
      role: 'admin',
      active: true,
      createdAt: new Date('2025-01-01'),
    },
    {
      id: 'rep1',
      username: 'jsmith',
      fullName: 'John Smith',
      email: 'jsmith@dss.com',
      role: 'rep',
      active: true,
      createdAt: new Date('2025-01-15'),
    },
    {
      id: 'rep2',
      username: 'sjohnson',
      fullName: 'Sarah Johnson',
      email: 'sjohnson@dss.com',
      role: 'rep',
      active: true,
      createdAt: new Date('2025-01-20'),
    },
  ]);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Add user form
  const [newUser, setNewUser] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'rep' as 'admin' | 'rep',
  });

  // Edit user form
  const [editUserData, setEditUserData] = useState({
    fullName: '',
    email: '',
    role: 'rep' as 'admin' | 'rep',
  });

  // Reset password form
  const [newPassword, setNewPassword] = useState('');

  // Only admins can see this tab
  if (currentUserRole !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">
          This tab is only accessible to administrators.
        </p>
      </div>
    );
  }

  // Handle add user
  const handleAddUser = () => {
    if (
      !newUser.username ||
      !newUser.fullName ||
      !newUser.email ||
      !newUser.password
    ) {
      alert('Please fill in all fields');
      return;
    }

    const user: User = {
      id: `user_${Date.now()}`,
      username: newUser.username,
      fullName: newUser.fullName,
      email: newUser.email,
      role: newUser.role,
      active: true,
      createdAt: new Date(),
    };

    setUsers([...users, user]);
    setSuccessMessage(`User "${newUser.username}" created successfully!`);
    setShowSuccess(true);
    setShowAddModal(false);
    setNewUser({
      username: '',
      fullName: '',
      email: '',
      password: '',
      role: 'rep',
    });

    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Handle edit user
  const handleEditUser = () => {
    if (!selectedUser) return;

    setUsers(
      users.map((user) =>
        user.id === selectedUser.id
          ? {
              ...user,
              fullName: editUserData.fullName,
              email: editUserData.email,
              role: editUserData.role,
            }
          : user
      )
    );

    setSuccessMessage(`User "${selectedUser.username}" updated successfully!`);
    setShowSuccess(true);
    setShowEditModal(false);
    setSelectedUser(null);

    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Handle delete/deactivate user
  const handleToggleActive = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    if (userId === currentUserId) {
      alert('You cannot deactivate your own account!');
      return;
    }

    const confirmMsg = user.active
      ? `Are you sure you want to deactivate ${user.fullName}?`
      : `Are you sure you want to activate ${user.fullName}?`;

    if (confirm(confirmMsg)) {
      setUsers(
        users.map((u) => (u.id === userId ? { ...u, active: !u.active } : u))
      );

      setSuccessMessage(
        `User "${user.username}" ${
          user.active ? 'deactivated' : 'activated'
        } successfully!`
      );
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  // Handle delete user permanently
  const handleDeleteUser = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    if (userId === currentUserId) {
      alert('You cannot delete your own account!');
      return;
    }

    if (
      confirm(
        `Are you sure you want to permanently delete ${user.fullName}? This action cannot be undone.`
      )
    ) {
      setUsers(users.filter((u) => u.id !== userId));
      setSuccessMessage(`User "${user.username}" deleted successfully!`);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  // Handle reset password
  const handleResetPassword = () => {
    if (!selectedUser || !newPassword) {
      alert('Please enter a new password');
      return;
    }

    setSuccessMessage(
      `Password for "${selectedUser.username}" reset successfully!`
    );
    setShowSuccess(true);
    setShowResetPasswordModal(false);
    setSelectedUser(null);
    setNewPassword('');

    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Open edit modal
  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditUserData({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    });
    setShowEditModal(true);
  };

  // Open reset password modal
  const openResetPasswordModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setShowResetPasswordModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">User Management</h2>
          <p className="text-gray-400 mt-1">
            Manage users and their access to the system
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <UserPlus className="w-5 h-5" />
          Add New User
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-900 border border-green-700 text-green-100 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Full Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4 text-sm font-medium text-gray-100">
                    {user.username}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-200">
                    {user.fullName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-blue-900 text-blue-200'
                          : 'bg-green-900 text-green-200'
                      }`}
                    >
                      {user.role === 'admin' ? 'Admin' : 'Rep'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.active
                          ? 'bg-green-900 text-green-200'
                          : 'bg-red-900 text-red-200'
                      }`}
                    >
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    {user.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
                        title="Edit User"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openResetPasswordModal(user)}
                        className="p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition"
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(user.id)}
                        className={`p-2 ${
                          user.active
                            ? 'bg-orange-600 hover:bg-orange-700'
                            : 'bg-green-600 hover:bg-green-700'
                        } text-white rounded transition`}
                        title={user.active ? 'Deactivate' : 'Activate'}
                      >
                        {user.active ? (
                          <X className="w-4 h-4" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded transition"
                        title="Delete User"
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
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100">
                Add New User
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newUser.fullName}
                  onChange={(e) =>
                    setNewUser({ ...newUser, fullName: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                  placeholder="Enter email"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                  placeholder="Enter password"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({
                      ...newUser,
                      role: e.target.value as 'admin' | 'rep',
                    })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                >
                  <option value="rep">Rep</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewUser({
                    username: '',
                    fullName: '',
                    email: '',
                    password: '',
                    role: 'rep',
                  });
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Add User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100">
                Edit User: {selectedUser.username}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editUserData.fullName}
                  onChange={(e) =>
                    setEditUserData({
                      ...editUserData,
                      fullName: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={editUserData.email}
                  onChange={(e) =>
                    setEditUserData({ ...editUserData, email: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Role</label>
                <select
                  value={editUserData.role}
                  onChange={(e) =>
                    setEditUserData({
                      ...editUserData,
                      role: e.target.value as 'admin' | 'rep',
                    })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                >
                  <option value="rep">Rep</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEditUser}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100">
                Reset Password: {selectedUser.username}
              </h3>
            </div>
            <div className="px-6 py-4">
              <label className="block text-sm text-gray-400 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                placeholder="Enter new password"
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetPasswordModal(false);
                  setSelectedUser(null);
                  setNewPassword('');
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition"
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
