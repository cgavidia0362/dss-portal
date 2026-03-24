import { useState } from 'react';
import { UserPlus, Edit2, Trash2, Check, X, Shield } from 'lucide-react';

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
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

const allStatusOptions = [
  'Accepted',
  'Approved',
  'Approval',
  'Counter',
  'Denial',
  'Declined',
  'Pending Approval',
  'Document Received',
  'Funded',
  'Funding Pending',
  'New Application',
  'Incomplete',
  'Withdrawn',
  'Cancelled',
];

export default function UserManagementTab({ currentUserRole, users, setUsers }: UserManagementTabProps) {
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingStatuses, setEditingStatuses] = useState<string | null>(null);
  
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'rep' as 'admin' | 'rep',
  });

  const [editUser, setEditUser] = useState<User | null>(null);
  const [tempStatuses, setTempStatuses] = useState<Set<string>>(new Set());

  if (currentUserRole !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">This tab is only accessible to administrators.</p>
      </div>
    );
  }

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) {
      alert('Please fill in all fields');
      return;
    }

    const user: User = {
      id: `user_${Date.now()}`,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      active: true,
      allowedStatuses: newUser.role === 'rep' ? [] : [],
    };

    setUsers((prev) => [...prev, user]);
    setNewUser({ name: '', email: '', role: 'rep' });
    setIsAddingUser(false);
  };

  const handleStartEdit = (user: User) => {
    setEditingUser(user.id);
    setEditUser({ ...user });
  };

  const handleSaveEdit = () => {
    if (!editUser) return;

    setUsers((prev) =>
      prev.map((user) => (user.id === editUser.id ? editUser : user))
    );
    setEditingUser(null);
    setEditUser(null);
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers((prev) => prev.filter((user) => user.id !== userId));
    }
  };

  const handleToggleActive = (userId: string) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, active: !user.active } : user
      )
    );
  };

  const handleStartEditStatuses = (user: User) => {
    setEditingStatuses(user.id);
    setTempStatuses(new Set(user.allowedStatuses));
  };

  const handleToggleStatus = (status: string) => {
    const newStatuses = new Set(tempStatuses);
    if (newStatuses.has(status)) {
      newStatuses.delete(status);
    } else {
      newStatuses.add(status);
    }
    setTempStatuses(newStatuses);
  };

  const handleSaveStatuses = (userId: string) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? { ...user, allowedStatuses: Array.from(tempStatuses) }
          : user
      )
    );
    setEditingStatuses(null);
    setTempStatuses(new Set());
  };

  const handleSelectAllStatuses = () => {
    setTempStatuses(new Set(allStatusOptions));
  };

  const handleClearAllStatuses = () => {
    setTempStatuses(new Set());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">User Management</h2>
          <p className="text-gray-400 mt-1">
            Manage user accounts and permissions
          </p>
        </div>
        <button
          onClick={() => setIsAddingUser(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {isAddingUser && (
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Add New User
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Name</label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                placeholder="john@example.com"
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
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
              >
                <option value="rep">Sales Rep</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddUser}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
            >
              Add User
            </button>
            <button
              onClick={() => {
                setIsAddingUser(false);
                setNewUser({ name: '', email: '', role: 'rep' });
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                Email
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                Role
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                Status
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                Allowed Statuses
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-750">
                <td className="px-4 py-4">
                  {editingUser === user.id ? (
                    <input
                      type="text"
                      value={editUser?.name || ''}
                      onChange={(e) =>
                        setEditUser(
                          editUser ? { ...editUser, name: e.target.value } : null
                        )
                      }
                      className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100"
                    />
                  ) : (
                    <span className="text-sm text-gray-100">{user.name}</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {editingUser === user.id ? (
                    <input
                      type="email"
                      value={editUser?.email || ''}
                      onChange={(e) =>
                        setEditUser(
                          editUser ? { ...editUser, email: e.target.value } : null
                        )
                      }
                      className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100"
                    />
                  ) : (
                    <span className="text-sm text-gray-300">{user.email}</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {editingUser === user.id ? (
                    <select
                      value={editUser?.role || 'rep'}
                      onChange={(e) =>
                        setEditUser(
                          editUser
                            ? {
                                ...editUser,
                                role: e.target.value as 'admin' | 'rep',
                              }
                            : null
                        )
                      }
                      className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100"
                    >
                      <option value="rep">Sales Rep</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-900 text-purple-200'
                          : 'bg-blue-900 text-blue-200'
                      }`}
                    >
                      {user.role === 'admin' ? (
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      ) : (
                        'Sales Rep'
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <button
                    onClick={() => handleToggleActive(user.id)}
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.active
                        ? 'bg-green-900 text-green-200'
                        : 'bg-red-900 text-red-200'
                    }`}
                  >
                    {user.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-4">
                  {user.role === 'admin' ? (
                    <span className="text-sm text-gray-500 italic">
                      All statuses (Admin)
                    </span>
                  ) : editingStatuses === user.id ? (
                    <div className="space-y-3">
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={handleSelectAllStatuses}
                          className="text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          Select All
                        </button>
                        <button
                          onClick={handleClearAllStatuses}
                          className="text-xs text-red-400 hover:text-red-300 underline"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="flex gap-2 flex-wrap max-w-md">
                        {allStatusOptions.map((status) => {
                          const isSelected = tempStatuses.has(status);
                          return (
                            <button
                              key={status}
                              onClick={() => handleToggleStatus(status)}
                              className={`px-2 py-1 rounded text-xs font-medium transition ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              {status}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleSaveStatuses(user.id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingStatuses(null);
                            setTempStatuses(new Set());
                          }}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs transition flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {user.allowedStatuses.length === 0 ? (
                        <span className="text-sm text-yellow-400">
                          No access (0 statuses)
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">
                          {user.allowedStatuses.length} statuses
                        </span>
                      )}
                      <button
                        onClick={() => handleStartEditStatuses(user)}
                        className="text-blue-400 hover:text-blue-300 text-xs underline"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    {editingUser === user.id ? (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          className="text-green-400 hover:text-green-300"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingUser(null);
                            setEditUser(null);
                          }}
                          className="text-red-400 hover:text-red-300"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartEdit(user)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-900 bg-opacity-20 border border-blue-700 p-6 rounded-lg">
        <h4 className="text-blue-300 font-semibold mb-2">
          About Status Access Control
        </h4>
        <ul className="text-sm text-blue-200 space-y-2">
          <li>• Admins have access to all statuses automatically</li>
          <li>• Sales reps can only see calls with their allowed statuses</li>
          <li>• Reps with no allowed statuses won't see any calls</li>
          <li>• Use "Edit" to assign specific application statuses to each rep</li>
          <li>• This helps focus reps on specific types of applications</li>
        </ul>
      </div>
    </div>
  );
}