import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronRight, ArrowUpDown, MessageSquare, Eye, EyeOff, ChevronLeft, ChevronRight as ChevronRightIcon, Edit2, Check, X, Plus, Target, Users, PhoneCall, Trophy, ListChecks, Clock, RotateCcw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { dealCreditDbFields, resolveDealCredit } from '../lib/dealCredit';
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
  updatedBy?: string;
  updatedByName?: string;
  customerName?: string;
}

interface CallNote {
  id: string;
  callId: string;
  applicationId?: string;
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

  const formatLastActivity = (call: Call): { text: string; isToday: boolean; byName?: string } => {
    if (!call.updatedAt) return { text: '—', isToday: false };
    if (call.createdAt) {
      const diffMs = Math.abs(call.updatedAt.getTime() - new Date(call.createdAt).getTime());
      if (diffMs < 5 * 60 * 1000) return { text: '—', isToday: false };
    }
    const date = new Date(call.updatedAt);
    const todayFlag = isToday(date);
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(' AM', 'am').replace(' PM', 'pm');
    const byName = call.updatedByName || undefined;
    if (todayFlag) return { text: `Today ${timeStr}`, isToday: true, byName };
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { text: dateStr, isToday: false, byName };
  };

  const actorUpdate = () => ({
    updatedBy: currentUserId,
    updatedByName: currentUser?.name || undefined,
  });

  const actorDbFields = () => ({
    updated_by: currentUserId,
    updated_by_name: currentUser?.name || null,
    updated_at: new Date().toISOString(),
  });

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

  const isGlobalSearch = searchQuery.trim().length > 0;

  const roleFilteredCalls = calls.filter(c =>
    isRep ? c.assignedTo === currentUserId : true
  );
  const uniqueStatusLast = Array.from(new Set(roleFilteredCalls.map(c => c.statusLast).filter(Boolean))).sort();
  const uniqueStates = Array.from(new Set(
    (isGlobalSearch ? calls : roleFilteredCalls).map(c => c.state)
  )).sort();

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

  const applyCallFilters = (call: Call, options?: { skipAssignment?: boolean; skipFuQueue?: boolean }) => {
    if (isRep && !options?.skipAssignment && call.assignedTo !== currentUserId) return false;
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

    // When searching, show all FU statuses (including No Deal / Closed / Duplicates)
    if (!options?.skipFuQueue) {
      const fuKey = call.fuStatus || 'No Call';
      if (isRep) {
        // My Queue: unworked calls always show; worked calls show only if their FU chip is selected
        if (fuKey !== 'No Call' && !filterFuStatuses.has(fuKey)) return false;
      } else {
        // Admin/Manager: if FU chips selected, filter to those only
        if (filterFuStatuses.size > 0 && !filterFuStatuses.has(fuKey)) return false;
        const isCompleted = call.fuStatus === 'No Deal' || call.fuStatus === 'Closed' || call.fuStatus === 'Duplicates';
        const explicitlyFiltering = filterFuStatuses.has('No Deal') || filterFuStatuses.has('Closed') || filterFuStatuses.has('Duplicates');
        if (!showCompleted && isCompleted && !explicitlyFiltering) return false;
      }
    }

    return true;
  };

  const filteredCalls = calls.filter(call =>
    applyCallFilters(call, {
      skipAssignment: isGlobalSearch,
      skipFuQueue: isGlobalSearch,
    })
  );

  const dashboardCalls = isGlobalSearch
    ? calls.filter(call => applyCallFilters(call))
    : filteredCalls;

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

  const csvDealsToday = roleFilteredCalls.filter(c =>
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

  const noCallCount = dashboardCalls.filter(c => !c.fuStatus).length;
  const pendingCount = dashboardCalls.filter(c => c.fuStatus === 'Pending').length;
  const noAnswerCount = dashboardCalls.filter(c => c.fuStatus === 'No Answer').length;
  const dealTotalCount = dashboardCalls.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal').length;
  const noDealCount = dashboardCalls.filter(c => c.fuStatus === 'No Deal').length;
  const breakdownTotal = dashboardCalls.length || 1;
  const pct = (n: number) => `${Math.round((n / breakdownTotal) * 100)}%`;
  const pctValue = (n: number) => Math.round((n / breakdownTotal) * 100);
  const activeQueueCount = noCallCount + pendingCount + noAnswerCount;
  const staleCount = dashboardCalls.filter(c => {
    if (!c.updatedAt) return false;
    if (['Deal', 'Confirmed Deal', 'No Deal', 'Closed', 'Duplicates'].includes(c.fuStatus || '')) return false;
    return Date.now() - new Date(c.updatedAt).getTime() > 3 * 24 * 60 * 60 * 1000;
  }).length;
  const workedTodayCount = dashboardCalls.filter(c => c.updatedAt && isToday(new Date(c.updatedAt)) && c.fuStatus).length;

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
    const existing = calls.find(c => c.id === callId);
    if (!existing) return;

    let actor = { id: currentUserId, name: currentUser?.name };
    let existingCredit = {
      dealBy: existing.dealBy,
      dealByName: existing.dealByName,
      dealDate: existing.dealDate,
    };

    // Block silent duplicate deal credit when a Daily Deals entry already owns this app
    if (newStatus === 'Deal' || newStatus === 'Confirmed Deal') {
      if (existing.dealBy && existing.dealBy !== currentUserId) {
        const keep = window.confirm(
          `This call is already credited to ${existing.dealByName || 'another rep'}.\n\n` +
          `OK = keep their credit and set status to ${newStatus}\n` +
          `Cancel = don't change status`
        );
        if (!keep) return;
      } else if (!existing.dealBy) {
        const { data: manuals } = await supabase
          .from('daily_deals')
          .select('app_id, added_by, added_by_name, fu_status, deal_date')
          .eq('app_id', existing.applicationId)
          .in('fu_status', ['Deal', 'Confirmed Deal'])
          .limit(1);
        const manual = manuals?.[0];
        if (manual?.added_by && manual.added_by !== currentUserId) {
          const link = window.confirm(
            `A Daily Deals / Public Deals entry for ${existing.applicationId} is already credited to ${manual.added_by_name || 'another rep'}.\n\n` +
            `OK = link and keep their credit (recommended)\n` +
            `Cancel = don't change status`
          );
          if (!link) return;
          existingCredit = {
            dealBy: manual.added_by,
            dealByName: manual.added_by_name || 'Unknown',
            dealDate: manual.deal_date
              ? new Date(
                parseInt(String(manual.deal_date).split('-')[0]),
                parseInt(String(manual.deal_date).split('-')[1]) - 1,
                parseInt(String(manual.deal_date).split('-')[2]),
              )
              : existing.dealDate,
          };
          // Actor ignored for new credit when existingCredit.dealBy is already set
          actor = { id: currentUserId, name: currentUser?.name };
        }
      }
    }

    const credit = resolveDealCredit(newStatus, existingCredit, actor);
    setCalls(prev => prev.map(c => c.id === callId
      ? {
        ...c,
        fuStatus: newStatus,
        updatedAt: new Date(),
        dealDate: credit.dealDate,
        dealBy: credit.dealBy,
        dealByName: credit.dealByName,
        ...actorUpdate(),
      }
      : c
    ));
    await supabase.from('calls').update({
      ...dealCreditDbFields(newStatus, existingCredit, actor),
      ...actorDbFields(),
    }).eq('id', callId);
  };

  const handleSaveStatusLast = async (callId: string) => {
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, statusLast: tempStatusLast, updatedAt: new Date(), ...actorUpdate() } : c));
    setEditingStatusLast(null);
    await supabase.from('calls').update({
      status_last: tempStatusLast,
      ...actorDbFields(),
    }).eq('id', callId);
  };

  const handleSaveAmount = async (callId: string) => {
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, buyerFinal: tempAmount, updatedAt: new Date(), ...actorUpdate() } : c));
    setEditingAmount(null);
    await supabase.from('calls').update({
      buyer_final: tempAmount,
      ...actorDbFields(),
    }).eq('id', callId);
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const n = new Set(prev);
      const opening = !n.has(id);
      if (opening) {
        n.add(id);
        const call = calls.find(c => c.id === id);
        if (call) void syncNotesForCall(call);
      } else {
        n.delete(id);
      }
      return n;
    });
  };

  const syncNotesForCall = async (call: Call) => {
    const appId = (call.applicationId || '').trim();
    if (!appId && !call.id) return;

    let query = supabase.from('call_notes').select('*').order('created_at', { ascending: true });
    if (appId) {
      query = query.or(`call_id.eq.${call.id},application_id.eq.${appId}`);
    } else {
      query = query.eq('call_id', call.id);
    }

    const { data, error } = await query;
    if (error || !data) return;

    const appKey = appId.toLowerCase();
    for (const n of data) {
      const noteApp = (n.application_id || '').trim().toLowerCase();
      const needsRelink = n.call_id !== call.id && (!!noteApp && noteApp === appKey || !n.application_id);
      const needsAppId = !(n.application_id || '').trim() && !!appId;
      if (needsRelink || needsAppId) {
        await supabase.from('call_notes').update({
          call_id: call.id,
          application_id: appId || n.application_id || '',
          dealer_name: call.dealerName || n.dealer_name || '',
        }).eq('id', n.id);
        n.call_id = call.id;
        n.application_id = appId || n.application_id || '';
      }
    }

    setNotes(prev => {
      const byId = new Map(prev.map(n => [n.id, n]));
      data.forEach((n: any) => {
        byId.set(n.id, {
          id: n.id,
          callId: n.call_id,
          applicationId: n.application_id || '',
          noteText: n.note_text,
          createdBy: n.created_by,
          createdByName: n.created_by_name,
          createdAt: new Date(n.created_at),
        });
      });
      return Array.from(byId.values()).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
    });
  };

  const openNotes = (e: React.MouseEvent, callId: string) => {
    e.stopPropagation();
    setExpandedRows(prev => {
      const n = new Set(prev);
      const opening = !n.has(callId);
      if (opening) {
        n.add(callId);
        const call = calls.find(c => c.id === callId);
        if (call) void syncNotesForCall(call);
      } else {
        n.delete(callId);
      }
      return n;
    });
  };

  const handleAddNote = async (callId: string) => {
    const text = newNoteText[callId]?.trim();
    if (!text) return;
    const call = calls.find(c => c.id === callId);
    setNewNoteText(prev => ({ ...prev, [callId]: '' }));
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, updatedAt: new Date(), ...actorUpdate() } : c));
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
        id: data.id, callId, applicationId: call?.applicationId || '',
        noteText: text,
        createdBy: currentUserId, createdByName: currentUser?.name || 'User',
        createdAt: new Date(data.created_at),
      }]);
      await supabase.from('calls').update(actorDbFields()).eq('id', callId);
    }
  };

  const getCallNotes = (callId: string) => {
    const call = calls.find(c => c.id === callId);
    const appKey = (call?.applicationId || '').trim().toLowerCase();
    const matched = notes.filter(n =>
      n.callId === callId ||
      (!!appKey && (n.applicationId || '').trim().toLowerCase() === appKey)
    );
    // Dedupe by note id (call_id + app_id match can both hit)
    const byId = new Map(matched.map(n => [n.id, n]));
    return Array.from(byId.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  };

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
          {isAdmin ? 'View and manage all calls' : 'View your assigned calls — search to find and update any call'}
        </p>
      </div>

      {/* KPI CARDS + LEADERBOARD */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-stretch">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-purple-950/30 p-4 shadow-lg shadow-purple-950/10">
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300">
                      <Target className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-purple-300/80">Daily Goal</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-300">
                    {dealsToday}<span className="ml-1 text-base font-normal text-gray-500">/ {dailyGoal}</span>
                  </p>
                </div>
                <div className="grid h-16 w-16 place-items-center rounded-full bg-gray-950/40 text-sm font-bold text-purple-200"
                  style={{ background: `conic-gradient(rgb(168 85 247) ${goalPct}%, rgba(55,65,81,.85) 0)` }}>
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-gray-900">{goalPct.toFixed(0)}%</div>
                </div>
              </div>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-gray-700/80">
                <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${goalPct}%` }} />
              </div>
              <p className="relative mt-2 text-xs text-gray-500">{goalPct.toFixed(0)}% complete</p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-cyan-950/30 p-4 shadow-lg shadow-cyan-950/10">
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                      <Users className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/80">Team Goal</p>
                  </div>
                  <p className="text-3xl font-bold text-cyan-300">
                    {teamDealsToday}<span className="ml-1 text-base font-normal text-gray-500">/ {teamGoal}</span>
                  </p>
                </div>
                <div className="grid h-16 w-16 place-items-center rounded-full bg-gray-950/40 text-sm font-bold text-cyan-200"
                  style={{ background: `conic-gradient(rgb(34 211 238) ${teamGoalPct}%, rgba(55,65,81,.85) 0)` }}>
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-gray-900">{teamGoalPct.toFixed(0)}%</div>
                </div>
              </div>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-gray-700/80">
                <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${teamGoalPct}%` }} />
              </div>
              <p className="relative mt-2 text-xs text-gray-500">{teamGoalPct.toFixed(0)}% complete</p>
            </div>

            {currentUserRole === 'rep' ? (
              <div className="relative overflow-hidden rounded-xl border border-teal-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-teal-950/30 p-4 shadow-lg shadow-teal-950/10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300">
                    <Target className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-300/80">State Goal</p>
                </div>
                {repStates.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No state assigned</p>
                ) : (
                  <div className="space-y-2">
                    {repStates.map(state => {
                      const goal = stateGoals[state] || 0;
                      const deals = getStateDealsToday(state);
                      const pctVal = goal > 0 ? Math.min((deals / goal) * 100, 100) : 0;
                      return (
                        <div key={state}>
                          <div className="mb-1 flex items-baseline justify-between">
                            <span className="text-xs font-medium text-gray-400">{state}</span>
                            <span className="text-sm font-bold text-teal-300">
                              {deals}<span className="ml-1 text-xs font-normal text-gray-500">/ {goal > 0 ? goal : '—'}</span>
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-700">
                            <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${pctVal}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-orange-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-orange-950/30 p-4 shadow-lg shadow-orange-950/10">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-500/10 blur-2xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300">
                        <PhoneCall className="h-4 w-4" />
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-orange-300/80">No Answer</p>
                    </div>
                    <p className="text-3xl font-bold text-orange-300">{noAnswerCount}</p>
                    <p className="mt-1 text-xs text-gray-500">of {dashboardCalls.length} calls</p>
                  </div>
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 px-3 py-2 text-right">
                    <p className="text-lg font-bold text-orange-300">{pctValue(noAnswerCount)}%</p>
                    <p className="text-[10px] uppercase tracking-wider text-orange-300/70">retry</p>
                  </div>
                </div>
                <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-gray-700/80">
                  <div className="h-full rounded-full bg-orange-400 transition-all" style={{ width: pct(noAnswerCount) }} />
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between border-b border-gray-700/70 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-100">Call Status Breakdown</p>
                  <p className="text-xs text-gray-500">Current filtered view</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-blue-400">{dashboardCalls.length}</span>
                <span className="ml-1.5 text-xs text-gray-500">total calls</span>
              </div>
            </div>

            <div className="space-y-2.5 p-4">
              {[
                { label: 'No Call', count: noCallCount, color: 'bg-gray-400', textColor: 'text-gray-300', icon: PhoneCall, pill: 'NO CALL', pillCls: 'bg-gray-700 text-gray-300 border-gray-600' },
                { label: 'Pending', count: pendingCount, color: 'bg-yellow-400', textColor: 'text-yellow-300', icon: Clock, pill: 'PENDING', pillCls: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/70' },
                { label: 'No Answer', count: noAnswerCount, color: 'bg-orange-400', textColor: 'text-orange-300', icon: RotateCcw, pill: 'NO ANSWER', pillCls: 'bg-orange-900/40 text-orange-300 border-orange-700/70' },
                { label: 'Deal', count: dealTotalCount, color: 'bg-green-400', textColor: 'text-green-300', icon: CheckCircle2, pill: 'DEAL', pillCls: 'bg-green-900/40 text-green-300 border-green-700/70' },
                { label: 'No Deal', count: noDealCount, color: 'bg-red-400', textColor: 'text-red-300', icon: XCircle, pill: 'NO DEAL', pillCls: 'bg-red-900/40 text-red-300 border-red-700/70' },
              ].map(({ label, count, color, textColor, icon: Icon, pill, pillCls }) => (
                <div key={label} className="grid grid-cols-[128px_minmax(0,1fr)_48px_42px_82px] items-center gap-3 rounded-lg border border-gray-700/50 bg-gray-900/20 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-800 text-gray-400">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="truncate text-sm font-medium text-gray-300">{label}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-700/80">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: pct(count) }} />
                  </div>
                  <span className="text-right text-xs font-semibold text-gray-400">{pctValue(count)}%</span>
                  <span className={`text-right text-xs font-bold ${textColor}`}>{count}</span>
                  <span className={`rounded-md border px-2 py-1 text-center text-[10px] font-semibold ${pillCls}`}>{pill}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr] gap-3 border-t border-gray-700/70 p-4">
              <div className="rounded-xl border border-gray-700 bg-gray-900/30 p-4">
                <div className="flex items-center gap-4">
                  <div
                    className="h-24 w-24 rounded-full border border-gray-700"
                    style={{
                      background: `conic-gradient(
                        rgb(250 204 21) 0 ${pctValue(pendingCount)}%,
                        rgb(251 146 60) ${pctValue(pendingCount)}% ${pctValue(pendingCount) + pctValue(noAnswerCount)}%,
                        rgb(156 163 175) ${pctValue(pendingCount) + pctValue(noAnswerCount)}% ${pctValue(pendingCount) + pctValue(noAnswerCount) + pctValue(noCallCount)}%,
                        rgb(74 222 128) ${pctValue(pendingCount) + pctValue(noAnswerCount) + pctValue(noCallCount)}% ${pctValue(pendingCount) + pctValue(noAnswerCount) + pctValue(noCallCount) + pctValue(dealTotalCount)}%,
                        rgb(248 113 113) 0
                      )`,
                    }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-100">Overview</p>
                    <p className="mt-1 text-3xl font-bold text-gray-100">{dashboardCalls.length}</p>
                    <p className="text-xs text-gray-500">total calls</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-purple-300">Today: <strong>{workedTodayCount}</strong></span>
                      <span className="text-cyan-300">Queue: <strong>{activeQueueCount}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-700 bg-gray-900/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300">
                      <Target className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-gray-100">Action Queue</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Focus: <span className="text-yellow-300">Pending</span>, then <span className="text-orange-300">No Answer</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                  {[
                    { label: 'Pending Follow-Up', count: pendingCount, icon: Clock, color: 'text-yellow-300', border: 'border-yellow-700/50', bg: 'bg-yellow-950/20', priority: 'Medium' },
                    { label: 'Needs First Call', count: noCallCount, icon: PhoneCall, color: 'text-purple-300', border: 'border-purple-700/50', bg: 'bg-purple-950/20', priority: 'High' },
                    { label: 'No Answer Retry', count: noAnswerCount, icon: RotateCcw, color: 'text-orange-300', border: 'border-orange-700/50', bg: 'bg-orange-950/20', priority: 'Retry' },
                    { label: 'Stale / Aging', count: staleCount, icon: AlertTriangle, color: 'text-red-300', border: 'border-red-700/50', bg: 'bg-red-950/20', priority: 'Review' },
                  ].map(({ label, count, icon: Icon, color, border, bg, priority }) => (
                    <div key={label} className={`rounded-lg border ${border} ${bg} p-3`}>
                      <div className="mb-2 flex items-center justify-between">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span className={`text-xl font-bold ${color}`}>{count}</span>
                      </div>
                      <p className="min-h-[32px] text-xs font-medium leading-tight text-gray-300">{label}</p>
                      <p className={`mt-2 rounded-md border ${border} px-2 py-1 text-center text-[10px] font-semibold ${color}`}>{priority}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 shadow-xl shadow-black/10 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
                <Trophy className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-gray-200">Today's Rankings</p>
            </div>
            <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-semibold text-gray-400">{leaderboard.length}</span>
          </div>
          <div className="divide-y divide-gray-700/70 flex-1 overflow-hidden">
            {leaderboard.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No deals logged today</p>
            ) : leaderboard.map((rep, idx) => {
              const m = medal(idx);
              const isMe = rep.id === currentUserId;
              return (
                <div key={rep.id} className={`flex items-center gap-3 px-4 py-3 transition ${isMe ? 'bg-blue-900/20 ring-1 ring-inset ring-blue-500/20' : 'hover:bg-gray-750'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${idx < 3 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-gray-700 text-gray-400'}`}>
                    {m || <span className="text-xs font-semibold">{idx + 1}</span>}
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
                    <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">deals</p>
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
          <input type="text" placeholder={isRep ? 'Search all calls — App ID, Dealer, Customer, State…' : 'Search App ID, Dealer, Customer, State…'}
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
                        {activity.byName && (
                          <span className="text-gray-600 truncate max-w-[72px]" title={activity.byName}>· {activity.byName}</span>
                        )}
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