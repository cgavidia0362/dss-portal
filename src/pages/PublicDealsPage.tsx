import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronRight, ChevronDown, Edit2, Check, X, MessageSquare, Users, Trash2 } from 'lucide-react';

interface DailyDeal {
  id: string;
  appId: string;
  dealerName: string;
  customerName: string;
  amount: string;
  state: string;
  fuStatus: string;
  addedBy: string;
  addedByName: string;
  createdAt: string;
}

interface DealNote {
  id: string;
  dealId: string;
  noteText: string;
  createdByName: string;
  createdAt: string;
}

interface CallDeal {
  id: string;
  applicationId: string;
  dealerName: string;
  buyerFinal: string;
  state: string;
  fuStatus: string;
  dealBy?: string;
  dealByName?: string;
  assignedTo?: string;
  assignedToName?: string;
  dealDate: string;
}

interface CombinedEntry {
  id: string;
  source: 'manual' | 'call';
  appId: string;
  dealerName: string;
  customerName: string;
  amount: string;
  state: string;
  fuStatus: string;
  creditName: string;
  creditId?: string;
  sortTime: number;
}

interface RepUser {
  id: string;
  name: string;
  role: string;
}

const FU_STATUSES = ['Deal', 'Confirmed Deal', 'Pending', 'No Answer', 'No Deal'];

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const getFuStatusStyle = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('confirmed')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  if (s.includes('deal')) return 'bg-green-900 text-green-300 border-green-700';
  if (s.includes('pending')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('no answer')) return 'bg-orange-900 text-orange-300 border-orange-700';
  if (s.includes('no deal')) return 'bg-red-900 text-red-300 border-red-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

const getStatusLastStyle = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('approved') || s === 'approval') return 'bg-green-900 text-green-300 border-green-700';
  if (s === 'pending approval' || s.includes('pending approval')) return 'bg-purple-900 text-purple-300 border-purple-700';
  if (s.includes('counter')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('denial') || s.includes('declined')) return 'bg-red-900 text-red-300 border-red-700';
  if (s.includes('accepted')) return 'bg-blue-900 text-blue-300 border-blue-700';
  if (s.includes('funded') || s.includes('funding')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

const isSameLocalDate = (dateStr: string, today: string): boolean => {
  const d = new Date(dateStr);
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return localDate === today;
};

export default function PublicDealsPage() {
  const today = getTodayString();

  const [users, setUsers] = useState<RepUser[]>([]);
  const [todayDeals, setTodayDeals] = useState<DailyDeal[]>([]);
  const [callDealsToday, setCallDealsToday] = useState<CallDeal[]>([]);
  const [dealNotes, setDealNotes] = useState<{ [dealId: string]: DealNote[] }>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newNoteText, setNewNoteText] = useState<{ [dealId: string]: string }>({});
  const [teamGoal, setTeamGoal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [selectedUser, setSelectedUser] = useState('');
  const [form, setForm] = useState({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });

  const [editingDeal, setEditingDeal] = useState<string | null>(null);
  const [editAppId, setEditAppId] = useState('');
  const [editDealerName, setEditDealerName] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editState, setEditState] = useState('');
  const [editFuStatus, setEditFuStatus] = useState('');
  const [editCreditId, setEditCreditId] = useState('');
  const [editCreditName, setEditCreditName] = useState('');

  const [callOverrides, setCallOverrides] = useState<{ [id: string]: { amount?: string; fuStatus?: string } }>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [linkedCall, setLinkedCall] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);

  const [dealerPopup, setDealerPopup] = useState<string | null>(null);
  const [dealerPopupCalls, setDealerPopupCalls] = useState<any[]>([]);
  const [dealerPopupLoading, setDealerPopupLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchTodayDeals();
    fetchCallDealsToday();
    fetchTeamGoal();

    const channel = supabase
      .channel('public_deals_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_deals' }, () => { fetchTodayDeals(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => { fetchCallDealsToday(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── ESCAPE KEY (layered) ─────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dealerPopup) { setDealerPopup(null); setDealerPopupCalls([]); return; }
        if (expandedRows.size > 0) { setExpandedRows(new Set()); return; }
        if (editingDeal) { setEditingDeal(null); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dealerPopup, expandedRows, editingDeal]);

  const fetchTeamGoal = async () => {
    const { data } = await supabase.from('team_goals').select('team_daily').eq('id', 1).single();
    if (data) setTeamGoal(data.team_daily || 0);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, name, role').eq('active', true).order('name');
    if (data) setUsers(data.map((u: any) => ({ id: u.id, name: u.name, role: u.role })));
  };

  const fetchTodayDeals = async () => {
    setLoading(true);
    const { data } = await supabase.from('daily_deals').select('*').eq('deal_date', today).order('created_at', { ascending: false });
    if (data) {
      const formatted = data.map((d: any) => ({
        id: d.id, appId: d.app_id, dealerName: d.dealer_name,
        customerName: d.customer_name, amount: d.amount,
        state: d.state, fuStatus: d.fu_status,
        addedBy: d.added_by, addedByName: d.added_by_name,
        createdAt: d.created_at,
      }));
      setTodayDeals(formatted);
      if (formatted.length > 0) fetchNotesForDeals(formatted.map((d: DailyDeal) => d.id));
    }
    setLoading(false);
  };

  const fetchCallDealsToday = async () => {
    const { data } = await supabase
      .from('calls')
      .select('id, application_id, dealer_name, buyer_final, state, fu_status, deal_date, deal_by, deal_by_name, assigned_to, assigned_to_name')
      .in('fu_status', ['Deal', 'Confirmed Deal'])
      .not('deal_date', 'is', null);
    if (data) {
      const todayCalls = data.filter((c: any) => c.deal_date && isSameLocalDate(c.deal_date, today));
      setCallDealsToday(todayCalls.map((c: any) => ({
        id: c.id, applicationId: c.application_id, dealerName: c.dealer_name,
        buyerFinal: c.buyer_final || '0', state: c.state, fuStatus: c.fu_status,
        dealBy: c.deal_by || undefined, dealByName: c.deal_by_name || undefined,
        assignedTo: c.assigned_to || undefined, assignedToName: c.assigned_to_name || undefined,
        dealDate: c.deal_date,
      })));
    }
  };

  const fetchNotesForDeals = async (dealIds: string[]) => {
    if (!dealIds.length) return;
    const { data } = await supabase.from('daily_deal_notes').select('*').in('deal_id', dealIds).order('created_at', { ascending: true });
    if (data) {
      const grouped: { [id: string]: DealNote[] } = {};
      data.forEach((n: any) => {
        if (!grouped[n.deal_id]) grouped[n.deal_id] = [];
        grouped[n.deal_id].push({ id: n.id, dealId: n.deal_id, noteText: n.note_text, createdByName: n.created_by_name, createdAt: n.created_at });
      });
      setDealNotes(grouped);
    }
  };

  const openDealerPopup = async (dealerName: string) => {
    setDealerPopup(dealerName);
    setDealerPopupLoading(true);
    const { data } = await supabase
      .from('calls')
      .select('id, application_id, buyer_final, state, fu_status, status_last, submitted_date')
      .eq('dealer_name', dealerName)
      .order('submitted_date', { ascending: false });
    setDealerPopupCalls(data || []);
    setDealerPopupLoading(false);
  };

  // ── SEARCH ──────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const { data } = await supabase.from('calls').select('id, application_id, dealer_name, buyer_final, state')
      .ilike('application_id', `%${searchQuery.trim()}%`).limit(5);
    setSearchResults(data || []);
    setSearching(false);
  };

  const handleSelectCall = (call: any) => {
    setLinkedCall(call);
    setForm(prev => ({
      ...prev,
      appId: call.application_id,
      dealerName: call.dealer_name,
      amount: call.buyer_final || '',
      state: call.state,
      fuStatus: 'Deal',
      customerName: '',
    }));
    setSearchResults([]);
    setSearchQuery('');
  };

  const clearLinkedCall = () => {
    setLinkedCall(null);
    setSearchQuery('');
    setSearchResults([]);
    setForm(prev => ({ ...prev, appId: '', dealerName: '', customerName: '', amount: '', state: '' }));
  };

  // ── SUBMIT ──────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedUser) { setError('Please select your name.'); return; }
    if (!form.appId || !form.dealerName || !form.amount || !form.state) {
      setError('App ID, dealer, amount and state are required.'); return;
    }
    if (!linkedCall && !form.customerName) {
      setError('Customer name is required.'); return;
    }
    setError('');
    setSubmitting(true);
    try {
      const user = users.find(u => u.id === selectedUser);
      const { error: err } = await supabase.from('daily_deals').insert({
        app_id: form.appId.trim(), dealer_name: form.dealerName.trim(),
        customer_name: form.customerName.trim() || '',
        amount: form.amount.trim(),
        state: form.state.trim().toUpperCase(), fu_status: form.fuStatus,
        added_by: selectedUser, added_by_name: user?.name || 'Unknown', deal_date: today,
      });
      if (err) throw err;

      if (linkedCall) {
        await supabase.from('calls').update({
          fu_status: form.fuStatus,
          deal_by: selectedUser,
          deal_by_name: user?.name || 'Unknown',
          deal_date: today,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedCall.id);
        setLinkedCall(null);
        await fetchCallDealsToday();
      }

      setSuccess(`Deal logged successfully for ${user?.name}!`);
      setForm({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError('Failed to log deal: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCombined = async (entry: CombinedEntry) => {
    try {
      if (entry.source === 'manual') {
        const creditUser = users.find(u => u.id === editCreditId);
        const { error: err } = await supabase.from('daily_deals').update({
          app_id: editAppId.trim(), dealer_name: editDealerName.trim(),
          customer_name: editCustomerName.trim(), amount: editAmount.trim(),
          state: editState.trim().toUpperCase(), fu_status: editFuStatus,
          added_by: editCreditId || null, added_by_name: creditUser?.name || editCreditName,
        }).eq('id', entry.id);
        if (err) throw err;
        await fetchTodayDeals();
      } else {
        const { error: err } = await supabase.from('calls')
          .update({ buyer_final: editAmount.trim(), fu_status: editFuStatus, updated_at: new Date().toISOString() })
          .eq('id', entry.id);
        if (err) throw err;
        setCallOverrides(prev => ({ ...prev, [entry.id]: { amount: editAmount.trim(), fuStatus: editFuStatus } }));
      }
      setEditingDeal(null);
    } catch (e: any) {
      setError('Failed to update: ' + e.message);
    }
  };

  const handleDeleteDeal = async (deal: DailyDeal) => {
    if (!selectedUser) { setError('Please select your name to delete entries.'); return; }
    if (deal.addedBy !== selectedUser) { setError('You can only delete your own entries.'); return; }
    if (!confirm('Delete this deal entry?')) return;
    const { error: err } = await supabase.from('daily_deals').delete().eq('id', deal.id);
    if (err) { setError('Failed to delete: ' + err.message); return; }
    await fetchTodayDeals();
  };

  const handleAddNote = async (dealId: string) => {
    const text = newNoteText[dealId]?.trim();
    if (!text) return;
    const currentUser = users.find(u => u.id === selectedUser);
    const { error: err } = await supabase.from('daily_deal_notes').insert({
      deal_id: dealId, note_text: text, created_by_name: currentUser?.name || 'Anonymous',
    });
    if (err) return;
    setNewNoteText(prev => ({ ...prev, [dealId]: '' }));
    await fetchNotesForDeals(todayDeals.map(d => d.id));
  };

  const startEditing = (entry: CombinedEntry) => {
    setEditingDeal(entry.id);
    setEditAppId(entry.appId);
    setEditDealerName(entry.dealerName);
    setEditCustomerName(entry.customerName === '—' ? '' : entry.customerName);
    setEditAmount(entry.amount);
    setEditState(entry.state);
    setEditFuStatus(entry.fuStatus);
    setEditCreditId(entry.creditId || '');
    setEditCreditName(entry.creditName);
  };

  const toggleRow = (id: string) => {
    if (editingDeal === id) return;
    const n = new Set(expandedRows);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedRows(n);
  };

  const toggleNotes = (e: React.MouseEvent, id: string) => { e.stopPropagation(); toggleRow(id); };

  // ── KPIs ─────────────────────────────────────────────────────────
  const ddDealCount = todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').length;
  const ddTotalAmount = todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').reduce((s, d) => s + parseAmount(d.amount), 0);
  const callDealCount = callDealsToday.length;
  const callDealAmount = callDealsToday.reduce((s, c) => s + parseAmount(c.buyerFinal), 0);
  const totalDealCount = ddDealCount + callDealCount;
  const totalAmount = ddTotalAmount + callDealAmount;
  const goalPct = teamGoal > 0 ? Math.min((totalDealCount / teamGoal) * 100, 100) : 0;

  const combinedEntries: CombinedEntry[] = [
    ...todayDeals.map(d => ({
      id: d.id, source: 'manual' as const,
      appId: d.appId, dealerName: d.dealerName, customerName: d.customerName,
      amount: d.amount, state: d.state, fuStatus: d.fuStatus,
      creditName: d.addedByName, creditId: d.addedBy,
      sortTime: new Date(d.createdAt).getTime(),
    })),
    ...callDealsToday.map(c => ({
      id: c.id, source: 'call' as const,
      appId: c.applicationId, dealerName: c.dealerName, customerName: '—',
      amount: callOverrides[c.id]?.amount ?? c.buyerFinal,
      state: c.state, fuStatus: callOverrides[c.id]?.fuStatus ?? c.fuStatus,
      creditName: c.dealByName || c.assignedToName || 'Unknown',
      creditId: c.dealBy || c.assignedTo,
      sortTime: new Date(c.dealDate).getTime(),
    })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  const leaderboard = (() => {
    const nameMap: { [id: string]: string } = {};
    const roleMap: { [id: string]: string } = {};
    users.forEach(u => { nameMap[u.id] = u.name; roleMap[u.id] = u.role; });
    const repMap: { [id: string]: { name: string; dealCount: number; amount: number; role: string } } = {};
    users.forEach(u => { repMap[u.id] = { name: u.name, dealCount: 0, amount: 0, role: u.role }; });
    todayDeals.forEach(d => {
      if (d.fuStatus !== 'Deal' && d.fuStatus !== 'Confirmed Deal') return;
      if (!repMap[d.addedBy]) repMap[d.addedBy] = { name: d.addedByName, dealCount: 0, amount: 0, role: roleMap[d.addedBy] || 'rep' };
      repMap[d.addedBy].dealCount++;
      repMap[d.addedBy].amount += parseAmount(d.amount);
    });
    callDealsToday.forEach(c => {
      const creditId = c.dealBy || c.assignedTo;
      const creditName = c.dealByName || c.assignedToName || nameMap[creditId || ''] || 'Unknown';
      if (!creditId) return;
      if (!repMap[creditId]) repMap[creditId] = { name: creditName, dealCount: 0, amount: 0, role: roleMap[creditId] || 'rep' };
      repMap[creditId].dealCount++;
      repMap[creditId].amount += parseAmount(c.buyerFinal);
    });
    return Object.entries(repMap).map(([id, data]) => ({ id, ...data }))
      .filter(r => r.dealCount > 0 || r.role === 'rep')
      .sort((a, b) => b.dealCount - a.dealCount || b.amount - a.amount);
  })();

  const inputCls = 'px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-blue-400">DSS Portal</h1>
            <span className="text-xs text-gray-500 bg-gray-700 px-2.5 py-1 rounded-full border border-gray-600">Daily Deals</span>
          </div>
          <span className="text-xs text-gray-500">{formatDateLabel(today)}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
          <div className="space-y-4">

            {/* KPI CARDS */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Deals Today</p>
                <p className="text-3xl font-bold text-green-400">{totalDealCount}</p>
                {callDealCount > 0 && <p className="text-xs text-gray-500 mt-1">+{callDealCount} from calls</p>}
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Amount</p>
                <p className="text-2xl font-bold text-green-400">{formatCurrency(totalAmount)}</p>
                {callDealAmount > 0 && <p className="text-xs text-gray-500 mt-1">+{formatCurrency(callDealAmount)} from calls</p>}
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Team Goal</p>
                </div>
                <p className="text-xl font-bold text-cyan-400 leading-none">
                  {totalDealCount} <span className="text-sm font-normal text-gray-500">/ {teamGoal}</span>
                </p>
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${goalPct}%` }} />
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Entries</p>
                <p className="text-3xl font-bold text-blue-400">{combinedEntries.length}</p>
                <p className="text-xs text-gray-500 mt-1">all sources</p>
              </div>
            </div>

            {/* FORM */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-gray-200">Log a deal</h2>
              </div>
              <div className="p-5 space-y-4">
                {success && <div className="bg-green-900 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">{success}</div>}
                {error && <div className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">{error}</div>}

                {/* Search — only when no call linked */}
                {!linkedCall && (
                  <div className="bg-gray-750 border border-gray-600 rounded-lg p-3">
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Search existing app (optional)</label>
                    <div className="flex gap-2">
                      <input type="text" value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults([]); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                        placeholder="Type App ID to search…"
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={handleSearch} disabled={searching}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition">
                        {searching ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {searchResults.map((call: any) => (
                          <div key={call.id} className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded-lg border border-gray-600">
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-blue-400 font-medium">{call.application_id}</span>
                              <span className="text-xs text-gray-300">{call.dealer_name}</span>
                              <span className="text-xs text-gray-500">{call.state}</span>
                              <span className="text-xs text-gray-400">{formatCurrency(parseAmount(call.buyer_final))}</span>
                            </div>
                            <button onClick={() => handleSelectCall(call)}
                              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                              Use this app →
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.length === 0 && searchQuery && !searching && (
                      <p className="text-xs text-gray-500 mt-2">No match found — fill in the details manually below.</p>
                    )}
                  </div>
                )}

                {/* Name selector */}
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Your name *</label>
                  <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select your name…</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                {/* COMPACT FORM when call is linked */}
                {linkedCall ? (
                  <div className="border border-blue-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-900 bg-opacity-20 border-b border-blue-800">
                      <div>
                        <span className="text-sm font-medium text-blue-400">{linkedCall.application_id}</span>
                        <span className="text-xs text-gray-400 ml-2">·</span>
                        <span className="text-xs text-gray-300 ml-2">{linkedCall.dealer_name}</span>
                        <span className="text-xs text-gray-500 ml-2">· {formatCurrency(parseAmount(linkedCall.buyer_final))} · {linkedCall.state}</span>
                      </div>
                      <button onClick={clearLinkedCall} className="text-gray-500 hover:text-gray-300 transition">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Customer name <span className="text-gray-600 normal-case">(optional)</span></label>
                          <input type="text" value={form.customerName}
                            onChange={e => setForm({ ...form, customerName: e.target.value })}
                            placeholder="Leave blank if unknown"
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">FU Status *</label>
                          <select value={form.fuStatus} onChange={e => setForm({ ...form, fuStatus: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button onClick={handleSubmit} disabled={submitting}
                            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition">
                            {submitting ? 'Saving…' : 'Log Deal'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* FULL FORM */
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">App ID *</label>
                        <input type="text" value={form.appId} onChange={e => setForm({ ...form, appId: e.target.value })}
                          placeholder="e.g. DTBFE001"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Dealer *</label>
                        <input type="text" value={form.dealerName} onChange={e => setForm({ ...form, dealerName: e.target.value })}
                          placeholder="Dealer name"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Customer *</label>
                        <input type="text" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
                          placeholder="Customer name"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Amount *</label>
                        <input type="text" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                          placeholder="$0"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">State *</label>
                        <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
                          placeholder="IL" maxLength={2}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">FU Status *</label>
                        <select value={form.fuStatus} onChange={e => setForm({ ...form, fuStatus: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                          {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col justify-end">
                        <button onClick={handleSubmit} disabled={submitting}
                          className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition">
                          {submitting ? 'Saving…' : 'Add Deal'}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Counts toward today's team goal. Resets at midnight.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
              <span className="text-base">🏆</span>
              <p className="text-sm font-semibold text-gray-200">Today's Rankings</p>
            </div>
            <div className="divide-y divide-gray-700">
              {leaderboard.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">No entries yet today</p>
              ) : leaderboard.map((rep, idx) => {
                const m = medal(idx);
                const isMe = rep.id === selectedUser;
                return (
                  <div key={rep.id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-blue-900 bg-opacity-20' : ''}`}>
                    <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-sm">
                      {m || <span className="text-xs text-gray-400 font-medium">{idx + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isMe ? 'text-blue-300' : 'text-gray-200'}`}>
                        {rep.name}{isMe && <span className="ml-1 text-xs text-blue-400 font-normal">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {rep.amount > 0 ? formatCurrency(rep.amount) : <span className="italic">no deals yet</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xl font-bold leading-none ${rep.dealCount > 0 ? 'text-green-400' : 'text-gray-600'}`}>{rep.dealCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">deals</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* TODAY'S ENTRIES */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-200">Today's entries</h2>
            <span className="text-xs text-gray-500">{combinedEntries.length} total</span>
          </div>

          {loading ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-500 text-sm">Loading…</div>
          ) : combinedEntries.length === 0 ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-10 text-center">
              <p className="text-sm text-gray-400">No deals logged yet today.</p>
              <p className="text-xs text-gray-500 mt-1">Be the first to log one above.</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="w-8 px-3 py-3"></th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">App ID</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Dealer</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">By</th>
                      <th className="w-8 px-3 py-3"></th>
                      <th className="w-16 px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {combinedEntries.map(entry => {
                      const isExpanded = expandedRows.has(entry.id);
                      const isEditing = editingDeal === entry.id;
                      const notes = entry.source === 'manual' ? (dealNotes[entry.id] || []) : [];
                      const manualDeal = entry.source === 'manual' ? todayDeals.find(d => d.id === entry.id) : null;

                      return (
                        <>
                          <tr key={entry.id}
                            className={`hover:bg-gray-750 transition-colors ${!isEditing && entry.source === 'manual' ? 'cursor-pointer' : ''}`}
                            onClick={() => { if (!isEditing && entry.source === 'manual') toggleRow(entry.id); }}>

                            <td className="px-3 py-3 text-center">
                              {entry.source === 'manual' && (isExpanded
                                ? <ChevronDown className="w-4 h-4 text-blue-400 mx-auto" />
                                : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />)}
                            </td>

                            <td className="px-3 py-3 text-sm text-blue-400 font-medium">{entry.appId}</td>

                            {/* Dealer — click to open popup */}
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <button onClick={() => openDealerPopup(entry.dealerName)}
                                className="text-sm text-left hover:text-blue-300 transition text-gray-200 max-w-[150px] truncate"
                                title={`View all calls for ${entry.dealerName}`}>
                                {entry.dealerName}
                              </button>
                            </td>

                            <td className="px-3 py-3 text-sm text-gray-400">{entry.customerName}</td>

                            {/* Amount */}
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              {isEditing ? (
                                <input value={editAmount} onChange={e => setEditAmount(e.target.value)} className={`${inputCls} w-24`} />
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold text-gray-100">{formatCurrency(parseAmount(entry.amount))}</span>
                                  <button onClick={() => startEditing(entry)} className="text-gray-600 hover:text-gray-400 transition">
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              {isEditing && entry.source === 'manual'
                                ? <input value={editState} onChange={e => setEditState(e.target.value.toUpperCase())} maxLength={2} className={`${inputCls} w-14`} />
                                : <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">{entry.state}</span>}
                            </td>

                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              {isEditing
                                ? <select value={editFuStatus} onChange={e => setEditFuStatus(e.target.value)} className={inputCls}>
                                    {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                : <span className={`px-2.5 py-1 rounded-full text-xs border ${getFuStatusStyle(entry.fuStatus)}`}>{entry.fuStatus}</span>}
                            </td>

                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                entry.source === 'call'
                                  ? 'bg-purple-900 text-purple-300 border border-purple-700'
                                  : 'bg-gray-700 text-gray-400 border border-gray-600'
                              }`}>
                                {entry.source === 'call' ? 'Calls' : 'Manual'}
                              </span>
                            </td>

                            <td className="px-3 py-3 text-sm text-gray-400">{entry.creditName}</td>

                            {/* Note button */}
                            <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                              {entry.source === 'manual' && (
                                <button onClick={e => toggleNotes(e, entry.id)} title="Notes"
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition ${
                                    notes.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-indigo-900 text-indigo-400 hover:bg-indigo-700 hover:text-white'
                                  }`}>
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>

                            {/* Save/Cancel/Delete */}
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleUpdateCombined(entry)} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingDeal(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                                </div>
                              ) : entry.source === 'manual' && manualDeal ? (
                                <button onClick={() => handleDeleteDeal(manualDeal)} className="text-gray-600 hover:text-red-400 transition">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : null}
                            </td>
                          </tr>

                          {isExpanded && !isEditing && entry.source === 'manual' && (
                            <tr key={`${entry.id}-exp`}>
                              <td colSpan={11} className="px-4 py-4 pl-12 bg-gray-750">
                                <div className="space-y-3 max-w-2xl">
                                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Notes ({notes.length})</p>
                                  {notes.length === 0 ? <p className="text-sm text-gray-500 italic">No notes yet.</p> : (
                                    <div className="space-y-2">
                                      {notes.map(note => (
                                        <div key={note.id} className="bg-gray-700 px-4 py-3 rounded-lg border border-gray-600">
                                          <p className="text-sm text-gray-200">{note.noteText}</p>
                                          <p className="text-xs text-gray-500 mt-1.5">{note.createdByName} · {new Date(note.createdAt).toLocaleString()}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <input type="text"
                                      placeholder={selectedUser ? 'Add a note…' : 'Select your name above to add a note…'}
                                      value={newNoteText[entry.id] || ''}
                                      onChange={e => setNewNoteText(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') handleAddNote(entry.id); }}
                                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      autoFocus />
                                    <button onClick={() => handleAddNote(entry.id)}
                                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">Save</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* DEALER POPUP */}
        {dealerPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-16 z-50 px-4"
            onClick={() => { setDealerPopup(null); setDealerPopupCalls([]); }}>
            <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-4xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-gray-100">{dealerPopup}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{dealerPopupCalls.length} call{dealerPopupCalls.length !== 1 ? 's' : ''} · press Escape to close</p>
                </div>
                <button onClick={() => { setDealerPopup(null); setDealerPopupCalls([]); }}
                  className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
              </div>
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                {dealerPopupLoading ? (
                  <div className="p-8 text-center text-gray-500 text-sm">Loading calls…</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-750 sticky top-0">
                      <tr className="border-b border-gray-700">
                        {['App ID', 'Amount', 'State', 'Date', 'Status Last', 'FU Status'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {dealerPopupCalls.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No calls found for this dealer</td></tr>
                      ) : dealerPopupCalls.map((call: any) => (
                        <tr key={call.id} className="hover:bg-gray-750 transition-colors">
                          <td className="px-4 py-3 text-sm text-blue-400 font-medium">{call.application_id}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-100">{formatCurrency(parseAmount(call.buyer_final))}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">{call.state}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{call.submitted_date}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${getStatusLastStyle(call.status_last)}`}>{call.status_last}</span>
                          </td>
                          <td className="px-4 py-3">
                            {call.fu_status
                              ? <span className={`px-2 py-0.5 rounded-full text-xs border ${getFuStatusStyle(call.fu_status)}`}>{call.fu_status}</span>
                              : <span className="text-gray-600 text-xs">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}