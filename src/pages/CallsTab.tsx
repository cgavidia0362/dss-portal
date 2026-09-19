import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, ChevronRight, ArrowUpDown, MessageSquare, Eye, EyeOff, ChevronLeft, ChevronRight as ChevronRightIcon, Edit2, Check, X, Plus, Target, Users, PhoneCall, Trophy, ListChecks, Clock, RotateCcw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { dealCreditDbFields, resolveDealCredit, forceDealCreditDbFields } from '../lib/dealCredit';
import { getDealCreditOptions, resolveCreditName } from '../lib/systemReps';
import { statusMatchesFilter } from '../lib/statusLastFilter';
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
  onUpdateCurrentUser?: (patch: Partial<User>) => void;
  todayDailyDeals?: DailyDealSummary[];
  users?: User[];
}

type SortField = 'applicationId' | 'dealerName' | 'state' | 'submittedDate' | 'fuStatus' | 'buyerFinal' | 'statusLast' | 'customerName';
type ActiveSortField = SortField;
type ColumnSort = { field: ActiveSortField; order: 'asc' | 'desc' };

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const compareTextSort = (a: string, b: string, order: 'asc' | 'desc'): number => {
  const aNorm = a.trim();
  const bNorm = b.trim();
  if (!aNorm && !bNorm) return 0;
  if (!aNorm) return 1;
  if (!bNorm) return -1;
  const cmp = aNorm.localeCompare(bNorm, undefined, { sensitivity: 'base', numeric: true });
  return order === 'asc' ? cmp : -cmp;
};

const compareCalls = (
  a: Call,
  b: Call,
  field: ActiveSortField,
  order: 'asc' | 'desc',
): number => {
  let primary = 0;

  if (field === 'submittedDate') {
    const aVal = new Date(a.submittedDate).getTime();
    const bVal = new Date(b.submittedDate).getTime();
    if (aVal < bVal) primary = -1;
    else if (aVal > bVal) primary = 1;
    primary = order === 'asc' ? primary : -primary;
  } else if (field === 'buyerFinal') {
    const aVal = parseAmount(a.buyerFinal);
    const bVal = parseAmount(b.buyerFinal);
    if (aVal < bVal) primary = -1;
    else if (aVal > bVal) primary = 1;
    primary = order === 'asc' ? primary : -primary;
  } else {
    primary = compareTextSort(String(a[field] ?? ''), String(b[field] ?? ''), order);
  }

  if (primary !== 0) return primary;
  return compareTextSort(a.applicationId, b.applicationId, 'asc');
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

export default function CallsTab({
  currentUserId, currentUserRole, calls, setCalls, notes, setNotes,
  dailyGoal, teamGoal, currentUser, onUpdateCurrentUser, todayDailyDeals, users,
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
  const [columnSort, setColumnSort] = useState<ColumnSort | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [creditModal, setCreditModal] = useState<{
    callId: string;
    newStatus: NonNullable<Call['fuStatus']>;
    creditId: string;
  } | null>(null);
  const canForceCredit = currentUserRole === 'admin' || currentUserRole === 'manager';
  const creditOptions = getDealCreditOptions(users || [], currentUserRole);
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
    { label: 'No Call',        onCls: 'bg-teal-50 border-teal-200 text-teal-800' },
    { label: 'Pending',        onCls: 'bg-amber-50 border-amber-200 text-amber-800' },
    { label: 'No Answer',      onCls: 'bg-rose-50 bg-opacity-40 border-rose-200 text-dss-danger' },
    { label: 'Follow Up',      onCls: 'bg-orange-50 border-orange-200 text-orange-800' },
    { label: 'Deal',           onCls: 'bg-emerald-50 bg-opacity-40 border-green-600 text-dss-success' },
    { label: 'Confirmed Deal', onCls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    { label: 'No Deal',        onCls: 'bg-rose-50 bg-opacity-40 border-red-900 text-dss-danger' },
    { label: 'Duplicates',     onCls: 'bg-orange-50 border-orange-200 text-orange-800' },
    { label: 'Closed',         onCls: 'bg-dss-canvas border-dss-border text-dss-muted' },
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

  const effectiveAllowedStatuses = useMemo(() => {
    if (currentUser?.allowedStatuses?.length) return currentUser.allowedStatuses;
    return users?.find(u => u.id === currentUserId)?.allowedStatuses || [];
  }, [currentUser?.allowedStatuses, users, currentUserId]);

  useEffect(() => {
    if (!isRep || !currentUserId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('allowed_statuses')
        .eq('id', currentUserId)
        .single();
      if (cancelled || error || !data) return;
      const statuses = data.allowed_statuses || [];
      if (JSON.stringify(statuses) !== JSON.stringify(currentUser?.allowedStatuses || [])) {
        onUpdateCurrentUser?.({ allowedStatuses: statuses });
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, isRep]);

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

  const handleSort = (field: ActiveSortField) => {
    setColumnSort(prev => {
      if (prev?.field === field) {
        if (prev.order === 'asc') return { field, order: 'desc' };
        return null;
      }
      return { field, order: 'asc' };
    });
  };

  const getStatusLastStyle = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('approved') || s === 'approval') return 'bg-emerald-50 text-emerald-900 border-emerald-300';
    if (s === 'pending approval' || s.includes('pending approval')) return 'bg-violet-50 text-violet-900 border-violet-300';
    if (s.includes('counter')) return 'bg-amber-50 text-amber-900 border-amber-300';
    if (s.includes('denial') || s.includes('declined')) return 'bg-rose-50 text-rose-900 border-rose-300';
    if (s.includes('accepted')) return 'bg-sky-50 text-sky-900 border-sky-300';
    if (s.includes('pending')) return 'bg-orange-50 text-orange-900 border-orange-300';
    if (s.includes('document received')) return 'bg-indigo-50 text-indigo-900 border-indigo-300';
    if (s.includes('funded') || s.includes('funding')) return 'bg-emerald-50 text-emerald-900 border-emerald-300';
    if (s.includes('new application')) return 'bg-cyan-50 text-cyan-900 border-cyan-300';
    if (s.includes('reconsider')) return 'bg-slate-100 text-slate-800 border-slate-300';
    if (s.includes('follow up')) return 'bg-amber-50 text-amber-900 border-amber-300';
    if (s.includes('duplicate')) return 'bg-orange-50 text-orange-900 border-orange-300';
    return 'bg-dss-canvas text-dss-ink border-dss-border';
  };

  const isGlobalSearch = searchQuery.trim().length > 0;

  const roleFilteredCalls = calls.filter(c =>
    isRep ? c.assignedTo === currentUserId : true
  );
  const queueStatusCalls = isRep && !isGlobalSearch && effectiveAllowedStatuses.length > 0
    ? roleFilteredCalls.filter(c => statusMatchesFilter(c.statusLast, new Set(effectiveAllowedStatuses)))
    : roleFilteredCalls;
  const uniqueStatusLast = isRep && !isGlobalSearch && effectiveAllowedStatuses.length > 0
    ? [...effectiveAllowedStatuses].sort((a, b) => a.localeCompare(b))
    : Array.from(new Set(queueStatusCalls.map(c => c.statusLast).filter(Boolean))).sort();
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

  const applyCallFilters = (call: Call, options?: { skipAssignment?: boolean; skipAllowedStatuses?: boolean; skipFuQueue?: boolean }) => {
    if (isRep && !options?.skipAssignment) {
      if (!call.assignedTo || call.assignedTo !== currentUserId) return false;
    }
    if (
      isRep &&
      !options?.skipAllowedStatuses &&
      effectiveAllowedStatuses.length > 0 &&
      !statusMatchesFilter(call.statusLast, new Set(effectiveAllowedStatuses))
    ) {
      return false;
    }
    if (searchQuery &&
      !call.applicationId.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !call.dealerName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !call.state.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(call.customerName || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterState && call.state !== filterState) return false;
    if (filterRep && call.assignedTo !== filterRep) return false;
    if (dealerFilter && call.dealerName !== dealerFilter) return false;
    if (filterNewOnly && !dealerFilter && !isNewUpload(call)) return false;
    if (filterStatusLast.size > 0) {
      const statusMatches = isRep && effectiveAllowedStatuses.length > 0
        ? statusMatchesFilter(call.statusLast, filterStatusLast)
        : filterStatusLast.has(call.statusLast);
      if (!statusMatches) return false;
    }
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
      skipAllowedStatuses: isGlobalSearch,
      skipFuQueue: isGlobalSearch,
    })
  );

  const dashboardCalls = isGlobalSearch
    ? calls.filter(call => applyCallFilters(call))
    : filteredCalls;

  // Split for My Queue divider (reps only)
  const unworkedCalls = isRep ? filteredCalls.filter(c => !c.fuStatus) : [];
  const filteredInCalls = isRep ? filteredCalls.filter(c => !!c.fuStatus) : [];

  const sortedCalls = (() => {
    const list = [...filteredCalls];

    if (columnSort) {
      const { field, order } = columnSort;
      list.sort((a, b) => compareCalls(a, b, field, order));
      return list;
    }

    if (isRep && !isGlobalSearch) {
      list.sort((a, b) => {
        const aUnworked = !a.fuStatus ? 0 : 1;
        const bUnworked = !b.fuStatus ? 0 : 1;
        return aUnworked - bUnworked;
      });
    }

    return list;
  })();

  const isQueueView = isRep && !columnSort && !isGlobalSearch;

  const totalPages = Math.ceil(sortedCalls.length / itemsPerPage);
  const paginatedCalls = sortedCalls.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterFuStatuses, filterState, filterRep, filterNewOnly, filterStatusLast, dealerFilter, dateFrom, dateTo, showCompleted, columnSort]);

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

    // Managers/admins pick who gets credit when marking Deal / Confirmed
    if (
      canForceCredit &&
      (newStatus === 'Deal' || newStatus === 'Confirmed Deal')
    ) {
      setCreditModal({
        callId,
        newStatus,
        creditId: existing.dealBy || currentUserId,
      });
      return;
    }

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

  const applyCreditModal = async () => {
    if (!creditModal) return;
    const { callId, newStatus, creditId } = creditModal;
    const existing = calls.find(c => c.id === callId);
    if (!existing) { setCreditModal(null); return; }

    const creditName = resolveCreditName(creditId, creditOptions);
    const fields = forceDealCreditDbFields(newStatus, { id: creditId, name: creditName }, existing.dealDate);
    const dealDate = fields.deal_date ? new Date(fields.deal_date) : existing.dealDate;

    setCalls(prev => prev.map(c => c.id === callId
      ? {
        ...c,
        fuStatus: newStatus,
        updatedAt: new Date(),
        dealDate,
        dealBy: creditId,
        dealByName: creditName,
        ...actorUpdate(),
      }
      : c
    ));
    await supabase.from('calls').update({
      ...fields,
      ...actorDbFields(),
    }).eq('id', callId);
    setCreditModal(null);
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

  const SortIcon = ({ field }: { field: ActiveSortField }) => {
    if (columnSort?.field !== field) {
      return <ArrowUpDown className="w-3 h-3 inline ml-1 text-dss-muted" />;
    }
    return columnSort.order === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-1 text-dss-accent" />
      : <ChevronDown className="w-3 h-3 inline ml-1 text-dss-accent" />;
  };

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold text-dss-ink">Calls</h2>
        <p className="text-sm text-dss-muted mt-0.5">
          {isAdmin ? 'View and manage all calls' : 'View your assigned calls — search to find and update any call'}
        </p>
      </div>

      {/* KPI CARDS + LEADERBOARD */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-stretch">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative overflow-hidden rounded-dss border border-violet-200 bg-white p-4 shadow-sm">
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-dss-sm border border-violet-200 bg-violet-50 text-violet-800">
                      <Target className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-900">Daily Goal</p>
                  </div>
                  <p className="text-3xl font-bold text-dss-ink">
                    {dealsToday}<span className="ml-1 text-base font-normal text-dss-muted">/ {dailyGoal}</span>
                  </p>
                </div>
                <div className="grid h-16 w-16 place-items-center rounded-full bg-dss-canvas text-sm font-bold text-violet-900"
                  style={{ background: `conic-gradient(rgb(139 92 246) ${goalPct}%, rgb(226 232 240) 0)` }}>
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-dss-ink">{goalPct.toFixed(0)}%</div>
                </div>
              </div>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-dss-canvas">
                <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${goalPct}%` }} />
              </div>
              <p className="relative mt-2 text-xs text-dss-muted">{goalPct.toFixed(0)}% complete</p>
            </div>

            <div className="relative overflow-hidden rounded-dss border border-cyan-200 bg-white p-4 shadow-sm">
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-dss-sm border border-cyan-200 bg-cyan-50 text-cyan-900">
                      <Users className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-900">Team Goal</p>
                  </div>
                  <p className="text-3xl font-bold text-dss-ink">
                    {teamDealsToday}<span className="ml-1 text-base font-normal text-dss-muted">/ {teamGoal}</span>
                  </p>
                </div>
                <div className="grid h-16 w-16 place-items-center rounded-full bg-dss-canvas text-sm font-bold text-cyan-900"
                  style={{ background: `conic-gradient(rgb(8 145 178) ${teamGoalPct}%, rgb(226 232 240) 0)` }}>
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-dss-ink">{teamGoalPct.toFixed(0)}%</div>
                </div>
              </div>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-dss-canvas">
                <div className="h-full rounded-full bg-dss-navy-soft transition-all" style={{ width: `${teamGoalPct}%` }} />
              </div>
              <p className="relative mt-2 text-xs text-dss-muted">{teamGoalPct.toFixed(0)}% complete</p>
            </div>

            {currentUserRole === 'rep' ? (
              <div className="relative overflow-hidden rounded-dss border border-teal-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-dss-sm border border-teal-200 bg-teal-50 text-teal-900">
                    <Target className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-900">State Goal</p>
                </div>
                {repStates.length === 0 ? (
                  <p className="text-xs text-dss-muted italic">No state assigned</p>
                ) : (
                  <div className="space-y-2">
                    {repStates.map(state => {
                      const goal = stateGoals[state] || 0;
                      const deals = getStateDealsToday(state);
                      const pctVal = goal > 0 ? Math.min((deals / goal) * 100, 100) : 0;
                      return (
                        <div key={state}>
                          <div className="mb-1 flex items-baseline justify-between">
                            <span className="text-xs font-medium text-dss-muted">{state}</span>
                            <span className="text-sm font-bold text-teal-800">
                              {deals}<span className="ml-1 text-xs font-normal text-dss-muted">/ {goal > 0 ? goal : '—'}</span>
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-dss-canvas">
                            <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${pctVal}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-dss border border-orange-200 bg-white p-4 shadow-sm">
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-dss-sm border border-orange-200 bg-orange-50 text-orange-900">
                        <PhoneCall className="h-4 w-4" />
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-orange-900">No Answer</p>
                    </div>
                    <p className="text-3xl font-bold text-dss-ink">{noAnswerCount}</p>
                    <p className="mt-1 text-xs text-dss-muted">of {dashboardCalls.length} calls</p>
                  </div>
                  <div className="rounded-dss border border-orange-200 bg-orange-50 px-3 py-2 text-right">
                    <p className="text-lg font-bold text-orange-900">{pctValue(noAnswerCount)}%</p>
                    <p className="text-[10px] uppercase tracking-wider text-orange-800">retry</p>
                  </div>
                </div>
                <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-dss-canvas">
                  <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: pct(noAnswerCount) }} />
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-dss border border-dss-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-dss-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-dss-sm border border-dss-border bg-dss-accent-soft text-dss-ink">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-dss-ink">Call Status Breakdown</p>
                  <p className="text-xs text-dss-muted">Current filtered view</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-dss-ink">{dashboardCalls.length}</span>
                <span className="ml-1.5 text-xs text-dss-muted">total calls</span>
              </div>
            </div>

            <div className="space-y-2.5 p-4">
              {[
                { label: 'No Call', count: noCallCount, color: 'bg-dss-border', textColor: 'text-dss-ink/80', icon: PhoneCall, pill: 'NO CALL', pillCls: 'bg-dss-canvas text-dss-ink/80 border-dss-border' },
                { label: 'Pending', count: pendingCount, color: 'bg-yellow-400', textColor: 'text-amber-800', icon: Clock, pill: 'PENDING', pillCls: 'bg-yellow-50 text-amber-800 border-yellow-200' },
                { label: 'No Answer', count: noAnswerCount, color: 'bg-orange-400', textColor: 'text-orange-800', icon: RotateCcw, pill: 'NO ANSWER', pillCls: 'bg-orange-50 text-orange-800 border-orange-200' },
                { label: 'Deal', count: dealTotalCount, color: 'bg-green-400', textColor: 'text-dss-success', icon: CheckCircle2, pill: 'DEAL', pillCls: 'bg-emerald-50/40 text-dss-success border-emerald-200/70' },
                { label: 'No Deal', count: noDealCount, color: 'bg-red-400', textColor: 'text-dss-danger', icon: XCircle, pill: 'NO DEAL', pillCls: 'bg-rose-50/40 text-dss-danger border-rose-200/70' },
              ].map(({ label, count, color, textColor, icon: Icon, pill, pillCls }) => (
                <div key={label} className="grid grid-cols-[128px_minmax(0,1fr)_48px_42px_82px] items-center gap-3 rounded-dss-sm border border-dss-border/50 bg-dss-canvas px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-dss-sm bg-dss-surface text-dss-muted">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="truncate text-sm font-medium text-dss-ink/80">{label}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-dss-canvas/80">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: pct(count) }} />
                  </div>
                  <span className="text-right text-xs font-semibold text-dss-muted">{pctValue(count)}%</span>
                  <span className={`text-right text-xs font-bold ${textColor}`}>{count}</span>
                  <span className={`rounded-md border px-2 py-1 text-center text-[10px] font-semibold ${pillCls}`}>{pill}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr] gap-3 border-t border-dss-border/70 p-4">
              <div className="rounded-dss border border-dss-border bg-dss-canvas p-4">
                <div className="flex items-center gap-4">
                  <div
                    className="h-24 w-24 rounded-full border border-dss-border"
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
                    <p className="text-sm font-semibold text-dss-ink">Overview</p>
                    <p className="mt-1 text-3xl font-bold text-dss-ink">{dashboardCalls.length}</p>
                    <p className="text-xs text-dss-muted">total calls</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-dss-accent">Today: <strong>{workedTodayCount}</strong></span>
                      <span className="text-cyan-800">Queue: <strong>{activeQueueCount}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-dss border border-dss-border bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-dss-sm border border-violet-200 bg-violet-50 text-violet-900">
                      <Target className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-dss-ink">Action Queue</p>
                  </div>
                  <p className="text-xs text-dss-muted">
                    Focus: <span className="font-semibold text-amber-900">Pending</span>, then <span className="font-semibold text-orange-900">No Answer</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                  {[
                    { label: 'Pending Follow-Up', count: pendingCount, icon: Clock, color: 'text-amber-900', border: 'border-amber-300', bg: 'bg-amber-50', priority: 'Medium' },
                    { label: 'Needs First Call', count: noCallCount, icon: PhoneCall, color: 'text-violet-900', border: 'border-violet-300', bg: 'bg-violet-50', priority: 'High' },
                    { label: 'No Answer Retry', count: noAnswerCount, icon: RotateCcw, color: 'text-orange-900', border: 'border-orange-300', bg: 'bg-orange-50', priority: 'Retry' },
                    { label: 'Stale / Aging', count: staleCount, icon: AlertTriangle, color: 'text-rose-900', border: 'border-rose-300', bg: 'bg-rose-50', priority: 'Review' },
                  ].map(({ label, count, icon: Icon, color, border, bg, priority }) => (
                    <div key={label} className={`rounded-dss-sm border ${border} ${bg} p-3`}>
                      <div className="mb-2 flex items-center justify-between">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span className={`text-xl font-bold ${color}`}>{count}</span>
                      </div>
                      <p className="min-h-[32px] text-xs font-semibold leading-tight text-dss-ink">{label}</p>
                      <p className={`mt-2 rounded-md border ${border} bg-white px-2 py-1 text-center text-[10px] font-semibold ${color}`}>{priority}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-dss border border-dss-border bg-white shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b border-dss-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-dss-sm border border-amber-200 bg-amber-50 text-amber-900">
                <Trophy className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-dss-ink">Today's Rankings</p>
            </div>
            <span className="rounded-full bg-dss-canvas px-2 py-0.5 text-[10px] font-semibold text-dss-muted">{leaderboard.length}</span>
          </div>
          <div className="divide-y divide-dss-border flex-1 overflow-hidden">
            {leaderboard.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-dss-muted">No deals logged today</p>
            ) : leaderboard.map((rep, idx) => {
              const m = medal(idx);
              const isMe = rep.id === currentUserId;
              return (
                <div key={rep.id} className={`flex items-center gap-3 px-4 py-3 transition ${isMe ? 'bg-dss-accent-soft/20 ring-1 ring-inset ring-dss-navy-soft/25' : 'hover:bg-dss-canvas'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${idx < 3 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-dss-canvas text-dss-muted'}`}>
                    {m || <span className="text-xs font-semibold">{idx + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isMe ? 'text-dss-accent' : 'text-dss-ink'}`}>
                      {rep.name}{isMe && <span className="ml-1 text-xs text-dss-accent font-normal">(you)</span>}
                    </p>
                    <p className="text-xs text-dss-muted">
                      {rep.amount > 0 ? formatCurrency(rep.amount) : <span className="italic">no deals yet</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-bold leading-none ${rep.dealCount > 0 ? 'text-dss-success' : 'text-dss-muted'}`}>{rep.dealCount}</p>
                    <p className="text-[10px] text-dss-muted mt-0.5 uppercase tracking-wider">deals</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-dss-surface rounded-dss-sm border border-dss-border px-4 py-3 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dss-muted" />
          <input type="text" placeholder={isRep ? 'Search all calls — App ID, Dealer, Customer, State…' : 'Search App ID, Dealer, Customer, State…'}
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink placeholder-dss-muted/70 focus:outline-none focus:ring-1 focus:ring-dss-accent/30" />
        </div>
        <select value={filterState} onChange={e => setFilterState(e.target.value)}
          className="px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30">
          <option value="">All States</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {isAdmin && (
          <select value={filterRep} onChange={e => setFilterRep(e.target.value)}
            className="px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30">
            <option value="">All Reps</option>
            {uniqueReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <div className="flex items-center border border-dss-border rounded-dss-sm overflow-hidden bg-dss-canvas">
          <div className="px-2 py-2 border-r border-dss-border">
            <Search className="w-3.5 h-3.5 text-dss-muted" />
          </div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 bg-dss-canvas text-xs text-dss-ink/80 focus:outline-none w-[120px]" />
          <span className="px-1 text-xs text-dss-muted">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 bg-dss-canvas text-xs text-dss-ink/80 focus:outline-none w-[120px]" />
        </div>
        {isAdmin && (
          <button onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 px-3 py-2 bg-dss-canvas hover:bg-dss-accent-soft border border-dss-border rounded-dss-sm text-sm text-dss-muted transition">
            {showCompleted ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="text-xs">{showCompleted ? 'Hiding' : `Hidden (${completedCount})`}</span>
          </button>
        )}
      </div>

      {isRep && isGlobalSearch && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-dss-accent-soft border border-dss-border rounded-dss-sm">
          <Search className="w-3.5 h-3.5 text-dss-accent flex-shrink-0" />
          <span className="text-xs text-dss-accent">Searching all calls — not limited to your queue</span>
          <button onClick={() => setSearchQuery('')}
            className="ml-auto flex items-center gap-1 text-xs text-dss-accent hover:text-dss-navy-soft transition">
            <X className="w-3.5 h-3.5" /> Clear search
          </button>
        </div>
      )}

      {/* ACTIVE REP FILTER BADGE */}
      {filterRep && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-dss-accent-soft bg-opacity-30 border border-dss-accent/30 rounded-dss-sm">
          <span className="text-xs text-dss-accent uppercase tracking-wider">Viewing rep</span>
          <span className="text-xs text-dss-ink font-medium">{selectedRepName}</span>
          <span className="text-xs text-dss-muted">— {repCallCount} calls assigned</span>
          <button onClick={() => setFilterRep('')}
            className="ml-auto flex items-center gap-1 text-xs text-dss-accent hover:text-dss-navy-soft transition">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* DEALER FILTER BADGE */}
      {dealerFilter && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-dss-accent-soft bg-opacity-30 border border-dss-accent/30 rounded-dss-sm">
          <span className="text-xs text-dss-accent uppercase tracking-wider">Filtered by dealer</span>
          <span className="text-xs text-dss-ink font-medium">{dealerFilter}</span>
          <button onClick={() => setDealerFilter('')}
            className="ml-auto flex items-center gap-1 text-xs text-dss-accent hover:text-dss-navy-soft transition">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* NEW CALLS LEGEND */}
      {calls.some(isNewUpload) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-dss-sm w-fit">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-800">New today — uploaded in today's batch</span>
        </div>
      )}

      {/* STATUS LAST CHIPS */}
      <div className="bg-dss-surface rounded-dss-sm border border-dss-border px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-dss-muted uppercase tracking-wider whitespace-nowrap w-20 flex-shrink-0">Status Last</span>
        <div className="w-px h-4 bg-dss-canvas flex-shrink-0" />
        <button onClick={() => setFilterNewOnly(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition ${
            filterNewOnly
              ? 'bg-amber-100 border-amber-300 text-amber-900'
              : 'bg-dss-canvas text-dss-muted border-dss-border hover:border-dss-border hover:text-dss-ink/80'
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
                  ? 'bg-dss-accent-soft text-dss-accent border-dss-accent/30'
                  : 'bg-dss-canvas text-dss-muted border-dss-border hover:border-dss-border hover:text-dss-ink/80'
              }`}>
              {active && <Check className="w-3 h-3 flex-shrink-0" />}
              {status}
            </button>
          );
        })}
        {filterStatusLast.size > 0 && (
          <button onClick={() => setFilterStatusLast(new Set())} className="ml-auto text-xs text-dss-accent hover:text-dss-accent">
            Clear
          </button>
        )}
      </div>

      {/* FU STATUS CHIPS */}
      <div className="bg-dss-surface rounded-dss-sm border border-dss-border px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-dss-muted uppercase tracking-wider whitespace-nowrap w-20 flex-shrink-0">FU Status</span>
        <div className="w-px h-4 bg-dss-canvas flex-shrink-0" />
        {fuStatusChips.map(({ label, onCls }) => {
          const active = filterFuStatuses.has(label);
          return (
            <button key={label} onClick={() => toggleFuStatusFilter(label)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition ${
                active
                  ? onCls
                  : 'bg-dss-canvas text-dss-muted border-dss-border hover:border-dss-border hover:text-dss-ink/80'
              }`}>
              {active
                ? <Check className="w-3 h-3 flex-shrink-0" />
                : <Plus className="w-3 h-3 flex-shrink-0" />}
              {label}
            </button>
          );
        })}
        {filterFuStatuses.size > 0 && (
          <button onClick={() => setFilterFuStatuses(new Set())} className="ml-auto text-xs text-dss-accent hover:text-dss-accent">
            Clear
          </button>
        )}
      </div>

      {/* MY QUEUE INFO BAR — reps only */}
      {isRep && !isGlobalSearch && (
        <div className="flex items-center gap-3 px-1 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-dss-accent-soft bg-opacity-20 border border-dss-navy-soft rounded-dss-sm">
            <span className="text-xs text-dss-accent font-medium">My Queue</span>
            <span className="text-xs text-dss-muted">{unworkedCalls.length} unworked</span>
            {filteredInCalls.length > 0 && (
              <span className="text-xs text-dss-muted">
                · {filteredInCalls.length} worked
              </span>
            )}
          </div>
          {effectiveAllowedStatuses.length > 0 ? (
            <span className="text-xs text-dss-muted">
              {effectiveAllowedStatuses.length} allowed status{effectiveAllowedStatuses.length !== 1 ? 'es' : ''}
            </span>
          ) : (
            <span className="text-xs text-amber-400">
              No status filter saved — re-assign from Assign tab to set allowed statuses
            </span>
          )}
        </div>
      )}

      {/* TABLE */}
      <div className="bg-dss-surface rounded-dss-sm border border-dss-border overflow-hidden">
        <div className="px-3 py-2 border-b border-dss-border flex items-center justify-between">
          <p className="text-sm font-semibold text-dss-ink">
            {sortedCalls.length} calls
            <span className="ml-2 font-normal text-dss-muted">· Page {currentPage} of {totalPages || 1}</span>
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4 text-dss-muted" />
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
              <ChevronRightIcon className="w-4 h-4 text-dss-muted" />
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
              <tr className="bg-dss-canvas border-b border-dss-border">
                <th className="px-2 py-2"></th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSort('applicationId'); }} className="flex items-center text-xs font-medium text-dss-muted uppercase tracking-wider hover:text-dss-ink">
                    App ID <SortIcon field="applicationId" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSort('dealerName'); }} className="flex items-center text-xs font-medium text-dss-muted uppercase tracking-wider hover:text-dss-ink">
                    Dealer <SortIcon field="dealerName" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSort('customerName'); }} className="flex items-center text-xs font-medium text-dss-muted uppercase tracking-wider hover:text-dss-ink">
                    Customer <SortIcon field="customerName" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSort('state'); }} className="flex items-center text-xs font-medium text-dss-muted uppercase tracking-wider hover:text-dss-ink">
                    St <SortIcon field="state" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSort('buyerFinal'); }} className="flex items-center text-xs font-medium text-dss-muted uppercase tracking-wider hover:text-dss-ink">
                    Amount <SortIcon field="buyerFinal" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSort('submittedDate'); }} className="flex items-center text-xs font-medium text-dss-muted uppercase tracking-wider hover:text-dss-ink">
                    Date <SortIcon field="submittedDate" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSort('statusLast'); }} className="flex items-center text-xs font-medium text-dss-muted uppercase tracking-wider hover:text-dss-ink whitespace-nowrap">
                    Status Last <SortIcon field="statusLast" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider whitespace-nowrap">Activity</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider whitespace-nowrap">FU Status</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {paginatedCalls.map((call) => {
                const callNotes = getCallNotes(call.id);
                const isExpanded = expandedRows.has(call.id);
                const isNew = isNewUpload(call);
                const isFilteredDealer = dealerFilter === call.dealerName;
                const activity = formatLastActivity(call);
                const isWorked = !!call.fuStatus;

                const rowCls = call.isDuplicate
                  ? 'cursor-pointer transition-colors bg-yellow-900 bg-opacity-10 hover:bg-yellow-900 hover:bg-opacity-20'
                  : isNew
                    ? 'cursor-pointer transition-colors bg-amber-50 border-l-2 border-l-amber-500 hover:bg-amber-100'
                    : isQueueView && !isWorked
                      ? 'cursor-pointer transition-colors hover:bg-dss-canvas border-l-2 border-l-dss-navy-soft'
                      : 'cursor-pointer transition-colors hover:bg-dss-canvas';

                const rows = [];

                rows.push(
                  <tr key={call.id} className={rowCls} onClick={() => toggleRow(call.id)}>

                    {/* Chevron */}
                    <td className="px-2 py-2 text-center">
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-dss-accent mx-auto" />
                        : <ChevronRight className="w-3.5 h-3.5 text-dss-muted mx-auto" />}
                    </td>

                    {/* App ID */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span
                          className="text-xs text-dss-accent font-medium hover:underline cursor-pointer truncate"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(call.applicationId); }}
                          title="Click to copy"
                        >
                          {call.applicationId}
                        </span>
                        {call.isDuplicate && (
                          <span className="px-1 bg-orange-50 text-orange-900 text-[9px] rounded border border-orange-300 font-medium flex-shrink-0">DUPE</span>
                        )}
                        {isNew && (
                          <span className="px-1 bg-amber-100 text-amber-900 text-[9px] rounded border border-amber-300 font-medium flex-shrink-0">NEW</span>
                        )}
                      </div>
                    </td>

                    {/* Dealer */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setDealerFilter(prev => prev === call.dealerName ? '' : call.dealerName)}
                        title={call.dealerName}
                        className={`text-xs text-left truncate block w-full transition hover:text-dss-accent ${
                          isFilteredDealer ? 'text-dss-accent font-medium' : 'text-dss-ink'
                        }`}
                      >
                        {call.dealerName}
                      </button>
                    </td>

                    {/* Customer */}
                    <td className="px-2 py-2">
                      {call.customerName
                        ? <span className="text-xs text-dss-muted truncate block w-full" title={call.customerName}>{call.customerName}</span>
                        : <span className="text-xs text-dss-muted">—</span>}
                    </td>

                    {/* State */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <span className="px-1.5 py-0 bg-dss-canvas text-dss-ink/80 text-[10px] rounded border border-dss-border">{call.state}</span>
                    </td>

                    {/* Amount */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      {editingAmount === call.id ? (
                        <div className="flex items-center gap-1">
                          <input type="text" value={tempAmount} onChange={e => setTempAmount(e.target.value)}
                            className="w-14 px-1 py-0.5 bg-dss-canvas border border-dss-border rounded text-xs text-dss-ink focus:outline-none"
                            autoFocus />
                          <button onClick={() => handleSaveAmount(call.id)} className="text-dss-success hover:text-dss-success"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingAmount(null)} className="text-dss-danger hover:text-dss-danger"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium text-dss-ink">
                            ${parseAmount(call.buyerFinal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                          <button onClick={() => { setEditingAmount(call.id); setTempAmount(call.buyerFinal); }}
                            className="text-dss-muted hover:text-dss-muted transition flex-shrink-0">
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-2 py-2 text-xs text-dss-muted whitespace-nowrap">{formatShortDate(call.submittedDate)}</td>

                    {/* Status Last */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      {editingStatusLast === call.id ? (
                        <div className="flex items-center gap-1">
                          <select value={tempStatusLast} onChange={e => setTempStatusLast(e.target.value)}
                            className="px-1 py-0.5 bg-dss-canvas border border-dss-border rounded text-xs text-dss-ink focus:outline-none"
                            autoFocus>
                            {allStatusLastOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => handleSaveStatusLast(call.id)} className="text-dss-success hover:text-dss-success flex-shrink-0"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingStatusLast(null)} className="text-dss-danger hover:text-dss-danger flex-shrink-0"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0 rounded-full text-[10px] border truncate ${getStatusLastStyle(call.statusLast)}`}>
                            {call.statusLast}
                          </span>
                          <button onClick={() => { setEditingStatusLast(call.id); setTempStatusLast(call.statusLast); }}
                            className="text-dss-muted hover:text-dss-muted transition flex-shrink-0">
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Last Activity */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <span className={`text-[10px] flex items-center gap-1 whitespace-nowrap ${activity.isToday ? 'text-emerald-700' : 'text-dss-muted'}`}>
                        {activity.text !== '—' && (
                          <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                          </svg>
                        )}
                        {activity.text}
                        {activity.byName && (
                          <span className="text-dss-muted truncate max-w-[72px]" title={activity.byName}>· {activity.byName}</span>
                        )}
                      </span>
                    </td>

                    {/* FU Status */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <select value={call.fuStatus || ''}
                        onChange={e => handleStatusChange(call.id, e.target.value as Call['fuStatus'])}
                        className="px-1.5 py-1 bg-dss-canvas border border-dss-border rounded text-xs text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30 w-full">
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
                            ? 'bg-dss-navy-soft text-white hover:bg-dss-navy'
                            : 'bg-violet-50 text-violet-800 hover:bg-violet-100'
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
                      <td colSpan={11} className="px-3 py-2 pl-8 pr-8 bg-dss-canvas">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-dss-muted uppercase tracking-wider">Notes ({callNotes.length})</p>
                          {callNotes.length === 0 ? (
                            <p className="text-sm text-dss-muted italic">No notes yet.</p>
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
                              className="flex-1 px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink placeholder-dss-muted/70 focus:outline-none focus:ring-1 focus:ring-dss-accent/30"
                              autoFocus />
                            <button onClick={() => handleAddNote(call.id)}
                              className="px-4 py-2 bg-dss-navy-soft hover:bg-dss-navy text-white rounded-dss-sm text-sm font-medium transition">
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

        <div className="px-3 py-2 border-t border-dss-border flex items-center justify-between">
          <p className="text-xs text-dss-muted">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, sortedCalls.length)}–{Math.min(currentPage * itemsPerPage, sortedCalls.length)} of {sortedCalls.length} calls
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4 text-dss-muted" />
            </button>
            <span className="text-xs text-dss-muted px-2">Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
              <ChevronRightIcon className="w-4 h-4 text-dss-muted" />
            </button>
          </div>
        </div>
      </div>

      {creditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setCreditModal(null)}>
          <div className="bg-dss-surface border border-dss-border rounded-dss w-full max-w-md p-5 shadow-sm"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-dss-ink mb-1">Credit this deal</h3>
            <p className="text-sm text-dss-muted mb-4">
              Set status to <span className="text-dss-success font-medium">{creditModal.newStatus}</span> and choose who gets credit.
            </p>
            <label className="block text-xs text-dss-muted uppercase tracking-wider mb-1.5">Credit to</label>
            <select
              value={creditModal.creditId}
              onChange={e => setCreditModal({ ...creditModal, creditId: e.target.value })}
              className="w-full px-3 py-2.5 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink mb-5 focus:outline-none focus:ring-2 focus:ring-dss-accent/30"
            >
              {creditOptions.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreditModal(null)}
                className="px-4 py-2 rounded-dss-sm border border-dss-border text-dss-ink/80 text-sm hover:bg-dss-canvas"
              >
                Cancel
              </button>
              <button
                onClick={applyCreditModal}
                className="px-4 py-2 rounded-dss-sm bg-dss-success hover:bg-green-500 text-white text-sm font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}