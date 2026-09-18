import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Edit2, Trash2, Link, Copy, Check, ChevronDown, Download } from 'lucide-react';
import { GRANTABLE_TABS, isTabIncludedWithRole } from '../lib/tabAccess';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  active: boolean;
  state?: string;
  allowedTabs: string[];
}

interface EditForm {
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  active: boolean;
  state: string;
  allowedTabs: string[];
}

interface UserManagementTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'rep' | 'buying_assistant';
}

const US_STATES = [
  'AL','AZ','AR','CA','CO','CT','DE','FL','GA','HI',
  'ID','IL','IN','IA','KS','KY','LA','ME','MD','MA',
  'MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

function sanitizeGrantableTabs(tabs: string[]): string[] {
  const allowed = new Set<string>(GRANTABLE_TABS.map((t) => t.id));
  return [...new Set(tabs.filter((id) => allowed.has(id)))];
}

export default function UserManagementTab({ currentUserId, currentUserRole }: UserManagementTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ role: 'rep', active: true, state: '', allowedTabs: [] });
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const stateDropdownRef = useRef<HTMLDivElement>(null);

  const [setupLinkModal, setSetupLinkModal] = useState<{ userId: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    role: 'rep' as 'admin' | 'manager' | 'rep' | 'buying_assistant',
    allowedTabs: [] as string[],
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
        setStateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('profiles').select('*').order('name');
      if (fetchError) throw fetchError;
      if (data) {
        setUsers(data.map((u: any) => ({
          id: u.id, name: u.name, email: u.email,
          role: u.role, active: u.active, state: u.state || '',
          allowedTabs: Array.isArray(u.allowed_tabs) ? u.allowed_tabs : [],
        })));
      }
    } catch (err: any) {
      setError('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      active: user.active,
      state: user.state || '',
      allowedTabs: sanitizeGrantableTabs(user.allowedTabs || []),
    });
    setStateDropdownOpen(false);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      setError('');
      const { error: updateError } = await supabase
        .from('profiles').update({
          role: editForm.role,
          active: editForm.active,
          state: editForm.state || null,
          allowed_tabs: sanitizeGrantableTabs(editForm.allowedTabs),
        }).eq('id', editingUser.id);
      if (updateError) throw updateError;
      setSuccess('User updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
      setEditingUser(null);
      await fetchUsers();
    } catch (err: any) {
      setError('Failed to update user: ' + err.message);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (userId === currentUserId) { setError("You can't delete your own account."); return; }
    if (!confirm(`Delete ${userName}? This cannot be undone.`)) return;
    try {
      // Delete auth user via edge function (cascades to profile)
      const { error: fnError } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });
      if (fnError) {
        // Fallback: delete just the profile if edge function fails
        const { error: deleteError } = await supabase.from('profiles').delete().eq('id', userId);
        if (deleteError) throw deleteError;
      }
      setSuccess(`${userName} deleted.`);
      setTimeout(() => setSuccess(''), 3000);
      await fetchUsers();
    } catch (err: any) {
      setError('Failed to delete user: ' + err.message);
    }
  };

  const handleGenerateLink = async (userId: string) => {
    setGeneratingLink(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-reset-link', {
        body: { userId },
      });
      if (fnError) throw fnError;
      setSetupLinkModal({ userId, link: data.link });
    } catch (err: any) {
      setError('Failed to generate link: ' + err.message);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.name || !createForm.email) {
      setError('Name and email are required.'); return;
    }
    try {
      setCreating(true); setError('');
      const { error: fnError } = await supabase.functions.invoke('create-user', {
        body: { name: createForm.name, email: createForm.email, role: createForm.role },
      });
      if (fnError) throw fnError;

      const grantedTabs = sanitizeGrantableTabs(createForm.allowedTabs);
      if (grantedTabs.length > 0) {
        const { error: tabsError } = await supabase
          .from('profiles')
          .update({ allowed_tabs: grantedTabs })
          .ilike('email', createForm.email.trim());
        if (tabsError) throw tabsError;
      }

      setSuccess('User created! Generate a setup link to send them.');
      setTimeout(() => setSuccess(''), 5000);
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', role: 'rep', allowedTabs: [] });
      await fetchUsers();
    } catch (err: any) {
      setError('Failed to create user: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleAllowedTab = (
    tabId: string,
    role: string,
    current: string[],
    setTabs: (next: string[]) => void,
  ) => {
    if (isTabIncludedWithRole(role, tabId)) return;
    const set = new Set(current);
    if (set.has(tabId)) set.delete(tabId);
    else set.add(tabId);
    setTabs(sanitizeGrantableTabs([...set]));
  };

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [exporting, setExporting] = useState(false);

  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportAll = async () => {
    setExporting(true);
    setError('');
    try {
      // Fetch all calls in batches
      let allCalls: any[] = [];
      let from = 0;
      const BATCH = 1000;
      while (true) {
        const { data, error: callsError } = await supabase
          .from('calls')
          .select('*')
          .range(from, from + BATCH - 1);
        if (callsError) throw callsError;
        if (!data || data.length === 0) break;
        allCalls = allCalls.concat(data);
        if (data.length < BATCH) break;
        from += BATCH;
      }

      // Fetch all call notes in batches
      let allNotes: any[] = [];
      from = 0;
      while (true) {
        const { data, error: notesError } = await supabase
          .from('call_notes')
          .select('*')
          .range(from, from + BATCH - 1);
        if (notesError) throw notesError;
        if (!data || data.length === 0) break;
        allNotes = allNotes.concat(data);
        if (data.length < BATCH) break;
        from += BATCH;
      }

      // Group notes by call_id
      const notesByCall: { [callId: string]: string[] } = {};
      allNotes.forEach((n: any) => {
        if (!notesByCall[n.call_id]) notesByCall[n.call_id] = [];
        notesByCall[n.call_id].push(`[${n.created_by_name || 'Unknown'} @ ${n.created_at}] ${n.note_text}`);
      });

      // Build CSV
      const headers = [
        'Application ID', 'Dealer Name', 'CIF Number', 'State',
        'Customer Name', 'Assigned Rep', 'Status Last', 'FU Status',
        'Amount', 'Submitted Date', 'Updated At', 'Created At',
        'Deal Date', 'Deal By', 'Is Duplicate', 'Notes',
      ];

      const rows = allCalls.map((c: any) => [
        escapeCsv(c.application_id),
        escapeCsv(c.dealer_name),
        escapeCsv(c.dealer_cif_number),
        escapeCsv(c.state),
        escapeCsv(c.customer_full_name),
        escapeCsv(c.assigned_to_name),
        escapeCsv(c.status_last),
        escapeCsv(c.fu_status),
        escapeCsv(c.buyer_final),
        escapeCsv(c.submitted_date),
        escapeCsv(c.updated_at),
        escapeCsv(c.created_at),
        escapeCsv(c.deal_date),
        escapeCsv(c.deal_by_name),
        escapeCsv(c.is_duplicate),
        escapeCsv((notesByCall[c.id] || []).join(' | ')),
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `dss-portal-export-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(`Exported ${allCalls.length} calls successfully.`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Multi-state helpers
  const getSelectedStates = (stateStr: string): string[] =>
    stateStr ? stateStr.split(',').map(s => s.trim()).filter(Boolean) : [];

  const toggleState = (state: string) => {
    const current = new Set(getSelectedStates(editForm.state));
    if (current.has(state)) current.delete(state); else current.add(state);
    setEditForm({ ...editForm, state: Array.from(current).sort().join(',') });
  };

  const getRoleBadge = (role: string) => {
    if (role === 'admin') return 'bg-dss-accent-soft text-dss-accent border-dss-accent/30';
    if (role === 'manager') return 'bg-dss-accent-soft text-dss-accent border-dss-accent/30';
    if (role === 'buying_assistant') return 'bg-teal-50 text-teal-800 border-teal-200';
    return 'bg-dss-canvas text-dss-ink/80 border-dss-border';
  };

  if (currentUserRole !== 'admin') {
    return (
      <div className="bg-dss-surface rounded-dss-sm border border-dss-border p-8 text-center">
        <p className="text-dss-muted">Access restricted to admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-dss-ink">Users</h2>
          <p className="text-sm text-dss-muted mt-0.5">Manage team members and permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportAll} disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-dss-canvas text-white rounded-dss-sm text-sm font-medium transition">
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export All Data'}
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-dss-navy hover:bg-dss-navy-soft text-white rounded-dss-sm text-sm font-medium transition">
            + Add User
          </button>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-dss-danger px-4 py-3 rounded-dss-sm text-sm">{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-dss-success px-4 py-3 rounded-dss-sm text-sm">{success}</div>}

      {loading ? (
        <div className="bg-dss-surface rounded-dss-sm border border-dss-border p-8 text-center text-dss-muted">Loading...</div>
      ) : (
        <div className="bg-dss-surface rounded-dss-sm border border-dss-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dss-border bg-dss-canvas">
                <th className="px-5 py-3 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Email</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">States</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {users.map(user => {
                const states = getSelectedStates(user.state || '');
                return (
                  <tr key={user.id} className="hover:bg-dss-canvas transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-dss-canvas flex items-center justify-center text-xs font-medium text-dss-ink/80 flex-shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-dss-ink">{user.name}</span>
                        {user.id === currentUserId && (
                          <span className="text-xs text-dss-accent">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-dss-muted">{user.email}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs border ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {states.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {states.map(s => (
                            <span key={s} className="px-2 py-0.5 bg-dss-canvas text-dss-ink/80 text-xs rounded border border-dss-border">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-dss-muted italic">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs border ${user.active
                        ? 'bg-emerald-50 text-dss-success border-emerald-200'
                        : 'bg-rose-50 text-dss-danger border-rose-200'}`}>
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEditUser(user)}
                          className="p-1.5 text-dss-muted hover:text-dss-accent hover:bg-dss-canvas rounded transition"
                          title="Edit user">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleGenerateLink(user.id)} disabled={generatingLink}
                          className="p-1.5 text-dss-muted hover:text-dss-success hover:bg-dss-canvas rounded transition"
                          title="Generate setup link">
                          <Link className="w-4 h-4" />
                        </button>
                        {user.id !== currentUserId && (
                          <button onClick={() => handleDeleteUser(user.id, user.name)}
                            className="p-1.5 text-dss-muted hover:text-dss-danger hover:bg-dss-canvas rounded transition"
                            title="Delete user">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-dss-surface rounded-dss border border-dss-border w-full max-w-md shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dss-border">
              <h3 className="text-lg font-semibold text-dss-ink">Edit — {editingUser.name}</h3>
              <button onClick={() => setEditingUser(null)} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-dss-danger px-3 py-2 rounded-dss-sm text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">Role</label>
                <select value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value as EditForm['role'] })}
                  className="w-full px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-dss-ink text-sm focus:outline-none focus:ring-1 focus:ring-dss-accent/30">
                  <option value="rep">Rep</option>
                  <option value="buying_assistant">Buying Assistant</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">Status</label>
                <select value={editForm.active ? 'active' : 'inactive'}
                  onChange={e => setEditForm({ ...editForm, active: e.target.value === 'active' })}
                  className="w-full px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-dss-ink text-sm focus:outline-none focus:ring-1 focus:ring-dss-accent/30">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Multi-state selector */}
              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">
                  States {getSelectedStates(editForm.state).length > 0 && (
                    <span className="ml-1 text-dss-accent normal-case">
                      ({getSelectedStates(editForm.state).length} selected)
                    </span>
                  )}
                </label>

                {/* Selected state pills */}
                {getSelectedStates(editForm.state).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {getSelectedStates(editForm.state).map(s => (
                      <span key={s}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-dss-accent-soft text-dss-accent text-xs rounded border border-dss-accent/30">
                        {s}
                        <button onClick={() => toggleState(s)} className="text-dss-accent hover:text-white ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Dropdown */}
                <div className="relative" ref={stateDropdownRef}>
                  <button
                    onClick={() => setStateDropdownOpen(!stateDropdownOpen)}
                    className="w-full px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink/80 text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-dss-accent/30 hover:bg-dss-canvas transition"
                  >
                    <span>{getSelectedStates(editForm.state).length === 0 ? 'Select states…' : 'Add or remove states'}</span>
                    <ChevronDown className={`w-4 h-4 text-dss-muted transition-transform ${stateDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {stateDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-dss-canvas border border-dss-border rounded-dss-sm shadow-sm overflow-hidden">
                      <div className="grid grid-cols-5 gap-0 max-h-52 overflow-y-auto p-2">
                        {US_STATES.map(state => {
                          const isSelected = getSelectedStates(editForm.state).includes(state);
                          return (
                            <button
                              key={state}
                              onClick={() => toggleState(state)}
                              className={`px-2 py-1.5 text-xs rounded transition font-medium ${
                                isSelected
                                  ? 'bg-dss-navy text-white'
                                  : 'text-dss-ink/80 hover:bg-dss-accent-soft'
                              }`}
                            >
                              {state}
                            </button>
                          );
                        })}
                      </div>
                      <div className="px-3 py-2 border-t border-dss-border flex justify-between items-center">
                        <span className="text-xs text-dss-muted">
                          {getSelectedStates(editForm.state).length} state{getSelectedStates(editForm.state).length !== 1 ? 's' : ''} selected
                        </span>
                        <button onClick={() => setEditForm({ ...editForm, state: '' })}
                          className="text-xs text-dss-danger hover:text-dss-danger">
                          Clear all
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">
                  Extra tab access
                </label>
                <div className="space-y-2 rounded-dss-sm border border-dss-border bg-dss-canvas/40 px-3 py-3">
                  {GRANTABLE_TABS.map((tab) => {
                    const included = isTabIncludedWithRole(editForm.role, tab.id);
                    const checked = included || editForm.allowedTabs.includes(tab.id);
                    return (
                      <label key={tab.id} className="flex items-start gap-2 text-sm text-dss-ink">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-dss-border bg-dss-surface text-blue-500 focus:ring-dss-accent/30"
                          checked={checked}
                          disabled={included}
                          onChange={() =>
                            toggleAllowedTab(
                              tab.id,
                              editForm.role,
                              editForm.allowedTabs,
                              (allowedTabs) => setEditForm({ ...editForm, allowedTabs }),
                            )
                          }
                        />
                        <span>
                          {tab.label}
                          {included && (
                            <span className="block text-xs text-dss-muted font-normal">
                              Included with this role
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={handleSaveEdit}
                className="flex-1 py-2 bg-dss-navy hover:bg-dss-navy-soft text-white rounded-dss-sm text-sm font-medium transition">
                Save Changes
              </button>
              <button onClick={() => setEditingUser(null)}
                className="flex-1 py-2 bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80 rounded-dss-sm text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETUP LINK MODAL */}
      {setupLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-dss-surface rounded-dss border border-dss-border w-full max-w-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-dss-ink">Setup Link</h3>
              <button onClick={() => setSetupLinkModal(null)} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
            </div>
            <p className="text-sm text-dss-muted mb-4">Share this link with the user so they can set their password.</p>
            <div className="flex gap-2">
              <input type="text" readOnly value={setupLinkModal.link}
                className="flex-1 px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-xs text-dss-ink/80 focus:outline-none" />
              <button onClick={() => copyLink(setupLinkModal.link)}
                className={`flex items-center gap-2 px-4 py-2 rounded-dss-sm text-sm font-medium transition ${
                  copied ? 'bg-dss-success text-white' : 'bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80'
                }`}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-dss-surface rounded-dss border border-dss-border w-full max-w-md shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dss-border">
              <h3 className="text-lg font-semibold text-dss-ink">Add New User</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">Full Name</label>
                <input type="text" value={createForm.name}
                  onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Jane Smith"
                  className="w-full px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-dss-ink text-sm focus:outline-none focus:ring-1 focus:ring-dss-accent/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">Email</label>
                <input type="email" value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="e.g. jane@pronto.com"
                  className="w-full px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-dss-ink text-sm focus:outline-none focus:ring-1 focus:ring-dss-accent/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">Role</label>
                <select value={createForm.role}
                  onChange={e => setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'manager' | 'rep' | 'buying_assistant' })}
                  className="w-full px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-dss-ink text-sm focus:outline-none focus:ring-1 focus:ring-dss-accent/30">
                  <option value="rep">Rep</option>
                  <option value="buying_assistant">Buying Assistant</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-dss-muted uppercase tracking-wider mb-2">
                  Extra tab access
                </label>
                <div className="space-y-2 rounded-dss-sm border border-dss-border bg-dss-canvas/40 px-3 py-3">
                  {GRANTABLE_TABS.map((tab) => {
                    const included = isTabIncludedWithRole(createForm.role, tab.id);
                    const checked = included || createForm.allowedTabs.includes(tab.id);
                    return (
                      <label key={tab.id} className="flex items-start gap-2 text-sm text-dss-ink">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-dss-border bg-dss-surface text-blue-500 focus:ring-dss-accent/30"
                          checked={checked}
                          disabled={included}
                          onChange={() =>
                            toggleAllowedTab(
                              tab.id,
                              createForm.role,
                              createForm.allowedTabs,
                              (allowedTabs) => setCreateForm({ ...createForm, allowedTabs }),
                            )
                          }
                        />
                        <span>
                          {tab.label}
                          {included && (
                            <span className="block text-xs text-dss-muted font-normal">
                              Included with this role
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={handleCreateUser} disabled={creating}
                className="flex-1 py-2 bg-dss-navy hover:bg-dss-navy-soft disabled:bg-dss-canvas text-white rounded-dss-sm text-sm font-medium transition">
                {creating ? 'Creating...' : 'Create User'}
              </button>
              <button onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80 rounded-dss-sm text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}