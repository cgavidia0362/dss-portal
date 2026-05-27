import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronRight, ChevronDown, MessageSquare, Trash2, Users, Edit2, Check, X } from 'lucide-react';

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
  dealDate: string;
  createdAt: string;
}

interface DailyDealNote {
  id: string;
  dealId: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface Call {
  id: string;
  applicationId: string;
  dealerName: string;
  buyerFinal: string;
  state: string;
  fuStatus?: string;
  assignedTo?: string;
  assignedToName?: string;
  dealDate?: Date;
  dealBy?: string;
  dealByName?: string;
}

interface DailyDealSummary {
  id: string;
  addedBy: string;
  fuStatus: string;
  dealDate: string;
  amount: string;
  state: string;
}

interface User {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
}

interface Goals {
  daily: { [repId: string]: number };
  team: number;
  weekly: number;
  monthly: number;
}

interface DailyDealsTabProps {
  currentUser: User;
  goals: Goals;
  onRefresh: () => void;
  calls?: Call[];
  todayDailyDeals?: DailyDealSummary[];
  users?: User[];
}

// Unified type for combined table
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

const FU_STATUSES = ['Deal', 'Confirmed Deal', 'Pending', 'No Answer', 'No Deal'];

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getFuStatusStyle = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('confirmed')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  if (s.includes('deal')) return 'bg-green-900 text-green-300 border-green-700';
  if (s.includes('pending')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('no answer')) return 'bg-orange-900 text-orange-300 border-orange-700';
  if (s.includes('no deal')) return 'bg-red-900 text-red-300 border-red-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

export default function DailyDealsTab({
  currentUser, goals, onRefresh,
  calls = [], users = [],
}: DailyDealsTabProps) {
  const today = getTodayString();

  const [todayDeals, setTodayDeals] = useState<DailyDeal[]>([]);
  const [dealNotes, setDealNotes] = useState<{ [dealId: string]: DailyDealNote[] }>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newNoteText, setNewNoteText] = useState<{ [dealId: string]: string }>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingDeal, setEditingDeal] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editFuStatus, setEditFuStatus] = useState('');

  // Local overrides for call entries so edits reflect immediately
  const [callOverrides, setCallOverrides] = useState<{ [id: string]: { amount?: string; fuStatus?: string } }>({});

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Call[]>([]);
  const [linkedCall, setLinkedCall] = useState<Call | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [datesWithDeals, setDatesWithDeals] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateDeals, setSelectedDateDeals] = useState<DailyDeal[]>([]);

  useEffect(() => { fetchTodayDeals(); fetchAllUsers(); }, []);
  useEffect(() => { if (showHistory) fetchDatesWithDeals(calendarYear, calendarMonth); }, [calendarYear, calendarMonth, showHistory]);

  useEffect(() => {
    const channel = supabase
      .channel('daily_deals_realtime_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_deals' }, () => {
        fetchTodayDeals();
        if (showHistory) fetchDatesWithDeals(calendarYear, calendarMonth);
        onRefresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [calendarYear, calendarMonth, showHistory]);

  const fetchTodayDeals = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('daily_deals').select('*')
        .eq('deal_date', today)
        .order('created_at', { ascending: false });
      if (err) throw err;
      if (data) {
        const formatted = data.map((d: any) => ({
          id: d.id, appId: d.app_id, dealerName: d.dealer_name,
          customerName: d.customer_name, amount: d.amount,
          state: d.state, fuStatus: d.fu_status,
          addedBy: d.added_by, addedByName: d.added_by_name,
          dealDate: d.deal_date, createdAt: d.created_at,
        }));
        setTodayDeals(formatted);
        if (formatted.length > 0) fetchNotesForDeals(formatted.map((d: DailyDeal) => d.id));
      }
    } catch (e: any) {
      setError('Failed to load deals: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    const { data } = await supabase
      .from('profiles').select('id, name, role').eq('active', true).order('name');
    if (data) setAllUsers(data.map((r: any) => ({ id: r.id, name: r.name, role: r.role })));
  };

  const fetchNotesForDeals = async (dealIds: string[]) => {
    if (!dealIds.length) return;
    const { data } = await supabase
      .from('daily_deal_notes').select('*')
      .in('deal_id', dealIds).order('created_at', { ascending: true });
    if (data) {
      const grouped: { [id: string]: DailyDealNote[] } = {};
      data.forEach((n: any) => {
        if (!grouped[n.deal_id]) grouped[n.deal_id] = [];
        grouped[n.deal_id].push({
          id: n.id, dealId: n.deal_id, noteText: n.note_text,
          createdBy: n.created_by, createdByName: n.created_by_name,
          createdAt: n.created_at,
        });
      });
      setDealNotes(grouped);
    }
  };

  const fetchDatesWithDeals = async (year: number, month: number) => {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { data } = await supabase.from('daily_deals').select('deal_date')
      .gte('deal_date', start).lte('deal_date', end);
    if (data) setDatesWithDeals(new Set(data.map((d: any) => d.deal_date)));
  };

  const fetchDealsByDate = async (dateStr: string) => {
    const { data } = await supabase.from('daily_deals').select('*')
      .eq('deal_date', dateStr).order('created_at', { ascending: false });
    if (data) setSelectedDateDeals(data.map((d: any) => ({
      id: d.id, appId: d.app_id, dealerName: d.dealer_name,
      customerName: d.customer_name, amount: d.amount,
      state: d.state, fuStatus: d.fu_status,
      addedBy: d.added_by, addedByName: d.added_by_name,
      dealDate: d.deal_date, createdAt: d.created_at,
    })));
  };

  // ── SEARCH ──────────────────────────────────────────────────────

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const results = calls.filter(c =>
      c.applicationId.toLowerCase().includes(searchQuery.toLowerCase().trim())
    ).slice(0, 5);
    setSearchResults(results);
  };

  const handleSelectCall = (call: Call) => {
    setLinkedCall(call);
    setForm(prev => ({
      ...prev,
      appId: call.applicationId,
      dealerName: call.dealerName,
      amount: call.buyerFinal || '',
      state: call.state,
      fuStatus: 'Deal',
    }));
    setSearchResults([]);
    setSearchQuery('');
  };

  const clearLinkedCall = () => {
    setLinkedCall(null);
    setSearchQuery('');
    setSearchResults([]);
    setForm(prev => ({ ...prev, appId: '', dealerName: '', amount: '', state: '' }));
  };

  // ── HANDLERS ────────────────────────────────────────────────────

  const handleAddDeal = async () => {
    if (!form.appId || !form.dealerName || !form.customerName || !form.amount || !form.state) {
      setFormError('All fields are required'); return;
    }
    try {
      setFormError('');
      const { error: err } = await supabase.from('daily_deals').insert({
        app_id: form.appId.trim(), dealer_name: form.dealerName.trim(),
        customer_name: form.customerName.trim(), amount: form.amount.trim(),
        state: form.state.trim().toUpperCase(), fu_status: form.fuStatus,
        added_by: currentUser.id, added_by_name: currentUser.name, deal_date: today,
      });
      if (err) throw err;

      if (linkedCall) {
        await supabase.from('calls').update({
          fu_status: form.fuStatus,
          deal_by: currentUser.id,
          deal_by_name: currentUser.name,
          deal_date: today,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedCall.id);
        setLinkedCall(null);
      }

      setSuccess('Deal added!');
      setTimeout(() => setSuccess(''), 3000);
      setForm({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });
    } catch (e: any) {
      setFormError('Failed to add deal: ' + e.message);
    }
  };

  const handleUpdateCombined = async (entry: CombinedEntry) => {
    try {
      if (entry.source === 'manual') {
        const { error: err } = await supabase.from('daily_deals')
          .update({ amount: editAmount.trim(), fu_status: editFuStatus })
          .eq('id', entry.id);
        if (err) throw err;
        await fetchTodayDeals();
      } else {
        const { error: err } = await supabase.from('calls')
          .update({
            buyer_final: editAmount.trim(),
            fu_status: editFuStatus,
            updated_at: new Date().toISOString(),
          }).eq('id', entry.id);
        if (err) throw err;
        // Update local override for immediate UI feedback
        setCallOverrides(prev => ({
          ...prev,
          [entry.id]: { amount: editAmount.trim(), fuStatus: editFuStatus },
        }));
      }
      setEditingDeal(null);
      onRefresh();
    } catch (e: any) {
      setError('Failed to update: ' + e.message);
    }
  };

  const handleDeleteDeal = async (deal: DailyDeal) => {
    const canDelete = currentUser.role === 'admin' || currentUser.role === 'manager' || deal.addedBy === currentUser.id;
    if (!canDelete) { setError('You can only delete your own entries.'); return; }
    if (!confirm('Delete this deal entry?')) return;
    const { error: err } = await supabase.from('daily_deals').delete().eq('id', deal.id);
    if (err) setError('Failed to delete: ' + err.message);
  };

  const handleAddNote = async (dealId: string) => {
    const text = newNoteText[dealId]?.trim();
    if (!text) return;
    const { error: err } = await supabase.from('daily_deal_notes').insert({
      deal_id: dealId, note_text: text,
      created_by: currentUser.id, created_by_name: currentUser.name,
    });
    if (err) return;
    setNewNoteText(prev => ({ ...prev, [dealId]: '' }));
    await fetchNotesForDeals(todayDeals.map(d => d.id));
  };

  const toggleRow = (id: string) => {
    if (editingDeal === id) return;
    const n = new Set(expandedRows);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedRows(n);
  };

  const toggleNotes = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (editingDeal === id) return;
    const n = new Set(expandedRows);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedRows(n);
  };

  const handleCalendarClick = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStr >= today || !datesWithDeals.has(dateStr)) return;
    if (selectedDate === dateStr) { setSelectedDate(null); setSelectedDateDeals([]); return; }
    setSelectedDate(dateStr);
    fetchDealsByDate(dateStr);
  };

  const isToday = (date: Date) => {
    const t = new Date();
    return date.getDate() === t.getDate() &&
      date.getMonth() === t.getMonth() &&
      date.getFullYear() === t.getFullYear();
  };

  // ── KPIs ─────────────────────────────────────────────────────────

  const ddDealCount = todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').length;
  const ddTotalAmount = todayDeals
    .filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal')
    .reduce((s, d) => s + parseAmount(d.amount), 0);

  const callDealsToday = calls.filter(c => {
    if (c.fuStatus !== 'Deal' && c.fuStatus !== 'Confirmed Deal') return false;
    if (!c.dealDate) return false;
    return isToday(new Date(c.dealDate));
  });

  const callDealCount = callDealsToday.length;
  const callDealAmount = callDealsToday.reduce((s, c) => s + parseAmount(c.buyerFinal || '0'), 0);

  const totalDealCount = ddDealCount + callDealCount;
  const totalAmount = ddTotalAmount + callDealAmount;
  const goalPct = goals.team > 0 ? Math.min((totalDealCount / goals.team) * 100, 100) : 0;

  const activeRepNames = new Set([
    ...todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').map(d => d.addedByName),
    ...callDealsToday.filter(c => c.assignedToName).map(c => c.assignedToName as string),
  ]);
  const activeReps = activeRepNames.size;

  // ── COMBINED TODAY'S ENTRIES ─────────────────────────────────────

  const combinedEntries: CombinedEntry[] = [
    ...todayDeals.map(d => ({
      id: d.id,
      source: 'manual' as const,
      appId: d.appId,
      dealerName: d.dealerName,
      customerName: d.customerName,
      amount: d.amount,
      state: d.state,
      fuStatus: d.fuStatus,
      creditName: d.addedByName,
      creditId: d.addedBy,
      sortTime: new Date(d.createdAt).getTime(),
    })),
    ...callDealsToday.map(c => ({
      id: c.id,
      source: 'call' as const,
      appId: c.applicationId,
      dealerName: c.dealerName,
      customerName: '—',
      amount: callOverrides[c.id]?.amount ?? (c.buyerFinal || '0'),
      state: c.state,
      fuStatus: callOverrides[c.id]?.fuStatus ?? (c.fuStatus || 'Deal'),
      creditName: c.dealByName || c.assignedToName || 'Unknown',
      creditId: c.dealBy || c.assignedTo,
      sortTime: c.dealDate ? new Date(c.dealDate).getTime() : Date.now(),
    })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // ── LEADERBOARD ──────────────────────────────────────────────────

  const leaderboard = (() => {
    const nameMap: { [id: string]: string } = {};
    const roleMap: { [id: string]: string } = {};
    allUsers.forEach(u => { nameMap[u.id] = u.name; roleMap[u.id] = u.role; });
    users.forEach(u => { nameMap[u.id] = u.name; roleMap[u.id] = u.role; });

    const repMap: { [id: string]: { name: string; dealCount: number; amount: number; role: string } } = {};
    Object.entries(nameMap).forEach(([id, name]) => {
      repMap[id] = { name, dealCount: 0, amount: 0, role: roleMap[id] || 'rep' };
    });

    todayDeals.forEach(d => {
      if (d.fuStatus !== 'Deal' && d.fuStatus !== 'Confirmed Deal') return;
      if (!repMap[d.addedBy]) {
        repMap[d.addedBy] = { name: d.addedByName, dealCount: 0, amount: 0, role: roleMap[d.addedBy] || 'rep' };
      }
      repMap[d.addedBy].dealCount++;
      repMap[d.addedBy].amount += parseAmount(d.amount);
    });

    callDealsToday.forEach(c => {
      const creditId = c.dealBy || c.assignedTo;
      const creditName = c.dealByName || c.assignedToName || nameMap[creditId || ''] || 'Unknown';
      if (!creditId) return;
      const role = roleMap[creditId] || 'rep';
      if (!repMap[creditId]) {
        repMap[creditId] = { name: creditName, dealCount: 0, amount: 0, role };
      }
      repMap[creditId].dealCount++;
      repMap[creditId].amount += parseAmount(c.buyerFinal || '0');
    });

    return Object.entries(repMap)
      .map(([id, data]) => ({ id, ...data }))
      .filter(r => r.dealCount > 0 || r.role === 'rep')
      .sort((a, b) => b.dealCount - a.dealCount || b.amount - a.amount);
  })();

  // Calendar
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div className="space-y-5">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Daily Deals</h2>
          <p className="text-sm text-gray-400 mt-0.5">{formatDateLabel(today)} &nbsp;·&nbsp; Resets at midnight</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowHistory(true); fetchDatesWithDeals(calendarYear, calendarMonth); }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition"
          >
            📅 View History
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText('https://dss-portal-delta.vercel.app/deals');
              alert('Link copied to clipboard!');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded-lg text-sm transition"
          >
            🔗 Share Link
          </button>
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
          >
            + Log Deal
          </button>
        </div>
      </div>

      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-lg text-sm">{success}</div>}

      {/* TOP ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">

        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-1.5">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Deals Today</p>
              <p className="text-3xl font-bold text-green-400 leading-none">{totalDealCount}</p>
              {callDealCount > 0 && <p className="text-xs text-gray-500">+{callDealCount} from calls</p>}
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-1.5">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Total Amount</p>
              <p className="text-xl font-bold text-green-400 leading-none">{formatCurrency(totalAmount)}</p>
              {callDealAmount > 0 && <p className="text-xs text-gray-500">+{formatCurrency(callDealAmount)} from calls</p>}
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <p className="text-xs text-gray-400 uppercase tracking-wider">Team Goal</p>
              </div>
              <p className="text-xl font-bold text-cyan-400 leading-none">
                {totalDealCount} <span className="text-sm font-normal text-gray-500">/ {goals.team}</span>
              </p>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${goalPct}%` }} />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-1.5">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Active Reps</p>
              <p className="text-3xl font-bold text-gray-100 leading-none">{activeReps}</p>
            </div>
          </div>

          {/* Form */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <button onClick={() => setShowForm(f => !f)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-700 transition border-b border-gray-700">
              <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <span className="text-green-400 text-base">+</span> Log a deal
              </span>
              <span className="text-gray-400">{showForm ? '▲' : '▼'}</span>
            </button>
            {showForm && (
              <div className="p-5">
                {formError && <div className="bg-red-900 border border-red-700 text-red-200 px-3 py-2 rounded text-sm mb-4">{formError}</div>}

                {/* Search */}
                <div className="bg-gray-750 border border-gray-600 rounded-lg p-3 mb-4">
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Search existing app (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults([]); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                      placeholder="Type App ID to search…"
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={handleSearch}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
                      Search
                    </button>
                    {linkedCall && (
                      <button onClick={clearLinkedCall}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded-lg text-sm transition">
                        Clear
                      </button>
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {searchResults.map(call => (
                        <div key={call.id} className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded-lg border border-gray-600">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-blue-400 font-medium">{call.applicationId}</span>
                            <span className="text-xs text-gray-300">{call.dealerName}</span>
                            <span className="text-xs text-gray-500">{call.state}</span>
                            <span className="text-xs text-gray-400">${parseAmount(call.buyerFinal).toLocaleString()}</span>
                          </div>
                          <button onClick={() => handleSelectCall(call)}
                            className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                            Use this app →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.length === 0 && searchQuery && !linkedCall && (
                    <p className="text-xs text-gray-500 mt-2">No match found — fill in the details manually below.</p>
                  )}
                  {linkedCall && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-green-400">✓ Linked to existing call:</span>
                      <span className="text-xs text-blue-400 font-medium">{linkedCall.applicationId}</span>
                      <span className="text-xs text-gray-400">— {linkedCall.dealerName}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">App ID *</label>
                    <input type="text" value={form.appId} onChange={e => setForm({ ...form, appId: e.target.value })}
                      placeholder="e.g. DTBFE001"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Dealer *</label>
                    <input type="text" value={form.dealerName} onChange={e => setForm({ ...form, dealerName: e.target.value })}
                      placeholder="Dealer name"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Customer *</label>
                    <input type="text" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
                      placeholder="Customer name"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Amount *</label>
                    <input type="text" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                      placeholder="$0"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">State *</label>
                    <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
                      placeholder="IL" maxLength={2}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">FU Status *</label>
                    <select value={form.fuStatus} onChange={e => setForm({ ...form, fuStatus: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleAddDeal}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">
                      Add Deal
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">Counts toward today's goal only. Expand each row to add notes.</p>
              </div>
            )}
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
            ) : (
              leaderboard.map((rep, idx) => {
                const m = medal(idx);
                const isMe = rep.id === currentUser.id;
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
                      <p className={`text-xl font-bold leading-none ${rep.dealCount > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                        {rep.dealCount}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">deals</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* TODAY'S ENTRIES — combined */}
      <div>
        <h3 className="text-base font-semibold text-gray-100 mb-3">
          Today's entries
          <span className="ml-2 text-sm font-normal text-gray-400">({combinedEntries.length} total)</span>
        </h3>

        {loading ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-400">Loading...</div>
        ) : combinedEntries.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-10 text-center">
            <p className="text-base font-medium text-gray-400">No deals logged yet today.</p>
            <p className="text-sm text-gray-500 mt-1">Use the form above to log the first deal.</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="w-10 px-4 py-3"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">App ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Dealer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">By</th>
                  <th className="w-10 px-4 py-3"></th>
                  <th className="w-10 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {combinedEntries.map(entry => {
                  const isExpanded = expandedRows.has(entry.id);
                  const isEditing = editingDeal === entry.id;
                  const notes = entry.source === 'manual' ? (dealNotes[entry.id] || []) : [];
                  const manualDeal = entry.source === 'manual' ? todayDeals.find(d => d.id === entry.id) : null;
                  const canDelete = entry.source === 'manual' && manualDeal &&
                    (currentUser.role === 'admin' || currentUser.role === 'manager' || manualDeal.addedBy === currentUser.id);

                  return (
                    <>
                      <tr key={entry.id}
                        className={`hover:bg-gray-750 transition-colors ${!isEditing ? 'cursor-pointer' : ''}`}
                        onClick={() => { if (!isEditing && entry.source === 'manual') toggleRow(entry.id); }}>
                        <td className="px-4 py-3 text-center">
                          {entry.source === 'manual' && (
                            isExpanded
                              ? <ChevronDown className="w-4 h-4 text-blue-400 mx-auto" />
                              : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-blue-400 font-medium">{entry.appId}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{entry.dealerName}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{entry.customerName}</td>

                        {/* Amount — editable */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {isEditing ? (
                            <input type="text" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                              className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none"
                              autoFocus />
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-gray-100">{entry.amount}</span>
                              <button onClick={() => { setEditingDeal(entry.id); setEditAmount(entry.amount); setEditFuStatus(entry.fuStatus); }}
                                className="text-gray-600 hover:text-gray-400 transition">
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">{entry.state}</span>
                        </td>

                        {/* FU Status — editable */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {isEditing ? (
                            <select value={editFuStatus} onChange={e => setEditFuStatus(e.target.value)}
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none">
                              {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-xs border ${getFuStatusStyle(entry.fuStatus)}`}>
                              {entry.fuStatus}
                            </span>
                          )}
                        </td>

                        {/* Source badge */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            entry.source === 'call'
                              ? 'bg-purple-900 text-purple-300 border border-purple-700'
                              : 'bg-gray-700 text-gray-400 border border-gray-600'
                          }`}>
                            {entry.source === 'call' ? 'Calls' : 'Manual'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-400">{entry.creditName}</td>

                        {/* Note button — manual entries only */}
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          {entry.source === 'manual' && (
                            <button
                              onClick={e => toggleNotes(e, entry.id)}
                              title="Add note"
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition ${
                                notes.length > 0
                                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                                  : 'bg-indigo-900 text-indigo-400 hover:bg-indigo-700 hover:text-white'
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>

                        {/* Save/Cancel or Delete */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleUpdateCombined(entry)} className="text-green-400 hover:text-green-300">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingDeal(null)} className="text-red-400 hover:text-red-300">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            canDelete && manualDeal && (
                              <button onClick={() => handleDeleteDeal(manualDeal)} className="text-gray-600 hover:text-red-400 transition">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </td>
                      </tr>

                      {/* Expanded notes — manual entries only */}
                      {isExpanded && !isEditing && entry.source === 'manual' && (
                        <tr key={`${entry.id}-expanded`}>
                          <td colSpan={11} className="px-4 py-4 pl-14 bg-gray-750">
                            <div className="space-y-3 max-w-2xl">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Notes ({notes.length})
                              </p>
                              {notes.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">No notes yet.</p>
                              ) : (
                                <div className="space-y-2">
                                  {notes.map(note => (
                                    <div key={note.id} className="bg-gray-700 px-4 py-3 rounded-lg border border-gray-600">
                                      <p className="text-sm text-gray-200">{note.noteText}</p>
                                      <p className="text-xs text-gray-500 mt-1.5">
                                        {note.createdByName} · {new Date(note.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <input type="text" placeholder="Add a note..."
                                  value={newNoteText[entry.id] || ''}
                                  onChange={e => setNewNoteText(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleAddNote(entry.id); }}
                                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  autoFocus />
                                <button onClick={() => handleAddNote(entry.id)}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
                                  Save
                                </button>
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
        )}
      </div>

      {/* HISTORY MODAL */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-16 z-50 px-4"
          onClick={() => { setShowHistory(false); setSelectedDate(null); setSelectedDateDeals([]); }}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100">Deal History</h3>
              <button onClick={() => { setShowHistory(false); setSelectedDate(null); setSelectedDateDeals([]); }}
                className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); } else setCalendarMonth(m => m - 1); }}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">‹</button>
                <span className="text-base font-medium text-gray-100">{monthNames[calendarMonth]} {calendarYear}</span>
                <button onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); } else setCalendarMonth(m => m + 1); }}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="text-center text-xs text-gray-500 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isTodayDate = dateStr === today;
                  const isFuture = dateStr > today;
                  const hasDeals = datesWithDeals.has(dateStr);
                  const isSelected = selectedDate === dateStr;
                  let cls = 'relative text-center text-sm py-2 rounded-lg transition font-normal ';
                  if (isTodayDate) cls += 'bg-blue-600 text-white font-medium';
                  else if (isFuture) cls += 'text-gray-600';
                  else if (isSelected) cls += 'bg-blue-900 border border-blue-500 text-blue-300 cursor-pointer';
                  else if (hasDeals) cls += 'bg-green-900 text-green-300 hover:bg-green-800 cursor-pointer font-medium';
                  else cls += 'text-gray-500';
                  return (
                    <div key={i} className={cls} onClick={() => handleCalendarClick(day)}>
                      {day}
                      {hasDeals && !isTodayDate && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-400 block" />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-5 mb-4 pb-4 border-b border-gray-700">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-green-400" /><span className="text-xs text-gray-400">Has entries</span></div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-xs text-gray-400">Today</span></div>
              </div>
              {selectedDate && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-200">
                      {formatDateLabel(selectedDate)} — {selectedDateDeals.length} deal{selectedDateDeals.length !== 1 ? 's' : ''}
                    </p>
                    <button onClick={() => { setSelectedDate(null); setSelectedDateDeals([]); }} className="text-xs text-gray-400 hover:text-gray-200">clear</button>
                  </div>
                  <div className="rounded-lg border border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-700">
                        <tr>
                          {['App ID','Dealer','Customer','Amount','State','Status','By'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700 bg-gray-800">
                        {selectedDateDeals.map(deal => (
                          <tr key={deal.id} className="hover:bg-gray-750">
                            <td className="px-3 py-2.5 text-blue-400 font-medium">{deal.appId}</td>
                            <td className="px-3 py-2.5 text-gray-200">{deal.dealerName}</td>
                            <td className="px-3 py-2.5 text-gray-200">{deal.customerName}</td>
                            <td className="px-3 py-2.5 font-medium text-gray-100">{deal.amount}</td>
                            <td className="px-3 py-2.5"><span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">{deal.state}</span></td>
                            <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs border ${getFuStatusStyle(deal.fuStatus)}`}>{deal.fuStatus}</span></td>
                            <td className="px-3 py-2.5 text-gray-400">{deal.addedByName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}