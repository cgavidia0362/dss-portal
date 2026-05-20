import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronRight, ArrowUpDown, MessageSquare, EyeOff, Eye, ChevronLeft, ChevronRight as ChevronRightIcon, Edit2, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
  fuStatus?: 'Deal' | 'Confirmed Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
  dealDate?: Date;
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
  role: 'admin' | 'manager' | 'rep';
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
}

interface CallsTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'rep';
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

type SortField = 'applicationId' | 'dealerName' | 'state' | 'submittedDate' | 'fuStatus' | 'buyerFinal' | 'statusLast' | null;
type SortOrder = 'asc' | 'desc' | null;

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

export default function CallsTab({
  currentUserId, currentUserRole, calls, setCalls, notes, setNotes,
  dailyGoal, teamGoal, currentUser, todayDailyDeals, users,
}: CallsTabProps) {

  const [searchQuery, setSearchQuery] = useState('');
  const [filterFuStatus, setFilterFuStatus] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterStatusLast, setFilterStatusLast] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newNoteText, setNewNoteText] = useState<{ [callId: string]: string }>({});
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [stateGoalDaily, setStateGoalDaily] = useState(0);
  const [editingStatusLast, setEditingStatusLast] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [tempStatusLast, setTempStatusLast] = useState('');
  const [tempAmount, setTempAmount] = useState('');
  const itemsPerPage = 50;

  const allStatusLastOptions = [
    'Accepted','Approved','Approval','Counter','Denial','Declined',
    'Pending Approval','Document Received','Funded','Funding Pending',
    'New Application','Incomplete','Withdrawn','Cancelled',
  ];

  useEffect(() => {
    if (currentUserRole === 'rep' && currentUser?.state) fetchRepStateGoal(currentUser.state);
  }, [currentUser?.state, currentUserRole]);

  const fetchRepStateGoal = async (stateStr: string) => {
    const stateList = stateStr.split(',').map(s => s.trim()).filter(Boolean);
    if (!stateList.length) return;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    try {
      const { data } = await supabase.from('state_goals').select('*')
        .in('state', stateList).eq('month', currentMonth).eq('year', currentYear);
      if (data && data.length > 0) {
        const totalGoal = data.reduce((sum: number, g: any) => sum + g.monthly_goal, 0);
        const avgDays = Math.round(data.reduce((sum: number, g: any) => sum + g.funding_days, 0) / data.length);
        setStateGoalDaily(Math.round(totalGoal / avgDays));
      }
    } catch { setStateGoalDaily(0); }
  };

  const isToday = (date: Date) => {
    const t = new Date();
    return date.getDate() === t.getDate() &&
      date.getMonth() === t.getMonth() &&
      date.getFullYear() === t.getFullYear();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCalls(prev => prev.map(call => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (call.statusLast === 'Accepted' && call.fuStatus === 'Deal' &&
          call.dealDate && call.dealDate < sevenDaysAgo)
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
    if (s.includes('approved') || s.includes('approval')) return 'bg-green-900 text-green-300 border-green-700';
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
    currentUserRole === 'rep' ? c.assignedTo === currentUserId : true
  );
  const uniqueStatusLast = Array.from(new Set(roleFilteredCalls.map(c => c.statusLast).filter(Boolean))).sort();
  const uniqueStates = Array.from(new Set(roleFilteredCalls.map(c => c.state))).sort();

  const toggleStatusLastFilter = (status: string) => {
    const n = new Set(filterStatusLast);
    if (n.has(status)) n.delete(status); else n.add(status);
    setFilterStatusLast(n);
  };

  const filteredCalls = calls.filter(call => {
    if (currentUserRole === 'rep' && call.assignedTo !== currentUserId) return false;
    if (searchQuery && !call.applicationId.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !call.dealerName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !call.state.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterFuStatus && call.fuStatus !== filterFuStatus) return false;
    if (filterState && call.state !== filterState) return false;
    if (filterStatusLast.size > 0 && !filterStatusLast.has(call.statusLast)) return false;
    if (dateFrom && new Date(call.submittedDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(call.submittedDate) > new Date(dateTo)) return false;
    const isCompleted = call.fuStatus === 'No Deal' || call.fuStatus === 'Closed' || call.fuStatus === 'Duplicates';
    const isExplicitlyFiltering = ['No Deal','Closed','Duplicates'].includes(filterFuStatus);
    if (!showCompleted && isCompleted && !isExplicitlyFiltering) return false;
    return true;
  });

  const sortedCalls = [...filteredCalls].sort((a, b) => {
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

  useEffect(() => { setCurrentPage(1); },
    [searchQuery, filterFuStatus, filterState, filterStatusLast, dateFrom, dateTo, showCompleted]);

  // KPI calculations
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

  const repStates = (currentUser?.state || '').split(',').map(s => s.trim()).filter(Boolean);
  const stateDealsToday = repStates.length > 0 ? calls.filter(c =>
    repStates.includes(c.state) &&
    (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') &&
    c.dealDate && isToday(new Date(c.dealDate))
  ).length : 0;

  const stateGoalPct = stateGoalDaily > 0
    ? Math.min((stateDealsToday / stateGoalDaily) * 100, 100) : 0;

  const completedCount = calls.filter(c => {
    if (currentUserRole === 'rep' && c.assignedTo !== currentUserId) return false;
    return c.fuStatus === 'No Deal' || c.fuStatus === 'Closed' || c.fuStatus === 'Duplicates';
  }).length;

  // Status breakdown
  const pendingCount = filteredCalls.filter(c => c.fuStatus === 'Pending').length;
  const noAnswerCount = filteredCalls.filter(c => c.fuStatus === 'No Answer').length;
  const dealTotalCount = dealsToday; // combines CSV deals today + Daily Deals tab entries
  const noDealCount = filteredCalls.filter(c => c.fuStatus === 'No Deal').length;
  const breakdownTotal = filteredCalls.length || 1;
  const pct = (n: number) => `${Math.round((n / breakdownTotal) * 100)}%`;

  // Leaderboard — combines CSV deals + Daily Deals entries
  const leaderboard = (() => {
    const nameMap: { [id: string]: string } = {};
    calls.forEach(c => { if (c.assignedTo && c.assignedToName) nameMap[c.assignedTo] = c.assignedToName; });
    (users || []).forEach(u => { nameMap[u.id] = u.name; });
    if (currentUser) nameMap[currentUser.id] = currentUser.name;

    const repMap: { [id: string]: { name: string; dealCount: number; amount: number } } = {};
    Object.entries(nameMap).forEach(([id, name]) => {
      repMap[id] = { name, dealCount: 0, amount: 0 };
    });

    calls.forEach(c => {
      if (!c.assignedTo || !repMap[c.assignedTo]) return;
      if ((c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && c.dealDate && isToday(new Date(c.dealDate))) {
        repMap[c.assignedTo].dealCount++;
        repMap[c.assignedTo].amount += parseAmount(c.buyerFinal);
      }
    });

    (todayDailyDeals || []).forEach(d => {
      if (d.fuStatus !== 'Deal' && d.fuStatus !== 'Confirmed Deal') return;
      if (!repMap[d.addedBy]) {
        repMap[d.addedBy] = { name: nameMap[d.addedBy] || 'Unknown', dealCount: 0, amount: 0 };
      }
      repMap[d.addedBy].dealCount++;
      repMap[d.addedBy].amount += parseAmount(d.amount || '0');
    });

    return Object.entries(repMap)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.dealCount - a.dealCount || b.amount - a.amount);
  })();

  // Handlers
  const handleStatusChange = (callId: string, newStatus: Call['fuStatus']) => {
    setCalls(prev => prev.map(c => c.id === callId
      ? { ...c, fuStatus: newStatus, updatedAt: new Date(), dealDate: newStatus === 'Deal' ? new Date() : c.dealDate }
      : c));
  };

  const handleSaveStatusLast = (callId: string) => {
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, statusLast: tempStatusLast } : c));
    setEditingStatusLast(null);
  };

  const handleSaveAmount = (callId: string) => {
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, buyerFinal: tempAmount } : c));
    setEditingAmount(null);
  };

  const toggleRow = (id: string) => {
    const n = new Set(expandedRows);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedRows(n);
  };

  const handleAddNote = (callId: string) => {
    const text = newNoteText[callId]?.trim();
    if (!text) return;
    setNotes(prev => [...prev, {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callId, noteText: text,
      createdBy: currentUserId,
      createdByName: currentUser?.name || 'User',
      createdAt: new Date(),
    }]);
    setNewNoteText(prev => ({ ...prev, [callId]: '' }));
  };

  const getCallNotes = (callId: string) => notes.filter(n => n.callId === callId);

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown className={`w-3 h-3 inline ml-1 ${sortField === field ? 'text-blue-400' : 'text-gray-600'}`} />
  );

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Calls</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          {currentUserRole === 'admin' ? 'View and manage all calls' : 'View and manage your assigned calls'}
        </p>
      </div>

      {/* KPI CARDS + LEADERBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-stretch">

        {/* LEFT: 2 rows */}
        <div className="flex flex-col gap-3">

          {/* Row 1: 3 goal cards */}
          <div className="grid grid-cols-3 gap-3">

            {/* Daily Goal */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Daily Goal</p>
              <p className="text-2xl font-bold text-purple-400">
                {dealsToday}
                <span className="text-sm font-normal text-gray-500 ml-1">/ {dailyGoal}</span>
              </p>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${goalPct}%` }} />
              </div>
              <p className="text-xs text-gray-600">{goalPct.toFixed(0)}% complete</p>
            </div>

            {/* Team Goal */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Team Goal</p>
              <p className="text-2xl font-bold text-cyan-400">
                {teamDealsToday}
                <span className="text-sm font-normal text-gray-500 ml-1">/ {teamGoal}</span>
              </p>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${teamGoalPct}%` }} />
              </div>
              <p className="text-xs text-gray-600">{teamGoalPct.toFixed(0)}% complete</p>
            </div>

            {/* State Goal (rep) or No Answer (admin/manager) */}
            {currentUserRole === 'rep' ? (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider">
                  State Goal {repStates.length > 0 ? `(${repStates.join(', ')})` : ''}
                </p>
                {stateGoalDaily > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-teal-400">
                      {stateDealsToday}
                      <span className="text-sm font-normal text-gray-500 ml-1">/ {stateGoalDaily}</span>
                    </p>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all"
                        style={{ width: `${stateGoalPct}%` }} />
                    </div>
                    <p className="text-xs text-gray-600">{stateGoalPct.toFixed(0)}% complete</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-teal-400">{stateDealsToday}</p>
                    <div className="h-1 bg-gray-700 rounded-full" />
                    <p className="text-xs text-gray-600">no goal set</p>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider">No Answer</p>
                <p className="text-2xl font-bold text-orange-400">{noAnswerCount}</p>
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full"
                    style={{ width: `${pct(noAnswerCount)}` }} />
                </div>
                <p className="text-xs text-gray-600">of {filteredCalls.length} calls</p>
              </div>
            )}
          </div>

          {/* Row 2: Call status breakdown */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex-1">
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-sm font-semibold text-gray-200">Call Status Breakdown</p>
              <div>
                <span className="text-xl font-bold text-blue-400">{filteredCalls.length}</span>
                <span className="text-xs text-gray-500 ml-1.5">total calls</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 flex-shrink-0">Pending</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full transition-all"
                    style={{ width: `${pct(pendingCount)}` }} />
                </div>
                <span className="text-xs font-semibold text-yellow-400 w-8 text-right flex-shrink-0">
                  {pendingCount}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 flex-shrink-0">No Answer</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400 rounded-full transition-all"
                    style={{ width: `${pct(noAnswerCount)}` }} />
                </div>
                <span className="text-xs font-semibold text-orange-400 w-8 text-right flex-shrink-0">
                  {noAnswerCount}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 flex-shrink-0">Deal</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full transition-all"
                    style={{ width: `${pct(dealTotalCount)}` }} />
                </div>
                <span className="text-xs font-semibold text-green-400 w-8 text-right flex-shrink-0">
                  {dealTotalCount}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 flex-shrink-0">No Deal</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full transition-all"
                    style={{ width: `${pct(noDealCount)}` }} />
                </div>
                <span className="text-xs font-semibold text-red-400 w-8 text-right flex-shrink-0">
                  {noDealCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Leaderboard */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <span className="text-base">🏆</span>
            <p className="text-sm font-semibold text-gray-200">Today's Rankings</p>
          </div>
          <div className="divide-y divide-gray-700 flex-1">
            {leaderboard.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No deals logged today</p>
            ) : (
              leaderboard.map((rep, idx) => {
                const m = medal(idx);
                const isMe = rep.id === currentUserId;
                return (
                  <div key={rep.id}
                    className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-blue-900 bg-opacity-20' : ''}`}>
                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-sm">
                      {m || <span className="text-xs text-gray-400 font-medium">{idx + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isMe ? 'text-blue-300' : 'text-gray-200'}`}>
                        {rep.name}{isMe && <span className="ml-1 text-xs text-blue-400 font-normal">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {rep.amount > 0
                          ? formatCurrency(rep.amount)
                          : <span className="italic">no deals yet</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-bold leading-none ${rep.dealCount > 0 ? 'text-green-400' : 'text-gray-600'}`}>
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

      {/* FILTER BAR */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-3 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search App ID, Dealer, State…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select value={filterState} onChange={e => setFilterState(e.target.value)}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All States</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterFuStatus} onChange={e => setFilterFuStatus(e.target.value)}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option>Deal</option><option>Confirmed Deal</option><option>No Deal</option>
          <option>Pending</option><option>No Answer</option><option>Closed</option><option>Duplicates</option>
        </select>
        <div className="flex items-center border border-gray-600 rounded-lg overflow-hidden bg-gray-700">
          <div className="px-2.5 py-2 border-r border-gray-600 bg-gray-700">
            <Search className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 bg-gray-700 text-xs text-gray-300 focus:outline-none w-[120px]" />
          <span className="px-1 text-xs text-gray-500">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 bg-gray-700 text-xs text-gray-300 focus:outline-none w-[120px]" />
        </div>
        <button onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm text-gray-400 transition">
          {showCompleted ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          <span className="text-xs">{showCompleted ? 'Hiding' : `Hidden (${completedCount})`}</span>
        </button>
      </div>

      {/* STATUS CHIPS */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">Filter</span>
        <div className="w-px h-4 bg-gray-700 mx-1" />
        {uniqueStatusLast.map(status => {
          const active = filterStatusLast.has(status);
          return (
            <button key={status} onClick={() => toggleStatusLastFilter(status)}
              className={`px-3 py-1 rounded-full text-xs border transition ${active
                ? 'bg-blue-900 text-blue-300 border-blue-700'
                : 'bg-gray-700 text-gray-400 border-gray-600 hover:border-gray-500 hover:text-gray-300'
              }`}>
              {status}
            </button>
          );
        })}
        {filterStatusLast.size > 0 && (
          <button onClick={() => setFilterStatusLast(new Set())}
            className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition">
            Clear all
          </button>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-200">
            {sortedCalls.length} calls
            <span className="ml-2 font-normal text-gray-400">
              · Page {currentPage} of {totalPages || 1}
            </span>
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-750">
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => handleSort('applicationId')}
                    className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    App ID <SortIcon field="applicationId" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => handleSort('dealerName')}
                    className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    Dealer <SortIcon field="dealerName" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => handleSort('state')}
                    className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    State <SortIcon field="state" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => handleSort('buyerFinal')}
                    className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    Amount <SortIcon field="buyerFinal" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => handleSort('submittedDate')}
                    className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200">
                    Date <SortIcon field="submittedDate" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status Last
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  FU Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {paginatedCalls.map(call => {
                const callNotes = getCallNotes(call.id);
                const isExpanded = expandedRows.has(call.id);
                return (
                  <>
                    <tr key={call.id}
                      className="hover:bg-gray-750 cursor-pointer transition-colors"
                      onClick={() => toggleRow(call.id)}>
                      <td className="px-4 py-3 text-center">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-blue-400 mx-auto" />
                          : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-sm text-blue-400 font-medium hover:underline cursor-pointer"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(call.applicationId); }}
                          title="Click to copy"
                        >
                          {call.applicationId}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-200 max-w-[180px] truncate">
                        {call.dealerName}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">
                          {call.state}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {editingAmount === call.id ? (
                          <div className="flex items-center gap-1">
                            <input type="text" value={tempAmount}
                              onChange={e => setTempAmount(e.target.value)}
                              className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none"
                              autoFocus />
                            <button onClick={() => handleSaveAmount(call.id)}
                              className="text-green-400 hover:text-green-300">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingAmount(null)}
                              className="text-red-400 hover:text-red-300">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-gray-100">
                              ${parseAmount(call.buyerFinal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </span>
                            <button
                              onClick={() => { setEditingAmount(call.id); setTempAmount(call.buyerFinal); }}
                              className="text-gray-600 hover:text-gray-400 transition">
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{call.submittedDate}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {editingStatusLast === call.id ? (
                          <div className="flex items-center gap-1">
                            <select value={tempStatusLast}
                              onChange={e => setTempStatusLast(e.target.value)}
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none"
                              autoFocus>
                              {allStatusLastOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button onClick={() => handleSaveStatusLast(call.id)}
                              className="text-green-400 hover:text-green-300">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingStatusLast(null)}
                              className="text-red-400 hover:text-red-300">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs border ${getStatusLastStyle(call.statusLast)}`}>
                              {call.statusLast}
                            </span>
                            <button
                              onClick={() => { setEditingStatusLast(call.id); setTempStatusLast(call.statusLast); }}
                              className="text-gray-600 hover:text-gray-400 transition">
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select value={call.fuStatus || ''}
                          onChange={e => handleStatusChange(call.id, e.target.value as Call['fuStatus'])}
                          className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full">
                          <option value="">Select…</option>
                          <option>Deal</option><option>No Deal</option><option>Pending</option>
                          <option>No Answer</option><option>Closed</option><option>Duplicates</option>
                        </select>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {callNotes.length > 0 && (
                          <div className="flex items-center gap-1 text-blue-400">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold">{callNotes.length}</span>
                          </div>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${call.id}-exp`}>
                        <td colSpan={9} className="px-4 py-4 pl-12 bg-gray-750">
                          <div className="space-y-3 max-w-2xl">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Notes ({callNotes.length})
                            </p>
                            {callNotes.length === 0 ? (
                              <p className="text-sm text-gray-500 italic">No notes yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {callNotes.map(note => (
                                  <div key={note.id} className="bg-gray-700 px-4 py-3 rounded-lg border border-gray-600">
                                    <p className="text-sm text-gray-200">{note.noteText}</p>
                                    <p className="text-xs text-gray-500 mt-1.5">
                                      {note.createdByName} · {note.createdAt.toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Add a note…"
                                value={newNoteText[call.id] || ''}
                                onChange={e => setNewNoteText(prev => ({ ...prev, [call.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddNote(call.id); }}
                                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button onClick={() => handleAddNote(call.id)}
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

        {/* Table footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, sortedCalls.length)}–{Math.min(currentPage * itemsPerPage, sortedCalls.length)} of {sortedCalls.length} calls
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <span className="text-xs text-gray-400 px-2">
              Page {currentPage} of {totalPages || 1}
            </span>
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