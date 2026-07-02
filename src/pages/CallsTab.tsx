import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronRight, ArrowUpDown, MessageSquare, Eye, EyeOff, ChevronLeft, ChevronRight as ChevronRightIcon, Edit2, Check, X, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import NoteItem from '../components/NoteItem';

interface Call {
  id: string;
  applicationId: string;
  dealerCifNumber: string;
  dealerName: string;
  state: string;
  buyerFinal: string;
  statusLast: string;
  timestampSubmit: Date;
  submittedDate: string;
  assignedTo?: string;
  assignedToName?: string;
  fuStatus?: 'Deal' | 'Confirmed Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates' | 'Follow Up';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
  createdAt?: Date;
  dealDate?: Date;
  isDuplicate?: boolean;
  dealBy?: string;
  dealByName?: string;
  customerName?: string;
}

interface CallNote {
  id: string;
  callId: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  active: boolean;
  allowedStatuses: string[];
  state?: string;
}

interface DailyDealSummary {
  id: string;
  addedBy: string;
  fuStatus: string;
  dealDate: string;
  amount: string;
  state: string;
}

interface CallsTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  calls: Call[];
  setCalls: React.Dispatch<React.SetStateAction<Call[]>>;
  notes: CallNote[];
  setNotes: React.Dispatch<React.SetStateAction<CallNote[]>>;
  dailyGoal: number;
  teamGoal: number;
  currentUser?: User;
  todayDailyDeals?: DailyDealSummary[];
  users?: User[];
}

type SortField = 'applicationId' | 'dealerName' | 'state' | 'submittedDate' | 'fuStatus' | 'buyerFinal' | 'statusLast' | 'customerName' | null;
type SortOrder = 'asc' | 'desc' | null;

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

export default function CallsTab({
  currentUserId, currentUserRole, calls, setCalls, notes, setNotes,
  dailyGoal, teamGoal, currentUser, todayDailyDeals, users,
}: CallsTabProps) {

  const [searchQuery, setSearchQuery] = useState('');
  const [filterFuStatuses, setFilterFuStatuses] = useState<Set<string>>(new Set(['No Call', 'Pending', 'Follow Up']));
  const [filterState, setFilterState] = useState('');
  const [filterRep, setFilterRep] = useState('');
  const [filterNewOnly, setFilterNewOnly] = useState(false);
  const [filterStatusLast, setFilterStatusLast] = useState<Set<string>>(new Set());
  const [dealerFilter, setDealerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newNoteText, setNewNoteText] = useState<{ [callId: string]: string }>({});
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [stateGoals, setStateGoals] = useState<{ [state: string]: number }>({});
  const [editingStatusLast, setEditingStatusLast] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [tempStatusLast, setTempStatusLast] = useState('');
  const [tempAmount, setTempAmount] = useState('');
  const itemsPerPage = 50;

  const allStatusLastOptions = [
    'Accepted', 'Approved', 'Approval', 'Counter', 'Denial', 'Declined',
    'Pending Approval', 'Document Received', 'Funded', 'Funding Pending',
    'New Application', 'Incomplete', 'Withdrawn', 'Cancelled',
  ];

  const fuStatusChips = [
    { label: 'No Call',        onCls: 'bg-teal-900 bg-opacity-40 border-teal-600 text-teal-300' },
    { label: 'Pending',        onCls: 'bg-amber-900 bg-opacity-40 border-amber-600 text-amber-300' },
    { label: 'No Answer',      onCls: 'bg-red-900 bg-opacity-40 border-red-700 text-red-300' },
    { label: 'Follow Up',      onCls: 'bg-orange-900 bg-opacity-40 border-orange-600 text-orange-300' },
    { label: 'Deal',           onCls: 'bg-green-900 bg-opacity-40 border-green-600 text-green-300' },
    { label: 'Confirmed Deal', onCls: 'bg-emerald-900 bg-opacity-40 border-emerald-600 text-emerald-300' },
    { label: 'No Deal',        onCls: 'bg-red-900 bg-opacity-40 border-red-900 text-red-400' },
    { label: 'Duplicates',     onCls: 'bg-orange-900 bg-opacity-40 border-orange-700 text-orange-300' },
    { label: 'Closed',         onCls: 'bg-gray-700 border-gray-600 text-gray-400' },
  ];

  const toggleFuStatusFilter = (label: string) => {
    setFilterFuStatuses(prev => {
      const n = new Set(prev);
      if (n.has(label)) n.delete(label); else n.add(label);
      return n;
    });
  };

  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'manager';
  const isRep = currentUserRole === 'rep' || currentUserRole === 'buying_assistant';

  useEffect(() => {
    if (currentUserRole === 'rep' && currentUser?.state) fetchRepStateGoal(currentUser.state);
  }, [currentUser?.state, currentUserRole]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingStatusLast || editingAmount) {
          setEditingStatusLast(null);
          setEditingAmount(null);
          return;
        }
        if (expandedRows.size > 0) { setExpandedRows(new Set()); return; }
        if (dealerFilter) { setDealerFilter(''); return; }
        if (filterRep) { setFilterRep(''); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingStatusLast, editingAmount, expandedRows, dealerFilter, filterRep]);

  const fetchRepStateGoal = async (stateStr: string) => {
    const stateList = stateStr.split(',').map(s => s.trim()).filter(Boolean);
    if (!stateList.length) return;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    try {
      const { data } = await supabase.from('state_goals').select('*')
        .in('state', stateList).eq('month', currentMonth).eq('year', currentYear);
      if (data) {
        const goals: { [state: string]: number } = {};
        data.forEach((d: any) => { goals[d.state] = Math.round(d.monthly_goal / d.funding_days); });
        setStateGoals(goals);
      }
    } catch { setStateGoals({}); }
  };

  const isToday = (date: Date) => {
    const t = new Date();
    return date.getDate() === t.getDate() &&
      date.getMonth() === t.getMonth() &&
      date.getFullYear() === t.getFullYear();
  };

  const isNewUpload = (call: Call): boolean => {
    if (!call.createdAt) return false;
    return isToday(new Date(call.createdAt));
  };

  const formatShortDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
    return dateStr;
  };

  const formatLastActivity = (call: Call): { text: string; isToday: boolean } => {
    if (!call.updatedAt) return { text: '—', isToday: false };
    if (call.createdAt) {
      const diffMs = Math.abs(call.updatedAt.getTime() - new Date(call.createdAt).getTime());
      if (diffMs < 5 * 60 * 1000) return { text: '—', isToday: false };
    }
    const date = new Date(call.updatedAt);
    const todayFlag = isToday(date);
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(' AM', 'am').replace(' PM', 'pm');
    if (todayFlag) return { text: `Today ${timeStr}`, isToday: true };
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { text: dateStr, isToday: false };
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCalls(prev => prev.map(call => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (call.statusLast === 'Accepted' && call.fuStatus === 'Deal' && call.dealDate && call.dealDate < sevenDaysAgo)
          return { ...call, fuStatus: 'Pending', dealDate: undefined };
        return call;
      }));
    }, 60000);
    return () => clearInterval(interval);
  }, [setCalls]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else { setSortField(null); setSortOrder(null); }
    } else { setSortField(field); setSortOrder('asc'); }
  };

  const getStatusLastStyle = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('approved') || s === 'approval') return 'bg-green-900 text-green-300 border-green-700';
    if (s === 'pending approval' || s.includes('pending approval')) return 'bg-purple-900 text-purple-300 border-purple-700';
    if (s.includes('counter')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
    if (s.includes('denial') || s.includes('declined')) return 'bg-red-900 text-red-300 border-red-700';
    if (s.includes('accepted')) return 'bg-blue-900 text-blue-300 border-blue-700';
    if (s.includes('pending')) return 'bg-orange-900 text-orange-300 border-orange-700';
    if (s.includes('document received')) return 'bg-purple-900 text-purple-300 border-purple-700';
    if (s.includes('funded') || s.includes('funding')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
    if (s.includes('new application')) return 'bg-cyan-900 text-cyan-300 border-cyan-700';
    return 'bg-gray-700 text-gray-300 border-gray-600';
  };

  const roleFilteredCalls = calls.filter(c =>
    isRep ? c.assignedTo === currentUserId : true
  );
  const uniqueStatusLast = Array.from(new Set(roleFilteredCalls.map(c => c.statusLast).filter(Boolean))).sort();
  const uniqueStates = Array.from(new Set(roleFilteredCalls.map(c => c.state))).sort();

  const uniqueReps = (() => {
    const repMap: { [id: string]: string } = {};
    calls.forEach(c => { if (c.assignedTo && c.assignedToName) repMap[c.assignedTo] = c.assignedToName; });
    (users || []).forEach(u => { repMap[u.id] = u.name; });
    return Object.entries(repMap).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const selectedRepName = uniqueReps.find(r => r.id === filterRep)?.name || '';
  const repCallCount = filterRep ? calls.filter(c => c.assignedTo === filterRep).length : 0;

  const toggleStatusLastFilter = (status: string) => {
    const n = new Set(filterStatusLast);
    if (n.has(status)) n.delete(status); else n.add(status);
    setFilterStatusLast(n);
  };

  const filteredCalls = calls.filter(call => {
    if (isRep && call.assignedTo !== currentUserId) return false;
    if (searchQuery &&
      !call.applicationId.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !call.dealerName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !call.state.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(call.customerName || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterState && call.state !== filterState) return false;
    if (filterRep && call.assignedTo !== filterRep) return false;
    if (dealerFilter && call.dealerName !== dealerFilter) return false;
    if (filterNewOnly && !dealerFilter && !isNewUpload(call)) return false;
    if (filterStatusLast.size > 0 && !filterStatusLast.has(call.statusLast)) return false;
    if (dateFrom && new Date(call.submittedDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(call.submittedDate) > new Date(dateTo)) return false;

    const fuKey = call.fuStatus || 'No Call';

    if (isRep) {
      // My Queue: unworked calls always show; worked calls show only if their FU chip is selected
      if (fuKey !== 'No Call' && !filterFuStatuses.has(fuKey)) return false;
    } else {
      // Admin/Manager: if FU chips selected, filter to those only
      if (filterFuStatuses.size > 0 && !filterFuStatuses.has(fuKey)) return false;
      // showCompleted toggle for admins
      const isCompleted = call.fuStatus === 'No Deal' || call.fuStatus === 'Closed' || call.fuStatus === 'Duplicates';
      const explicitlyFiltering = filterFuStatuses.has('No Deal') || filterFuStatuses.has('Closed') || filterFuStatuses.has('Duplicates');
      if (!showCompleted && isCompleted && !explicitlyFiltering) return false;
    }

    return true;
  });

  // Split for My Queue divider (reps only)
  const unworkedCalls = isRep ? filteredCalls.filter(c => !c.fuStatus) : [];
  const filteredInCalls = isRep ? filteredCalls.filter(c => !!c.fuStatus) : [];

  const sortedCalls = [...filteredCalls].sort((a, b) => {
    // Reps: unworked calls always sort to top
    if (isRep) {
      const aUnworked = !a.fuStatus ? 0 : 1;
      const bUnworked = !b.fuStatus ? 0 : 1;
      if (aUnworked !== bUnworked) return aUnworked - bUnworked;
    }
    if (!sortField || !sortOrder) return 0;
    let aVal: any = a[sortField], bVal: any = b[sortField];
    if (sortField === 'submittedDate') { aVal = new Date(aVal).getTime(); bVal = new Date(bVal).getTime(); }
    if (sortField === 'buyerFinal') { aVal = parseAmount(aVal); bVal = parseAmount(bVal); }
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedCalls.length / itemsPerPage);
  const paginatedCalls = sortedCalls.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterFuStatuses, filterState, filterRep, filterNewOnly, filterStatusLast, dealerFilter, dateFrom, dateTo, showCompleted]);

  const csvDealsToday = filteredCalls.filter(c =>
    (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && c.dealDate && isToday(new Date(c.dealDate))
  ).length;
  const myDailyDealsToday = (todayDailyDeals || []).filter(d =>
    (d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal') &&
    (currentUserRole !== 'rep' || d.addedBy === currentUserId)
  ).length;
  const dealsToday = csvDealsToday + myDailyDealsToday;
  const csvTeamDealsToday = calls.filter(c =>
    (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && c.dealDate && isToday(new Date(c.dealDate))
  ).length;
  const allDailyDealsToday = (todayDailyDeals || []).filter(d =>
    d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal'
  ).length;
  const teamDealsToday = csvTeamDealsToday + allDailyDealsToday;
  const goalPct = dailyGoal > 0 ? Math.min((dealsToday / dailyGoal) * 100, 100) : 0;
  const teamGoalPct = teamGoal > 0 ? Math.min((teamDealsToday / teamGoal) * 100, 100) : 0;

  const repStates = currentUser?.state
    ? currentUser.state.split(',').map(s => s.trim()).filter(Boolean) : [];

  const getStateDealsToday = (state: string) => {
    const csvDeals = calls.filter(c =>
      c.state === state && c.assignedTo === currentUserId &&
      (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') &&
      c.dealDate && isToday(new Date(c.dealDate))
    ).length;
    const dailyDeals = (todayDailyDeals || []).filter(d =>
      d.addedBy === currentUserId && d.state === state &&
      (d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal')
    ).length;
    return csvDeals + dailyDeals;
  };

  const completedCount = calls.filter(c => {
    if (isRep && c.assignedTo !== currentUserId) return false;
    return c.fuStatus === 'No Deal' || c.fuStatus === 'Closed' || c.fuStatus === 'Duplicates';
  }).length;

  const noCallCount = filteredCalls.filter(c => !c.fuStatus).length;
  const pendingCount = filteredCalls.filter(c => c.fuStatus === 'Pending').length;
  const noAnswerCount = filteredCalls.filter(c => c.fuStatus === 'No Answer').length;
  const dealTotalCount = filteredCalls.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal').length;
  const noDealCount = filteredCalls.filter(c => c.fuStatus === 'No Deal').length;
  const breakdownTotal = filteredCalls.length || 1;
  const pct = (n: number) => `${Math.round((n / breakdownTotal) * 100)}%`;

  const leaderboard = (() => {
    const nameMap: { [id: string]: string } = {};
    calls.forEach(c => { if (c.assignedTo && c.assignedToName) nameMap[c.assignedTo] = c.assignedToName; });
    (users || []).forEach(u => { nameMap[u.id] = u.name; });
    if (currentUser) nameMap[currentUser.id] = currentUser.name;
    const repMap: { [id: string]: { name: string; dealCount: number; amount: number; isRep: boolean } } = {};
    Object.entries(nameMap).forEach(([id, name]) => {
      const userObj = (users || []).find(u => u.id === id);
      repMap[id] = { name, dealCount: 0, amount: 0, isRep: userObj?.role === 'rep' };
    });
    calls.forEach(c => {
      if (c.fuStatus !== 'Deal' && c.fuStatus !== 'Confirmed Deal') return;
      if (!c.dealDate || !isToday(new Date(c.dealDate))) return;
      const creditId = c.dealBy || c.assignedTo;
      const creditName = c.dealByName || c.assignedToName;
      if (!creditId || !creditName) return;
      if (!repMap[creditId]) repMap[creditId] = { name: creditName, dealCount: 0, amount: 0, isRep: false };
      repMap[creditId].dealCount++;
      repMap[creditId].amount += parseAmount(c.buyerFinal);
    });
    (todayDailyDeals || []).forEach(d => {
      if (d.fuStatus !== 'Deal' && d.fuStatus !== 'Confirmed Deal') return;
      if (!repMap[d.addedBy]) repMap[d.addedBy] = { name: nameMap[d.addedBy] || 'Unknown', dealCount: 0, amount: 0, isRep: false };
      repMap[d.addedBy].dealCount++;
      repMap[d.addedBy].amount += parseAmount(d.amount || '0');
    });
    return Object.entries(repMap).map(([id, data]) => ({ id, ...data }))
      .filter(r => r.isRep || r.dealCount > 0)
      .sort((a, b) => b.dealCount - a.dealCount || b.amount - a.amount);
  })();

  // ── HANDLERS ────────────────────────────────────────────────────

  const handleStatusChange = async (callId: string, newStatus: Call['fuStatus']) => {
    const existingDealDate = calls.find(c => c.id === callId)?.dealDate;
    const dealDate = newStatus === 'Deal' ? new Date() : existingDealDate;
    setCalls(prev => prev.map(c => c.id === callId
      ? { ...c, fuStatus: newStatus, updatedAt: new Date(), dealDate,
          dealBy: newStatus === 'Deal' ? currentUserId : undefined,
          dealByName: newStatus === 'Deal' ? (currentUser?.name || undefined) : undefined }
      : c
    ));
    await supabase.from('calls').update({
      fu_status: newStatus || null,
      deal_date: newStatus === 'Deal' ? new Date().toISOString() : (existingDealDate ? new Date(existingDealDate).toISOString() : null),
      deal_by: newStatus === 'Deal' ? currentUserId : null,
      deal_by_name: newStatus === 'Deal' ? (currentUser?.name || null) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', callId);
  };

  const handleSaveStatusLast = async (callId: string) => {
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, statusLast: tempStatusLast, updatedAt: new Date() } : c));
    setEditingStatusLast(null);
    await supabase.from('calls').update({
      status_last: tempStatusLast,
      updated_at: new Date().toISOString(),
    }).eq('id', callId);
  };

  const handleSaveAmount = async (callId: string) => {
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, buyerFinal: tempAmount, updatedAt: new Date() } : c));
    setEditingAmount(null);
    await supabase.from('calls').update({
      buyer_final: tempAmount,
      updated_at: new Date().toISOString(),
    }).eq('id', callId);
  };

  const toggleRow = (id: string) => {
    const n = new Set(expandedRows);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedRows(n);
  };

  const openNotes = (e: React.MouseEvent, callId: string) => {
    e.stopPropagation();
    setExpandedRows(prev => {
      const n = new Set(prev);
      if (n.has(callId)) n.delete(callId); else n.add(callId);
      return n;
    });
  };

  const handleAddNote = async (callId: string) => {
    const text = newNoteText[callId]?.trim();
    if (!text) return;
    const call = calls.find(c => c.id === callId);
    setNewNoteText(prev => ({ ...prev, [callId]: '' }));
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, updatedAt: new Date() } : c));
    const { data, error } = await supabase.from('call_notes').insert({
      call_id: callId,
      application_id: call?.applicationId || '',
      dealer_name: call?.dealerName || '',
      note_text: text,
      created_by: currentUserId,
      created_by_name: currentUser?.name || 'User',
    }).select().single();
    if (!error && data) {
      setNotes(prev => [...prev, {
        id: data.id, callId, noteText: text,
        createdBy: currentUserId, createdByName: currentUser?.name || 'User',
        createdAt: new Date(data.created_at),
      }]);
    }
  };

  const getCallNotes = (callId: string) => notes.filter(n => n.callId === callId);

  const handleUpdateNote = async (noteId: string, text: string) => {
    const { error } = await supabase.from('call_notes').update({ note_text: text }).eq('id', noteId);
    if (!error) {
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, noteText: text } : n));
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const { error } = await supabase.from('call_notes').delete().eq('id', noteId);
    if (!error) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown className={`w-3 h-3 inline ml-1 ${sortField === field ? 'text-blue-400' : 'text-gray-600'}`} />
  );

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Calls</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          {isAdmin ? 'View and manage all calls' : 'View and manage your assigned calls'}
        </p>
      </div>

      {/* KPI CARDS + LEADERBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-stretch">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Daily Goal</p>
              <p className="text-2xl font-bold text-purple-400">
                {dealsToday}<span className="text-sm font-normal text-gray-500 ml-1">/ {dailyGoal}</span>
              </p>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${goalPct}%` }} />
              </div>
              <p className="text-xs text-gray-600">{goalPct.toFixed(0)}% complete</p>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Team Goal</p>
              <p className="text-2xl font-bold text-cyan-400">
                {teamDealsToday}<span className="text-sm font-normal text-gray-500 ml-1">/ {teamGoal}</span>
              </p>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${teamGoalPct}%` }} />
              </div>
              <p className="text-xs text-gray-600">{teamGoalPct.toFixed(0)}% complete</p>
            </div>
            {currentUserRole === 'rep' ? (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider">State Goal</p>
                {repStates.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">No state assigned</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {repStates.map(state => {
                      const goal = stateGoals[state] || 0;
                      const deals = getStateDealsToday(state);
                      const pctVal = goal > 0 ? Math.min((deals / goal) * 100, 100) : 0;
                      return (
                        <div key={state}>
                          <div className="flex items-baseline justify-between mb-1">
                            <span className="text-xs text-gray-400 font-medium">{state}</span>
                            <span className="text-sm font-bold text-teal-400">
                              {deals}<span className="text-xs font-normal text-gray-500 ml-1">/ {goal > 0 ? goal : '—'}</span>
                            </span>
                          </div>
                          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pctVal}%` }} />
                          </div>
                          {goal > 0 && <p className="text-xs text-gray-600 mt-0.5">{pctVal.toFixed(0)}% complete</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider">No Answer</p>
                <p className="text-2xl font-bold text-orange-400">{noAnswerCount}</p>
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: pct(noAnswerCount) }} />
                </div>
                <p className="text-xs text-gray-600">of {filteredCalls.length} calls</p>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex-1">
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-sm font-semibold text-gray-200">Call Status Breakdown</p>
              <div>
                <span className="text-xl font-bold text-blue-400">{filteredCalls.length}</span>
                <span className="text-xs text-gray-500 ml-1.5">total calls</span>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: 'No Call', count: noCallCount, color: 'bg-gray-500', textColor: 'text-gray-400' },
                { label: 'Pending', count: pendingCount, color: 'bg-yellow-400', textColor: 'text-yellow-400' },
                { label: 'No Answer', count: noAnswerCount, color: 'bg-orange-400', textColor: 'text-orange-400' },
                { label: 'Deal', count: dealTotalCount, color: 'bg-green-400', textColor: 'text-green-400' },
                { label: 'No Deal', count: noDealCount, color: 'bg-red-400', textColor: 'text-red-400' },
              ].map(({ label, count, color, textColor }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-20 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: pct(count) }} />
                  </div>
                  <span className={`text-xs font-semibold ${textColor} w-8 text-right flex-shrink-0`}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <span className="text-base">🏆</span>
            <p className="text-sm font-semibold text-gray-200">Today's Rankings</p>
          </div>
          <div className="divide-y divide-gray-700 flex-1">
            {leaderboard.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No deals logged today</p>
            ) : leaderboard.map((rep, idx) => {
              const m = medal(idx);
              const isMe = rep.id === currentUserId;
              return (
                <div key={rep.id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-blue-900 bg-opacity-20' : ''}`}>
                  <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-sm">
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
                    <p className={`text-lg font-bold leading-none ${rep.dealCount > 0 ? 'text-green-400' : 'text-gray-600'}`}>{rep.dealCount}</p>
                    <p className="text-xs text-gray-500 mt-0.5">deals</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-3 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input type="text" placeholder="Search App ID, Dealer, Customer, State…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={filterState} onChange={e => setFilterState(e.target.value)}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All States</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {isAdmin && (
          <select value={filterRep} onChange={e => setFilterRep(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">All Reps</option>
            {uniqueReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <div className="flex items-center border border-gray-600 rounded-lg overflow-hidden bg-gray-700">
          <div className="px-2 py-2 border-r border-gray-600">
            <Search className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 bg-gray-700 text-xs text-gray-300 focus:outline-none w-[120px]" />
          <span className="px-1 text-xs text-gray-500">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 bg-gray-700 text-xs text-gray-300 focus:outline-none w-[120px]" />
        </div>
        {isAdmin && (
          <button onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm text-gray-400 transition">
            {showCompleted ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="text-xs">{showCompleted ? 'Hiding' : `Hidden (${completedCount})`}</span>
          </button>
        )}
      </div>

      {/* ACTIVE REP FILTER BADGE */}
      {filterRep && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg">
          <span className="text-xs text-blue-400 uppercase tracking-wider">Viewing rep</span>
          <span className="text-xs text-blue-200 font-medium">{selectedRepName}</span>
          <span className="text-xs text-gray-500">— {repCallCount} calls assigned</span>
          <button onClick={() => setFilterRep('')}
            className="ml-auto flex items-center gap-1 text-xs text-blue-400 hover:text-blue-200 transition">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* DEALER FILTER BADGE */}
      {dealerFilter && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg">
          <span className="text-xs text-blue-400 uppercase tracking-wider">Filtered by dealer</span>
          <span className="text-xs text-blue-200 font-medium">{dealerFilter}</span>
          <button onClick={() => setDealerFilter('')}
            className="ml-auto flex items-center gap-1 text-xs text-blue-400 hover:text-blue-200 transition">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* NEW CALLS LEGEND */}
      {calls.some(isNewUpload) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-900 bg-opacity-20 border border-amber-700 border-opacity-50 rounded-lg w-fit">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-300">New today — uploaded in today's batch</span>
        </div>
      )}

      {/* STATUS LAST CHIPS */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap w-20 flex-shrink-0">Status Last</span>
        <div className="w-px h-4 bg-gray-700 flex-shrink-0" />
        <button onClick={() => setFilterNewOnly(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition ${
            filterNewOnly
              ? 'bg-amber-900 bg-opacity-60 border-amber-700 text-amber-300'
              : 'bg-gray-700 text-gray-400 border-gray-600 hover:border-gray-500 hover:text-gray-300'
          }`}>
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          New Only
        </button>
        {uniqueStatusLast.map(status => {
          const active = filterStatusLast.has(status);
          return (
            <button key={status} onClick={() => toggleStatusLastFilter(status)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition ${
                active
                  ? 'bg-blue-900 text-blue-300 border-blue-700'
                  : 'bg-gray-700 text-gray-400 border-gray-600 hover:border-gray-500 hover:text-gray-300'
              }`}>
              {active && <Check className="w-3 h-3 flex-shrink-0" />}
              {status}
            </button>
          );
        })}
        {filterStatusLast.size > 0 && (
          <button onClick={() => setFilterStatusLast(new Set())} className="ml-auto text-xs text-blue-400 hover:text-blue-300">
            Clear
          </button>
        )}
      </div>

      {/* FU STATUS CHIPS */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap w-20 flex-shrink-0">FU Status</span>
        <div className="w-px h-4 bg-gray-700 flex-shrink-0" />
        {fuStatusChips.map(({ label, onCls }) => {
          const active = filterFuStatuses.has(label);
          return (
            <button key={label} onClick={() => toggleFuStatusFilter(label)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition ${
                active
                  ? onCls
                  : 'bg-gray-700 text-gray-400 border-gray-600 hover:border-gray-500 hover:text-gray-300'
              }`}>
              {active
                ? <Check className="w-3 h-3 flex-shrink-0" />
                : <Plus className="w-3 h-3 flex-shrink-0" />}
              {label}
            </button>
          );
        })}
        {filterFuStatuses.size > 0 && (
          <button onClick={() => setFilterFuStatuses(new Set())} className="ml-auto text-xs text-blue-400 hover:text-blue-300">
            Clear
          </button>
        )}
      </div>

      {/* MY QUEUE INFO BAR — reps only */}
      {isRep && (
        <div className="flex items-center gap-3 px-1">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900 bg-opacity-20 border border-blue-800 rounded-lg">
            <span className="text-xs text-blue-400 font-medium">My Queue</span>
            <span className="text-xs text-gray-400">{unworkedCalls.length} unworked</span>
            {filteredInCalls.length > 0 && (
              <span className="text-xs text-gray-500">
                · +{filteredInCalls.length} filtered in ({Array.from(filterFuStatuses).filter(s => s !== 'No Call').join(', ')})
              </span>
            )}
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-200">
            {sortedCalls.length} calls
            <span className="ml-2 font-normal text-gray-400">· Page {currentPage} of {totalPages || 1}</span>
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '28px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '42px' }} />
              <col style={{ width: '78px' }} />
              <col style={{ width: '52px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '68px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '36px' }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-750 border-b border-gray-700">
                <th className="px-2 py-2"></th>
                <th className="px-2 py-2 text-left">
                  <button onClick={() => handleSort('applicationId')} className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    App ID <SortIcon field="applicationId" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button onClick={() => handleSort('dealerName')} className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    Dealer <SortIcon field="dealerName" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button onClick={() => handleSort('customerName')} className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    Customer <SortIcon field="customerName" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button onClick={() => handleSort('state')} className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    St <SortIcon field="state" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button onClick={() => handleSort('buyerFinal')} className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    Amount <SortIcon field="buyerFinal" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button onClick={() => handleSort('submittedDate')} className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    Date <SortIcon field="submittedDate" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">Status Last</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">Activity</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">FU Status</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {paginatedCalls.map((call, idx) => {
                const callNotes = getCallNotes(call.id);
                const isExpanded = expandedRows.has(call.id);
                const isNew = isNewUpload(call);
                const isFilteredDealer = dealerFilter === call.dealerName;
                const activity = formatLastActivity(call);
                const isWorked = !!call.fuStatus;
                const prevCall = paginatedCalls[idx - 1];
                const showDivider = isRep && isWorked && filteredInCalls.length > 0 &&
                  (idx === 0 || !prevCall?.fuStatus);

                const rowCls = call.isDuplicate
                  ? 'cursor-pointer transition-colors bg-yellow-900 bg-opacity-10 hover:bg-yellow-900 hover:bg-opacity-20'
                  : isNew
                    ? 'cursor-pointer transition-colors bg-amber-950 border-l-2 border-l-amber-500 hover:bg-amber-900 hover:bg-opacity-20'
                    : isRep && !isWorked
                      ? 'cursor-pointer transition-colors hover:bg-gray-750 border-l-2 border-l-blue-700'
                      : 'cursor-pointer transition-colors hover:bg-gray-750';

                const rows = [];

                if (showDivider) {
                  rows.push(
                    <tr key={`divider-${call.id}`}>
                      <td colSpan={11} className="px-0 py-0">
                        <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-750 border-y border-gray-700">
                          <div className="flex-1 h-px bg-gray-600" />
                          <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
                            Filtered in — {Array.from(filterFuStatuses).filter(s => s !== 'No Call').join(' · ')}
                          </span>
                          <div className="flex-1 h-px bg-gray-600" />
                        </div>
                      </td>
                    </tr>
                  );
                }

                rows.push(
                  <tr key={call.id} className={rowCls} onClick={() => toggleRow(call.id)}>

                    {/* Chevron */}
                    <td className="px-2 py-2 text-center">
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-blue-400 mx-auto" />
                        : <ChevronRight className="w-3.5 h-3.5 text-gray-500 mx-auto" />}
                    </td>

                    {/* App ID */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span
                          className="text-xs text-blue-400 font-medium hover:underline cursor-pointer truncate"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(call.applicationId); }}
                          title="Click to copy"
                        >
                          {call.applicationId}
                        </span>
                        {call.isDuplicate && (
                          <span className="px-1 bg-yellow-900 text-yellow-300 text-[9px] rounded border border-yellow-700 font-medium flex-shrink-0">DUPE</span>
                        )}
                        {isNew && (
                          <span className="px-1 bg-amber-900 text-amber-300 text-[9px] rounded border border-amber-700 font-medium flex-shrink-0">NEW</span>
                        )}
                      </div>
                    </td>

                    {/* Dealer */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setDealerFilter(prev => prev === call.dealerName ? '' : call.dealerName)}
                        title={call.dealerName}
                        className={`text-xs text-left truncate block w-full transition hover:text-blue-300 ${
                          isFilteredDealer ? 'text-blue-400 font-medium' : 'text-gray-200'
                        }`}
                      >
                        {call.dealerName}
                      </button>
                    </td>

                    {/* Customer */}
                    <td className="px-2 py-2">
                      {call.customerName
                        ? <span className="text-xs text-gray-400 truncate block w-full" title={call.customerName}>{call.customerName}</span>
                        : <span className="text-xs text-gray-600">—</span>}
                    </td>

                    {/* State */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600">{call.state}</span>
                    </td>

                    {/* Amount */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      {editingAmount === call.id ? (
                        <div className="flex items-center gap-1">
                          <input type="text" value={tempAmount} onChange={e => setTempAmount(e.target.value)}
                            className="w-14 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none"
                            autoFocus />
                          <button onClick={() => handleSaveAmount(call.id)} className="text-green-400 hover:text-green-300"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingAmount(null)} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium text-gray-100">
                            ${parseAmount(call.buyerFinal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                          <button onClick={() => { setEditingAmount(call.id); setTempAmount(call.buyerFinal); }}
                            className="text-gray-600 hover:text-gray-400 transition flex-shrink-0">
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{formatShortDate(call.submittedDate)}</td>

                    {/* Status Last */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      {editingStatusLast === call.id ? (
                        <div className="flex items-center gap-1">
                          <select value={tempStatusLast} onChange={e => setTempStatusLast(e.target.value)}
                            className="px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none"
                            autoFocus>
                            {allStatusLastOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => handleSaveStatusLast(call.id)} className="text-green-400 hover:text-green-300 flex-shrink-0"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingStatusLast(null)} className="text-red-400 hover:text-red-300 flex-shrink-0"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0 rounded-full text-[10px] border truncate ${getStatusLastStyle(call.statusLast)}`}>
                            {call.statusLast}
                          </span>
                          <button onClick={() => { setEditingStatusLast(call.id); setTempStatusLast(call.statusLast); }}
                            className="text-gray-600 hover:text-gray-400 transition flex-shrink-0">
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Last Activity */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <span className={`text-[10px] flex items-center gap-1 whitespace-nowrap ${activity.isToday ? 'text-emerald-400' : 'text-gray-500'}`}>
                        {activity.text !== '—' && (
                          <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                          </svg>
                        )}
                        {activity.text}
                      </span>
                    </td>

                    {/* FU Status */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <select value={call.fuStatus || ''}
                        onChange={e => handleStatusChange(call.id, e.target.value as Call['fuStatus'])}
                        className="px-1.5 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full">
                        <option value="">Select…</option>
                        <option>Deal</option>
                        <option>Confirmed Deal</option>
                        <option>No Deal</option>
                        <option>Pending</option>
                        <option>No Answer</option>
                        <option>Follow Up</option>
                        <option>Duplicates</option>
                        <option>Closed</option>
                      </select>
                    </td>

                    {/* Note button with badge */}
                    <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={e => openNotes(e, call.id)} title="Notes"
                        className={`relative inline-flex items-center justify-center w-6 h-6 rounded transition ${
                          callNotes.length > 0
                            ? 'bg-blue-600 text-white hover:bg-blue-500'
                            : 'bg-indigo-900 text-indigo-400 hover:bg-indigo-700 hover:text-white'
                        }`}>
                        <MessageSquare className="w-3 h-3" />
                        {callNotes.length > 0 && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center leading-none">
                            {callNotes.length}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                );

                if (isExpanded) {
                  rows.push(
                    <tr key={`${call.id}-exp`}>
                      <td colSpan={11} className="px-3 py-2 pl-8 pr-8 bg-gray-750">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Notes ({callNotes.length})</p>
                          {callNotes.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">No notes yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {callNotes.map(note => (
                                <NoteItem
                                  key={note.id}
                                  id={note.id}
                                  noteText={note.noteText}
                                  createdByName={note.createdByName}
                                  createdAt={note.createdAt}
                                  canEdit={note.createdBy === currentUserId}
                                  onUpdate={handleUpdateNote}
                                  onDelete={handleDeleteNote}
                                />
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 mt-1">
                            <input type="text" placeholder="Add a note…"
                              value={newNoteText[call.id] || ''}
                              onChange={e => setNewNoteText(prev => ({ ...prev, [call.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddNote(call.id); }}
                              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus />
                            <button onClick={() => handleAddNote(call.id)}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
                              Save
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return rows;
              })}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-2 border-t border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, sortedCalls.length)}–{Math.min(currentPage * itemsPerPage, sortedCalls.length)} of {sortedCalls.length} calls
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <span className="text-xs text-gray-400 px-2">Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}