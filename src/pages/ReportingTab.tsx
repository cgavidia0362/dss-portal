import { useState, useEffect, useCallback } from 'react';
import { Target, Settings, ChevronLeft, ChevronRight, Calendar, Handshake, DollarSign, Phone, PhoneOff, Hourglass, MapPin, BarChart3, UserRound, BadgeCheck, Download, Edit2, Check, X, Search, ArrowUp, ArrowDown, ArrowUpDown, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { exportRowsToExcel } from '../lib/exportExcel';
import { dealCreditDbFields, resolveDealCredit, forceDealCreditDbFields, countsAsStickyBookedDeal, isDealCreditLocked, isDealLikeStatus } from '../lib/dealCredit';
import { getDealCreditOptions, resolveCreditName } from '../lib/systemReps';
import { manualDealMatchedByCall, buildManualCreditByApp, resolveCallDealCredit, normalizeAppId, manualDealMatchedByBookedCall } from '../lib/manualDealMatch';

interface Call {
  id: string;
  applicationId: string;
  dealerName: string;
  customerName?: string;
  state: string;
  fuStatus?: string;
  statusLast: string;
  submittedDate: string;
  dealDate?: Date;
  updatedAt: Date;
  createdAt?: Date;
  assignedTo?: string;
  assignedToName?: string;
  dealBy?: string;
  dealByName?: string;
  buyerFinal?: string;
}

interface StateGoal {
  id: string;
  state: string;
  month: number;
  year: number;
  monthlyGoal: number;
  fundingDays: number;
}

interface StateStats {
  state: string;
  totalApps: number;
  funded: number;
  totalAmount: number;
  monthlyGoal: number;
  fundingDays: number;
  dailyGoal: number;
  progress: number;
  neededPerDay: number;
  daysRemaining: number;
}

interface Goals {
  daily: { [repId: string]: number };
  team: number;
  weekly: number;
  monthly: number;
}

interface FundingData {
  [state: string]: { count: number; totalAmount: number };
}

interface MonthlyDailyDeal {
  id: string;
  appId: string;
  dealerName: string;
  customerName: string;
  addedBy: string;
  addedByName: string;
  fuStatus: string;
  dealDate: string;
  amount: string;
  state: string;
  createdAt?: string;
}

interface RepDealRow {
  key: string;
  source: 'call' | 'manual';
  id: string;
  applicationId: string;
  dealerName: string;
  customerName: string;
  state: string;
  amount: number;
  date: Date;
  statusLast: string;
  activity: string;
  fuStatus: string;
  note: string;
  repName: string;
  creditId?: string;
}

interface ReportingTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  calls: Call[];
  setCalls: React.Dispatch<React.SetStateAction<any[]>>;
  goals: Goals;
  setGoals: (goals: Goals) => void;
  fundingData: FundingData;
  todayDailyDeals?: { id: string; addedBy: string; fuStatus: string; dealDate: string; amount: string; state: string }[];
  onRefreshDailyDeals?: () => void;
  users?: { id: string; name: string; role?: string }[];
}

type TimePeriod = 'daily' | 'weekly' | 'monthly';

const getTodayString = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const parseDateString = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const getRangeBounds = (startStr: string, endStr: string): { start: Date; end: Date } => {
  const start = parseDateString(startStr);
  start.setHours(0, 0, 0, 0);
  const end = parseDateString(endStr);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const formatRangeLabel = (startStr: string, endStr: string) => {
  if (startStr === endStr) {
    return parseDateString(startStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const fmt = (s: string) => parseDateString(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(startStr)} – ${fmt(endStr)}, ${parseDateString(endStr).getFullYear()}`;
};

interface RepPerformanceRow {
  repId: string;
  repName: string;
  totalCalls: number;
  noCall: number;
  pending: number;
  noAnswer: number;
  deals: number;
  confirmedDeals: number;
  conversionRate: string;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FU_OPTIONS = ['Deal', 'Confirmed Deal', 'No Deal', 'Pending', 'No Answer', 'Closed', 'Duplicates', 'Follow Up'];

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const isDealStatus = (s?: string) => s === 'Deal' || s === 'Confirmed Deal';

const formatLastActivity = (call: Call): string => {
  if (!call.updatedAt) return '—';
  if (call.createdAt) {
    const diffMs = Math.abs(call.updatedAt.getTime() - new Date(call.createdAt).getTime());
    if (diffMs < 5 * 60 * 1000) return '—';
  }
  const date = new Date(call.updatedAt);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' AM', 'am').replace(' PM', 'pm');
  if (isToday) return `Today ${timeStr}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function ReportingTab({
  currentUserId, currentUserRole, calls, setCalls, goals, setGoals, fundingData,
  todayDailyDeals, onRefreshDailyDeals, users = [],
}: ReportingTabProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [stateGoals, setStateGoals] = useState<StateGoal[]>([]);
  const [stateStats, setStateStats] = useState<StateStats[]>([]);
  const [monthlyDailyDeals, setMonthlyDailyDeals] = useState<MonthlyDailyDeal[]>([]);
  const [rangeDailyDeals, setRangeDailyDeals] = useState<MonthlyDailyDeal[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [goalForm, setGoalForm] = useState({ monthlyGoal: '', fundingDays: '' });
  const [showTeamGoals, setShowTeamGoals] = useState(false);
  const [teamGoalInput, setTeamGoalInput] = useState({
    daily: goals.team.toString(),
    weekly: goals.weekly.toString(),
    monthly: goals.monthly.toString(),
  });
  const [rangeStart, setRangeStart] = useState(getTodayString);
  const [rangeEnd, setRangeEnd] = useState(getTodayString);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [repDealsModal, setRepDealsModal] = useState<{
    repId?: string;
    repName: string;
    dealType: 'deal' | 'confirmed';
  } | null>(null);
  const [repDealsRows, setRepDealsRows] = useState<RepDealRow[]>([]);
  const [repDealsLoading, setRepDealsLoading] = useState(false);
  const [repDealsSearch, setRepDealsSearch] = useState('');
  const [repDealsStatusFilter, setRepDealsStatusFilter] = useState<string>('all');
  const [repDealsSortKey, setRepDealsSortKey] = useState<keyof RepDealRow>('date');
  const [repDealsSortDir, setRepDealsSortDir] = useState<'asc' | 'desc'>('desc');
  const [editingRepDealAmount, setEditingRepDealAmount] = useState<string | null>(null);
  const [tempRepDealAmount, setTempRepDealAmount] = useState('');
  const [creditModal, setCreditModal] = useState<{
    row: RepDealRow;
    newStatus: string;
    creditId: string;
  } | null>(null);
  const canForceCredit = currentUserRole === 'admin' || currentUserRole === 'manager';
  const creditOptions = getDealCreditOptions(users, currentUserRole);
  const [repSortKey, setRepSortKey] = useState<keyof RepPerformanceRow>('deals');
  const [repSortDir, setRepSortDir] = useState<'asc' | 'desc'>('desc');

  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentDay = now.getDate();
  const isViewingCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;

  const viewMonthLabel = `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`;

  const mapDailyDealRow = (d: any): MonthlyDailyDeal => ({
    id: d.id,
    appId: d.app_id,
    dealerName: d.dealer_name || '',
    customerName: d.customer_name || '',
    addedBy: d.added_by || '',
    addedByName: d.added_by_name || '',
    fuStatus: d.fu_status || '',
    dealDate: d.deal_date,
    amount: d.amount || '0',
    state: d.state || '',
    createdAt: d.created_at || undefined,
  });

  const fetchMonthlyDailyDeals = useCallback(async () => {
    const start = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const end = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { data } = await supabase
      .from('daily_deals')
      .select('id, app_id, dealer_name, customer_name, added_by, added_by_name, fu_status, deal_date, amount, state, created_at')
      .gte('deal_date', start)
      .lte('deal_date', end);
    if (data) {
      setMonthlyDailyDeals(data.map(mapDailyDealRow));
    }
  }, [viewYear, viewMonth]);

  const fetchRangeDailyDeals = useCallback(async () => {
    const { data } = await supabase
      .from('daily_deals')
      .select('id, app_id, dealer_name, customer_name, added_by, added_by_name, fu_status, deal_date, amount, state, created_at')
      .gte('deal_date', rangeStart)
      .lte('deal_date', rangeEnd);
    if (data) setRangeDailyDeals(data.map(mapDailyDealRow));
  }, [rangeStart, rangeEnd]);

  const fetchStateGoals = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('state_goals').select('*').eq('month', viewMonth).eq('year', viewYear);
      if (fetchError) throw fetchError;
      if (data) {
        setStateGoals(data.map((g: any) => ({
          id: g.id, state: g.state, month: g.month, year: g.year,
          monthlyGoal: g.monthly_goal, fundingDays: g.funding_days,
        })));
      } else {
        setStateGoals([]);
      }
    } catch (err: any) { console.error('Error fetching goals:', err); }
  }, [viewMonth, viewYear]);

  useEffect(() => { fetchStateGoals(); fetchMonthlyDailyDeals(); }, [fetchStateGoals, fetchMonthlyDailyDeals]);
  useEffect(() => { fetchRangeDailyDeals(); }, [fetchRangeDailyDeals, todayDailyDeals]);

  // Heal credited reps from Daily Deals; clear Accepted→Deal orphans with no rep
  useEffect(() => {
    if (!calls.length) return;

    const manuals = [...rangeDailyDeals, ...monthlyDailyDeals];
    const manualByApp = buildManualCreditByApp(manuals);

    const toHeal = calls.filter(c => {
      if (c.fuStatus !== 'Deal' && c.fuStatus !== 'Confirmed Deal') return false;
      if (c.dealBy || c.assignedTo) return false;
      return !!manualByApp.get(normalizeAppId(c.applicationId))?.addedBy;
    });

    const toClean = calls.filter(c => {
      if (c.fuStatus !== 'Deal' && c.fuStatus !== 'Confirmed Deal') return false;
      if (c.dealBy || c.assignedTo) return false;
      if (manualByApp.get(normalizeAppId(c.applicationId))?.addedBy) return false;
      return (c.statusLast || '').toLowerCase().includes('accept');
    });

    if (!toHeal.length && !toClean.length) return;

    let cancelled = false;
    (async () => {
      for (const call of toHeal) {
        if (cancelled) return;
        const credit = resolveCallDealCredit(call, manualByApp);
        if (!credit?.fromManual) continue;
        const { error } = await supabase.from('calls').update({
          deal_by: credit.id,
          deal_by_name: credit.name,
          assigned_to: call.assignedTo || credit.id,
          assigned_to_name: call.assignedToName || credit.name,
        }).eq('id', call.id);
        if (!error) {
          setCalls(prev => prev.map(c => c.id === call.id
            ? {
              ...c,
              dealBy: credit.id,
              dealByName: credit.name,
              assignedTo: c.assignedTo || credit.id,
              assignedToName: c.assignedToName || credit.name,
            }
            : c
          ));
        }
      }

      if (toClean.length > 0 && !cancelled) {
        const ids = toClean.map(c => c.id);
        const { error } = await supabase.from('calls').update({
          fu_status: null,
          deal_date: null,
        }).in('id', ids);
        if (!error) {
          setCalls(prev => prev.map(c =>
            ids.includes(c.id)
              ? { ...c, fuStatus: undefined, dealDate: undefined }
              : c
          ));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [calls, rangeDailyDeals, monthlyDailyDeals, setCalls]);

  const countBusinessDaysElapsed = (year: number, month: number, toDay: number): number => {
    let count = 0;
    for (let d = 1; d <= toDay; d++) {
      const date = new Date(year, month - 1, d);
      const dow = date.getDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  };

  const calculateStateStats = useCallback(() => {
    const monthStart = new Date(viewYear, viewMonth - 1, 1);
    const monthEnd = new Date(viewYear, viewMonth, 0, 23, 59, 59, 999);
    const lastDayOfMonth = monthEnd.getDate();
    const refDay = isViewingCurrentMonth ? currentDay : lastDayOfMonth;

    const states = [...new Set([
      ...calls.map(c => c.state),
      ...monthlyDailyDeals.map(d => d.state),
    ].filter(Boolean))].sort();

    const stats: StateStats[] = states.map(state => {
      const stateCalls = calls.filter(c => c.state === state);
      const totalApps = stateCalls.length;

      let funded = 0;
      let totalAmount = 0;

      if (isViewingCurrentMonth && fundingData[state]) {
        funded = fundingData[state].count;
        totalAmount = fundingData[state].totalAmount;
      } else {
        const callFunded = stateCalls.filter(call => {
          if (!call.dealDate || !isDealStatus(call.fuStatus)) return false;
          const d = new Date(call.dealDate);
          return d >= monthStart && d <= monthEnd;
        });
        const manualFunded = monthlyDailyDeals.filter(d =>
          d.state === state && isDealStatus(d.fuStatus)
        );
        const seenApps = new Set<string>();
        callFunded.forEach(c => {
          if (!seenApps.has(c.applicationId)) {
            seenApps.add(c.applicationId);
            funded++;
            totalAmount += parseAmount(c.buyerFinal || '0');
          }
        });
        manualFunded.forEach(d => {
          if (!seenApps.has(d.appId)) {
            seenApps.add(d.appId);
            funded++;
            totalAmount += parseAmount(d.amount);
          }
        });
      }

      const stateGoal = stateGoals.find(g => g.state === state);
      const monthlyGoal = stateGoal?.monthlyGoal || 0;
      const fundingDays = stateGoal?.fundingDays || 20;
      const dailyGoal = monthlyGoal > 0 ? Math.round(monthlyGoal / fundingDays) : 0;
      const progress = monthlyGoal > 0 ? (funded / monthlyGoal) * 100 : 0;
      const daysElapsed = countBusinessDaysElapsed(viewYear, viewMonth, refDay);
      const daysRemaining = isViewingCurrentMonth
        ? Math.max(fundingDays - daysElapsed, 0)
        : 0;
      const neededPerDay = monthlyGoal > 0 && daysRemaining > 0
        ? Math.ceil((monthlyGoal - funded) / daysRemaining) : 0;

      return { state, totalApps, funded, totalAmount, monthlyGoal, fundingDays, dailyGoal, progress, neededPerDay, daysRemaining };
    });
    setStateStats(stats);
  }, [calls, monthlyDailyDeals, stateGoals, fundingData, viewYear, viewMonth, isViewingCurrentMonth, currentDay]);

  useEffect(() => { calculateStateStats(); }, [calculateStateStats]);

  const getPeriodBounds = (p: TimePeriod): { start: Date; end: Date } => {
    if (isViewingCurrentMonth) {
      if (p === 'daily') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { start, end: now };
      }
      if (p === 'weekly') {
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        return { start, end: now };
      }
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now };
    }

    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const monthEnd = new Date(viewYear, viewMonth - 1, lastDay, 23, 59, 59, 999);
    const monthStart = new Date(viewYear, viewMonth - 1, 1);

    if (p === 'monthly') return { start: monthStart, end: monthEnd };
    if (p === 'daily') {
      const start = new Date(viewYear, viewMonth - 1, lastDay);
      start.setHours(0, 0, 0, 0);
      return { start, end: monthEnd };
    }
    const start = new Date(monthEnd);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    if (start < monthStart) start.setTime(monthStart.getTime());
    return { start, end: monthEnd };
  };

  const isInBounds = (date: Date, bounds: { start: Date; end: Date }) =>
    date >= bounds.start && date <= bounds.end;

  const rangeBounds = getRangeBounds(rangeStart, rangeEnd);
  const rangeLabel = formatRangeLabel(rangeStart, rangeEnd);

  const filterManualDealsByRange = (
    bounds: { start: Date; end: Date },
    opts?: { requireDealStatus?: boolean },
  ) => {
    const requireDealStatus = opts?.requireDealStatus !== false;
    const dealMap = new Map<string, MonthlyDailyDeal>();
    rangeDailyDeals.forEach(d => dealMap.set(d.id, d));

    (todayDailyDeals || []).forEach(d => {
      const existing = dealMap.get(d.id) || monthlyDailyDeals.find(m => m.id === d.id);
      if (existing) {
        dealMap.set(d.id, { ...existing, fuStatus: d.fuStatus });
      } else if (d.dealDate && isInBounds(parseDateString(d.dealDate), bounds)) {
        dealMap.set(d.id, {
          id: d.id, appId: '', dealerName: '', customerName: '',
          addedBy: d.addedBy, addedByName: '', fuStatus: d.fuStatus,
          dealDate: d.dealDate, amount: d.amount, state: d.state,
        });
      }
    });

    return Array.from(dealMap.values()).filter(d => {
      if (!d.dealDate) return false;
      const parts = d.dealDate.split('-');
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (!isInBounds(date, bounds)) return false;
      if (requireDealStatus && !isDealStatus(d.fuStatus)) return false;
      return true;
    });
  };

  const getAmount = (call: Call) => parseAmount(call.buyerFinal || '0');

  const calculateRepPerformance = (bounds: { start: Date; end: Date }): RepPerformanceRow[] => {
    const repMap = new Map<string, RepPerformanceRow>();
    // Sticky manuals: keep deal_date in range even after status leaves Deal/Confirmed
    const stickyManuals = filterManualDealsByRange(bounds, { requireDealStatus: false });
    const manualByApp = buildManualCreditByApp(stickyManuals);

    const ensureRep = (id: string, name: string) => {
      if (!repMap.has(id)) {
        repMap.set(id, {
          repId: id, repName: name,
          totalCalls: 0, noCall: 0, pending: 0, noAnswer: 0,
          deals: 0, confirmedDeals: 0, conversionRate: '0',
        });
      }
      return repMap.get(id)!;
    };

    calls.forEach(call => {
      if (!call.assignedTo || !call.assignedToName) return;
      if (!isInBounds(new Date(call.updatedAt), bounds)) return;
      const row = ensureRep(call.assignedTo, call.assignedToName);
      row.totalCalls++;
      if (!call.fuStatus || call.fuStatus === '') row.noCall++;
      if (call.fuStatus === 'Pending') row.pending++;
      if (call.fuStatus === 'No Answer') row.noAnswer++;
    });

    // Sticky booked deals: Deal/Confirmed always; other statuses only after 24h lock
    calls.forEach(call => {
      if (!countsAsStickyBookedDeal(call.fuStatus, call.dealDate)) return;
      const dealDate = call.dealDate ? new Date(call.dealDate) : null;
      if (!dealDate || !isInBounds(dealDate, bounds)) return;
      const credit = resolveCallDealCredit(call, manualByApp);
      if (!credit) return;
      const row = ensureRep(credit.id, credit.name);
      row.deals++;
      if (call.fuStatus === 'Confirmed Deal') row.confirmedDeals++;
    });

    stickyManuals.forEach(deal => {
      if (!deal.addedBy) return;
      const lockStart = deal.createdAt || deal.dealDate;
      if (!countsAsStickyBookedDeal(deal.fuStatus, lockStart)) return;
      if (manualDealMatchedByBookedCall(deal, calls, date => isInBounds(date, bounds))) return;
      const row = ensureRep(deal.addedBy, deal.addedByName || 'Unknown');
      row.deals++;
      if (deal.fuStatus === 'Confirmed Deal') row.confirmedDeals++;
    });

    const rows = Array.from(repMap.values());
    rows.forEach(r => {
      // Confirmed is a subset of sticky Deals
      r.conversionRate = r.deals > 0 ? ((r.confirmedDeals / r.deals) * 100).toFixed(1) : '0';
    });
    return rows.sort((a, b) => b.deals - a.deals || b.confirmedDeals - a.confirmedDeals);
  };

  const repPerformanceRaw = calculateRepPerformance(rangeBounds);

  const toggleRepSort = (key: keyof RepPerformanceRow) => {
    if (repSortKey === key) {
      setRepSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRepSortKey(key);
      setRepSortDir(key === 'repName' ? 'asc' : 'desc');
    }
  };

  const repPerformance = [...repPerformanceRaw].sort((a, b) => {
    const dir = repSortDir === 'asc' ? 1 : -1;
    if (repSortKey === 'repName') {
      return a.repName.localeCompare(b.repName) * dir;
    }
    if (repSortKey === 'conversionRate') {
      return (parseFloat(a.conversionRate) - parseFloat(b.conversionRate)) * dir;
    }
    const av = Number(a[repSortKey]) || 0;
    const bv = Number(b[repSortKey]) || 0;
    return (av - bv) * dir;
  });

  const teamTotals = repPerformanceRaw.reduce(
    (acc, rep) => ({
      totalCalls: acc.totalCalls + rep.totalCalls,
      noCall: acc.noCall + rep.noCall,
      pending: acc.pending + rep.pending,
      noAnswer: acc.noAnswer + rep.noAnswer,
      deals: acc.deals + rep.deals,
      confirmedDeals: acc.confirmedDeals + rep.confirmedDeals,
    }),
    { totalCalls: 0, noCall: 0, pending: 0, noAnswer: 0, deals: 0, confirmedDeals: 0 },
  );
  // Rep Performance / Team row: sticky conversion
  const teamConvRate = teamTotals.deals > 0
    ? ((teamTotals.confirmedDeals / teamTotals.deals) * 100).toFixed(1)
    : '0';

  // Sticky all booked deals (same set as Team Total Deals)
  const stickyManuals = filterManualDealsByRange(rangeBounds, { requireDealStatus: false });
  const stickyManualByApp = buildManualCreditByApp(stickyManuals);
  const stickyDealCalls = calls.filter(c => {
    if (!countsAsStickyBookedDeal(c.fuStatus, c.dealDate)) return false;
    if (!c.dealDate || !isInBounds(new Date(c.dealDate), rangeBounds)) return false;
    return !!resolveCallDealCredit(c, stickyManualByApp);
  });
  const uniqueStickyManual = stickyManuals.filter(d => {
    const lockStart = d.createdAt || d.dealDate;
    if (!countsAsStickyBookedDeal(d.fuStatus, lockStart)) return false;
    return !manualDealMatchedByBookedCall(d, calls, date => isInBounds(date, rangeBounds));
  });
  const kpiAllDeals = stickyDealCalls.length + uniqueStickyManual.length;
  const allDealsAmount =
    stickyDealCalls.reduce((sum, c) => sum + getAmount(c), 0)
    + uniqueStickyManual.reduce((sum, d) => sum + parseAmount(d.amount), 0);

  const kpiDealsOnWay =
    stickyDealCalls.filter(c => c.fuStatus === 'Deal').length
    + uniqueStickyManual.filter(d => d.fuStatus === 'Deal').length;
  const kpiConfirmed =
    stickyDealCalls.filter(c => c.fuStatus === 'Confirmed Deal').length
    + uniqueStickyManual.filter(d => d.fuStatus === 'Confirmed Deal').length;
  const kpiConvRate = kpiAllDeals > 0
    ? ((kpiConfirmed / kpiAllDeals) * 100).toFixed(1)
    : '0';
  const dealsOnTheWayAmount =
    stickyDealCalls.filter(c => c.fuStatus === 'Deal').reduce((sum, c) => sum + getAmount(c), 0)
    + uniqueStickyManual.filter(d => d.fuStatus === 'Deal').reduce((sum, d) => sum + parseAmount(d.amount), 0);
  const confirmedDealAmount =
    stickyDealCalls.filter(c => c.fuStatus === 'Confirmed Deal').reduce((sum, c) => sum + getAmount(c), 0)
    + uniqueStickyManual.filter(d => d.fuStatus === 'Confirmed Deal').reduce((sum, d) => sum + parseAmount(d.amount), 0);
  const rangeAvgDeal = kpiAllDeals > 0
    ? allDealsAmount / kpiAllDeals
    : 0;

  const dealsByState = [...stickyDealCalls, ...uniqueStickyManual.map(d => ({
    state: d.state, amount: parseAmount(d.amount),
  }))].reduce((acc: { state: string; deals: number; amount: number }[], item: any) => {
    const state = item.state || '—';
    const amount = typeof item.amount === 'number' ? item.amount : getAmount(item);
    const ex = acc.find(i => i.state === state);
    if (ex) { ex.deals++; ex.amount += amount; }
    else acc.push({ state, deals: 1, amount });
    return acc;
  }, []).sort((a, b) => b.deals - a.deals);

  const rangeDealCount = kpiAllDeals;

  const monthBounds = getPeriodBounds('monthly');
  const monthDealCalls = calls.filter(c => {
    if (!isDealStatus(c.fuStatus) || !c.dealDate) return false;
    return isInBounds(new Date(c.dealDate), monthBounds);
  });
  const monthManualDeals = monthlyDailyDeals.filter(d => {
    if (!isDealStatus(d.fuStatus) || !d.dealDate) return false;
    const parts = d.dealDate.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return isInBounds(date, monthBounds);
  });
  const uniqueMonthManual = monthManualDeals.filter(d =>
    !manualDealMatchedByCall(d, calls, date => isInBounds(date, monthBounds)),
  );
  const monthTotalDeals = monthDealCalls.length + uniqueMonthManual.length;

  const todayBounds = getPeriodBounds('daily');
  const csvDealsToday = calls.filter(c =>
    isDealStatus(c.fuStatus) && c.dealDate && isInBounds(new Date(c.dealDate), todayBounds)
  ).length;
  const manualDealsToday = isViewingCurrentMonth
    ? (todayDailyDeals || []).filter(d => isDealStatus(d.fuStatus)).length
    : filterManualDealsByRange(todayBounds).length;
  const dealsToday = csvDealsToday + manualDealsToday;
  const teamGoalPct = goals.team > 0 ? Math.min((dealsToday / goals.team) * 100, 100) : 0;
  const monthlyGoalPct = goals.monthly > 0 ? Math.min((monthTotalDeals / goals.monthly) * 100, 100) : 0;

  const openRepDealsModal = async (
    repId: string | undefined,
    repName: string,
    dealType: 'deal' | 'confirmed',
  ) => {
    setRepDealsModal({ repId, repName, dealType });
    setRepDealsLoading(true);
    setRepDealsRows([]);
    setRepDealsSearch('');
    setRepDealsStatusFilter('all');
    setRepDealsSortKey('date');
    setRepDealsSortDir('desc');
    setEditingRepDealAmount(null);
    setTempRepDealAmount('');

    const bounds = rangeBounds;
    const manualsInRange = dealType === 'deal'
      ? filterManualDealsByRange(bounds, { requireDealStatus: false })
      : filterManualDealsByRange(bounds);
    const manualByApp = buildManualCreditByApp(manualsInRange);

    // Deals popup: sticky booked deals (24h lock). Confirmed: Confirmed only.
    const repCalls = calls.filter(c => {
      if (dealType === 'confirmed') {
        if (c.fuStatus !== 'Confirmed Deal') return false;
      } else if (!countsAsStickyBookedDeal(c.fuStatus, c.dealDate)) {
        return false;
      }
      if (!c.dealDate || !isInBounds(new Date(c.dealDate), bounds)) return false;
      const credit = resolveCallDealCredit(c, manualByApp);
      if (!credit) return false;
      if (repId && credit.id !== repId) return false;
      return true;
    });

    const repManual = manualsInRange.filter(d => {
      if (dealType === 'confirmed' && d.fuStatus !== 'Confirmed Deal') return false;
      if (dealType === 'deal') {
        const lockStart = d.createdAt || d.dealDate;
        if (!countsAsStickyBookedDeal(d.fuStatus, lockStart)) return false;
      }
      if (repId && d.addedBy !== repId) return false;
      const matched = dealType === 'deal'
        ? manualDealMatchedByBookedCall(d, calls, date => isInBounds(date, bounds))
        : manualDealMatchedByCall(d, calls, date => isInBounds(date, bounds));
      if (matched) return false;
      return true;
    });
    const seenApps = new Set(repCalls.map(c => normalizeAppId(c.applicationId)));

    const callIds = repCalls.map(c => c.id);
    const manualIds = repManual.map(d => d.id);
    const notesMap: Record<string, string> = {};

    if (callIds.length > 0) {
      const { data } = await supabase.from('call_notes').select('call_id, note_text, created_at')
        .in('call_id', callIds).order('created_at', { ascending: false });
      data?.forEach((n: any) => {
        if (!notesMap[`call-${n.call_id}`]) notesMap[`call-${n.call_id}`] = n.note_text;
      });
    }
    if (manualIds.length > 0) {
      const { data } = await supabase.from('daily_deal_notes').select('deal_id, note_text, created_at')
        .in('deal_id', manualIds).order('created_at', { ascending: false });
      data?.forEach((n: any) => {
        if (!notesMap[`manual-${n.deal_id}`]) notesMap[`manual-${n.deal_id}`] = n.note_text;
      });
    }

    const rows: RepDealRow[] = repCalls.map(c => {
      const credit = resolveCallDealCredit(c, manualByApp);
      return {
        key: `call-${c.id}`,
        source: 'call' as const,
        id: c.id,
        applicationId: c.applicationId,
        dealerName: c.dealerName,
        customerName: c.customerName || '—',
        state: c.state,
        amount: getAmount(c),
        date: c.dealDate ? new Date(c.dealDate) : new Date(c.updatedAt),
        statusLast: c.statusLast || '—',
        activity: formatLastActivity(c),
        fuStatus: c.fuStatus || '',
        note: notesMap[`call-${c.id}`] || '—',
        repName: credit?.name || 'Unknown',
        creditId: credit?.id || c.dealBy,
      };
    });

    repManual.forEach(d => {
      const appKey = d.appId.trim().toLowerCase();
      if (appKey && seenApps.has(appKey)) return;
      if (appKey) seenApps.add(appKey);
      const parts = d.dealDate.split('-');
      rows.push({
        key: `manual-${d.id}`,
        source: 'manual',
        id: d.id,
        applicationId: d.appId,
        dealerName: d.dealerName,
        customerName: d.customerName || '—',
        state: d.state,
        amount: parseAmount(d.amount),
        date: new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])),
        statusLast: '—',
        activity: '—',
        fuStatus: d.fuStatus,
        note: notesMap[`manual-${d.id}`] || '—',
        repName: d.addedByName || '—',
        creditId: d.addedBy,
      });
    });

    rows.sort((a, b) => b.date.getTime() - a.date.getTime());
    setRepDealsRows(rows);
    setRepDealsLoading(false);
  };

  const handleRepDealAmountSave = async (row: RepDealRow) => {
    const cleaned = tempRepDealAmount.trim() || '0';
    const numeric = parseAmount(cleaned);

    if (row.source === 'call') {
      setCalls(prev => prev.map(c => c.id === row.id
        ? { ...c, buyerFinal: cleaned, updatedAt: new Date() }
        : c
      ));
      await supabase.from('calls').update({
        buyer_final: cleaned,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
    } else {
      await supabase.from('daily_deals').update({ amount: cleaned }).eq('id', row.id);
      setMonthlyDailyDeals(prev => prev.map(d => d.id === row.id ? { ...d, amount: cleaned } : d));
      setRangeDailyDeals(prev => prev.map(d => d.id === row.id ? { ...d, amount: cleaned } : d));
      onRefreshDailyDeals?.();
      fetchRangeDailyDeals();
    }

    setRepDealsRows(prev => prev.map(r => r.key === row.key ? { ...r, amount: numeric } : r));
    setEditingRepDealAmount(null);
    setTempRepDealAmount('');
  };

  const handleRepDealStatusChange = async (row: RepDealRow, newStatus: string) => {
    if (canForceCredit && isDealLikeStatus(newStatus)) {
      setCreditModal({
        row,
        newStatus,
        creditId: row.creditId || currentUserId,
      });
      return;
    }

    if (row.source === 'call') {
      const existing = calls.find(c => c.id === row.id);
      const credit = resolveDealCredit(newStatus, {
        dealBy: existing?.dealBy,
        dealByName: existing?.dealByName,
        dealDate: existing?.dealDate,
      }, { id: currentUserId, name: undefined });
      setCalls(prev => prev.map(c => c.id === row.id
        ? {
          ...c,
          fuStatus: newStatus,
          updatedAt: new Date(),
          dealDate: credit.dealDate,
          dealBy: credit.dealBy,
          dealByName: credit.dealByName,
        }
        : c
      ));
      await supabase.from('calls').update({
        ...dealCreditDbFields(newStatus, {
          dealBy: existing?.dealBy,
          dealByName: existing?.dealByName,
          dealDate: existing?.dealDate,
        }),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);

      setRepDealsRows(prev => {
        if (repDealsModal?.dealType === 'confirmed' && newStatus !== 'Confirmed Deal') {
          return prev.filter(r => r.key !== row.key);
        }
        // Early undo within 24h clears deal_date → leave sticky Deals list
        if (repDealsModal?.dealType === 'deal' && !countsAsStickyBookedDeal(newStatus, credit.dealDate)) {
          return prev.filter(r => r.key !== row.key);
        }
        return prev.map(r => r.key === row.key ? { ...r, fuStatus: newStatus } : r);
      });
    } else {
      const existing = [...rangeDailyDeals, ...monthlyDailyDeals].find(d => d.id === row.id);
      const lockStart = existing?.createdAt || existing?.dealDate || row.date;
      const earlyUndo = !isDealLikeStatus(newStatus) && !isDealCreditLocked(lockStart);
      const updatePayload: Record<string, string | null> = { fu_status: newStatus };
      // Drop mistyped Manual deals from sticky reporting within the grace window
      if (earlyUndo) updatePayload.deal_date = null;

      await supabase.from('daily_deals').update(updatePayload).eq('id', row.id);
      const patch = (d: MonthlyDailyDeal) => d.id === row.id
        ? { ...d, fuStatus: newStatus, ...(earlyUndo ? { dealDate: '' } : {}) }
        : d;
      setMonthlyDailyDeals(prev => prev.map(patch));
      setRangeDailyDeals(prev => prev.map(patch));
      onRefreshDailyDeals?.();
      fetchRangeDailyDeals();

      setRepDealsRows(prev => {
        if (repDealsModal?.dealType === 'confirmed' && newStatus !== 'Confirmed Deal') {
          return prev.filter(r => r.key !== row.key);
        }
        if (repDealsModal?.dealType === 'deal' && earlyUndo) {
          return prev.filter(r => r.key !== row.key);
        }
        return prev.map(r => r.key === row.key ? { ...r, fuStatus: newStatus } : r);
      });
    }
  };

  const applyRepDealCreditModal = async () => {
    if (!creditModal) return;
    const { row, newStatus, creditId } = creditModal;
    const creditName = resolveCreditName(creditId, creditOptions);

    if (row.source === 'call') {
      const existing = calls.find(c => c.id === row.id);
      const fields = forceDealCreditDbFields(newStatus, { id: creditId, name: creditName }, existing?.dealDate);
      const dealDate = fields.deal_date ? new Date(fields.deal_date) : existing?.dealDate;
      setCalls(prev => prev.map(c => c.id === row.id
        ? {
          ...c,
          fuStatus: newStatus,
          updatedAt: new Date(),
          dealDate,
          dealBy: creditId,
          dealByName: creditName,
        }
        : c
      ));
      await supabase.from('calls').update({
        ...fields,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);

      setRepDealsRows(prev => {
        if (repDealsModal?.dealType === 'confirmed' && newStatus !== 'Confirmed Deal') {
          return prev.filter(r => r.key !== row.key);
        }
        if (repDealsModal?.dealType === 'deal' && !countsAsStickyBookedDeal(newStatus, dealDate)) {
          return prev.filter(r => r.key !== row.key);
        }
        return prev.map(r => r.key === row.key
          ? { ...r, fuStatus: newStatus, repName: creditName, creditId }
          : r);
      });
    } else {
      await supabase.from('daily_deals').update({
        fu_status: newStatus,
        added_by: creditId,
        added_by_name: creditName,
      }).eq('id', row.id);
      const patch = (d: MonthlyDailyDeal) => d.id === row.id
        ? { ...d, fuStatus: newStatus, addedBy: creditId, addedByName: creditName }
        : d;
      setMonthlyDailyDeals(prev => prev.map(patch));
      setRangeDailyDeals(prev => prev.map(patch));
      onRefreshDailyDeals?.();
      fetchRangeDailyDeals();
      setRepDealsRows(prev => prev.map(r => r.key === row.key
        ? { ...r, fuStatus: newStatus, repName: creditName, creditId }
        : r));
    }
    setCreditModal(null);
  };

  const repDealsSearchQuery = repDealsSearch.trim().toLowerCase();
  const filteredRepDealsRows = (() => {
    let rows = repDealsRows;
    if (repDealsStatusFilter !== 'all') {
      rows = rows.filter(r => (r.fuStatus || '') === repDealsStatusFilter);
    }
    if (repDealsSearchQuery) {
      rows = rows.filter(row =>
        row.applicationId.toLowerCase().includes(repDealsSearchQuery) ||
        row.customerName.toLowerCase().includes(repDealsSearchQuery) ||
        row.dealerName.toLowerCase().includes(repDealsSearchQuery) ||
        row.repName.toLowerCase().includes(repDealsSearchQuery)
      );
    }
    const dir = repDealsSortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const key = repDealsSortKey;
      if (key === 'date') return (a.date.getTime() - b.date.getTime()) * dir;
      if (key === 'amount') return (a.amount - b.amount) * dir;
      if (key === 'source') return a.source.localeCompare(b.source) * dir;
      const av = String(a[key] ?? '').toLowerCase();
      const bv = String(b[key] ?? '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  })();

  const toggleRepDealsSort = (key: typeof repDealsSortKey) => {
    if (repDealsSortKey === key) {
      setRepDealsSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRepDealsSortKey(key);
      setRepDealsSortDir(key === 'date' || key === 'amount' ? 'desc' : 'asc');
    }
  };

  const repDealsStatusOptions = Array.from(
    new Set(repDealsRows.map(r => r.fuStatus).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const exportRepDealsModal = () => {
    if (!repDealsModal || filteredRepDealsRows.length === 0) return;
    const label = repDealsModal.dealType === 'deal' ? 'deals' : 'confirmed-deals';
    const scope = repDealsModal.repId ? repDealsModal.repName.replace(/\s+/g, '-') : 'team';
    exportRowsToExcel(
      filteredRepDealsRows.map(row => ({
        Rep: row.repName,
        'App ID': row.applicationId,
        Dealer: row.dealerName,
        Customer: row.customerName,
        State: row.state,
        Amount: row.amount,
        Date: row.date.toLocaleDateString(),
        'Status Last': row.statusLast,
        Activity: row.activity,
        'FU Status': row.fuStatus,
        Note: row.note,
        Source: row.source === 'call' ? 'Calls' : 'Manual',
      })),
      repDealsModal.dealType === 'deal' ? 'Deals' : 'Confirmed Deals',
      `rep-${label}-${scope}-${rangeStart}-to-${rangeEnd}.xlsx`,
    );
  };

  const dealCountButtonCls = 'inline-flex items-center rounded-full border border-green-700/60 bg-green-900/30 px-2.5 py-1 text-sm font-semibold text-green-300 hover:bg-green-800/40 transition';
  const confirmedCountButtonCls = 'inline-flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2.5 py-1 text-sm font-semibold text-emerald-300 hover:bg-emerald-800/40 transition';

  const handleSetGoal = async () => {
    if (!selectedState || !goalForm.monthlyGoal || !goalForm.fundingDays) {
      setError('All fields are required'); return;
    }
    try {
      setLoading(true); setError('');
      const { error: upsertError } = await supabase.from('state_goals').upsert(
        { state: selectedState, month: viewMonth, year: viewYear,
          monthly_goal: parseInt(goalForm.monthlyGoal), funding_days: parseInt(goalForm.fundingDays),
          created_by: currentUserId },
        { onConflict: 'state,month,year' }
      );
      if (upsertError) throw upsertError;
      await fetchStateGoals();
      setShowGoalModal(false); setSelectedState(''); setGoalForm({ monthlyGoal: '', fundingDays: '' });
    } catch (err: any) { setError('Failed to set goal: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleSaveTeamGoals = async () => {
    const newTeam = parseInt(teamGoalInput.daily) || 0;
    const newWeekly = parseInt(teamGoalInput.weekly) || 0;
    const newMonthly = parseInt(teamGoalInput.monthly) || 0;
    setGoals({ ...goals, team: newTeam, weekly: newWeekly, monthly: newMonthly });
    setShowTeamGoals(false);
    await supabase.from('team_goals').upsert({
      id: 1,
      team_daily: newTeam,
      team_weekly: newWeekly,
      team_monthly: newMonthly,
      updated_at: new Date().toISOString(),
    });
  };

  const hasFundingData = isViewingCurrentMonth && Object.keys(fundingData).length > 0;
  const totalFundedCount = hasFundingData
    ? Object.values(fundingData).reduce((sum, d) => sum + d.count, 0)
    : monthTotalDeals;
  const totalFundedAmount = hasFundingData
    ? Object.values(fundingData).reduce((sum, d) => sum + d.totalAmount, 0)
    : monthDealCalls.reduce((s, c) => s + getAmount(c), 0) + uniqueMonthManual.reduce((s, d) => s + parseAmount(d.amount), 0);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  const getProgressColor = (p: number) => p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-blue-500' : p >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const getProgressTextColor = (p: number) => p >= 90 ? 'text-green-400' : p >= 70 ? 'text-blue-400' : p >= 50 ? 'text-yellow-400' : 'text-red-400';

  const resetRangeToToday = () => {
    const today = getTodayString();
    setRangeStart(today);
    setRangeEnd(today);
  };

  const handleRangeStartChange = (value: string) => {
    setRangeStart(value);
    if (value > rangeEnd) setRangeEnd(value);
  };

  const handleRangeEndChange = (value: string) => {
    setRangeEnd(value);
    if (value < rangeStart) setRangeStart(value);
  };

  const goToMonth = (year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    setShowMonthPicker(false);
  };

  return (
    <div className="space-y-8">
      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">{error}</div>}

      {/* Month picker bar */}
      <div className="flex items-center justify-between bg-gray-800 rounded-lg border border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-sm font-medium text-gray-200">Reporting Period</p>
            <p className="text-xs text-gray-500">
              {isViewingCurrentMonth ? 'Current month' : 'Historical view'} · Use date range below for performance metrics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (viewMonth === 1) goToMonth(viewYear - 1, 12);
              else goToMonth(viewYear, viewMonth - 1);
            }}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowMonthPicker(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm font-medium text-gray-200 transition min-w-[160px]"
          >
            {viewMonthLabel}
          </button>
          <button
            onClick={() => {
              if (viewMonth === 12) goToMonth(viewYear + 1, 1);
              else if (viewYear < currentYear || (viewYear === currentYear && viewMonth < currentMonth)) {
                goToMonth(viewYear, viewMonth + 1);
              }
            }}
            disabled={isViewingCurrentMonth}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isViewingCurrentMonth && (
            <button
              onClick={() => goToMonth(currentYear, currentMonth)}
              className="ml-2 px-3 py-2 text-xs bg-blue-900 text-blue-300 border border-blue-700 rounded-lg hover:bg-blue-800 transition"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Shared date range */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 px-5 py-4 shadow-lg shadow-black/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-100">Date Range</p>
            <p className="text-xs text-gray-500 mt-0.5">Shared by Performance Overview and Rep Performance · {rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">From</label>
              <input
                type="date"
                value={rangeStart}
                onChange={e => handleRangeStartChange(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <span className="text-gray-500 pb-2 hidden sm:inline">→</span>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">To</label>
              <input
                type="date"
                value={rangeEnd}
                onChange={e => handleRangeEndChange(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={resetRangeToToday}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded-lg text-sm transition"
            >
              Reset to Today
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: PERFORMANCE OVERVIEW ── */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300 shadow-lg shadow-blue-950/20">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-100">Performance Overview</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar className="h-3.5 w-3.5" /> {rangeLabel}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {(currentUserRole === 'admin' || currentUserRole === 'manager') && isViewingCurrentMonth && (
              <button
                onClick={() => setShowTeamGoals(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition shadow-lg shadow-black/10"
              >
                <Target className="w-4 h-4" /> Set Goals
              </button>
            )}
          </div>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Deal results</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          {[
            {
              label: 'All Deals',
              value: kpiAllDeals,
              amount: formatCurrency(allDealsAmount),
              sub: 'Booked deals · 24h lock for status changes',
              Icon: Layers,
              color: 'text-cyan-300',
              accent: 'border-cyan-500/30 bg-cyan-500/10',
              card: 'to-cyan-950/25',
            },
            {
              label: 'Deals on the Way',
              value: kpiDealsOnWay,
              amount: formatCurrency(dealsOnTheWayAmount),
              sub: 'Status: Deal only',
              Icon: Handshake,
              color: 'text-green-300',
              accent: 'border-green-500/30 bg-green-500/10',
              card: 'to-green-950/25',
            },
            {
              label: 'Confirmed Deals',
              value: kpiConfirmed,
              amount: formatCurrency(confirmedDealAmount),
              sub: 'Status: Confirmed Deal',
              Icon: BadgeCheck,
              color: 'text-emerald-300',
              accent: 'border-emerald-500/30 bg-emerald-500/10',
              card: 'to-emerald-950/25',
            },
            {
              label: 'Conversion Rate',
              value: `${kpiConvRate}%`,
              amount: null as string | null,
              sub: `Confirmed ÷ All Deals · Avg ${formatCurrency(rangeAvgDeal)}`,
              Icon: BarChart3,
              color: 'text-blue-300',
              accent: 'border-blue-500/30 bg-blue-500/10',
              card: 'to-blue-950/25',
            },
          ].map(({ label, value, amount, sub, Icon, color, accent, card }) => (
            <div key={label} className={`relative overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 via-gray-800 ${card} p-4 shadow-xl shadow-black/10`}>
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
              <div className={`relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl border ${accent} ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="relative text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
              <p className={`relative mt-1 text-3xl font-bold ${color}`}>{value}</p>
              {amount !== null && (
                <p className="relative mt-1 text-lg font-semibold text-gray-200">{amount}</p>
              )}
              <p className="relative mt-2 inline-flex rounded-full border border-gray-700 bg-gray-900/40 px-2 py-1 text-xs text-gray-500">{sub}</p>
            </div>
          ))}
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Call workload (assigned rep)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          {[
            {
              label: 'Total Calls',
              value: teamTotals.totalCalls,
              sub: 'Assigned in range',
              Icon: Phone,
              color: 'text-blue-300',
              accent: 'border-blue-500/30 bg-blue-500/10',
              card: 'to-blue-950/25',
            },
            {
              label: 'No Call',
              value: teamTotals.noCall,
              sub: 'Not yet called',
              Icon: PhoneOff,
              color: 'text-gray-300',
              accent: 'border-gray-500/30 bg-gray-500/10',
              card: 'to-gray-700/20',
            },
            {
              label: 'Pending',
              value: teamTotals.pending,
              sub: 'Waiting on response',
              Icon: Hourglass,
              color: 'text-yellow-300',
              accent: 'border-yellow-500/30 bg-yellow-500/10',
              card: 'to-yellow-950/25',
            },
            {
              label: 'No Answer',
              value: teamTotals.noAnswer,
              sub: 'Needs retry',
              Icon: PhoneOff,
              color: 'text-orange-300',
              accent: 'border-orange-500/30 bg-orange-500/10',
              card: 'to-orange-950/25',
            },
          ].map(({ label, value, sub, Icon, color, accent, card }) => (
            <div key={label} className={`relative overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 via-gray-800 ${card} p-4 shadow-xl shadow-black/10`}>
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
              <div className={`relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl border ${accent} ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="relative text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
              <p className={`relative mt-1 text-3xl font-bold ${color}`}>{value}</p>
              <p className="relative mt-2 inline-flex rounded-full border border-gray-700 bg-gray-900/40 px-2 py-1 text-xs text-gray-500">{sub}</p>
            </div>
          ))}
        </div>

        {isViewingCurrentMonth && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-cyan-950/25 p-5 shadow-xl shadow-cyan-950/10">
              <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                    <Target className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-100">Team Daily Goal</p>
                    <p className="text-xs text-gray-500">Daily pace target</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-cyan-300">{dealsToday} / {goals.team}</span>
              </div>
              <div className="relative w-full bg-gray-700 rounded-full h-2.5 mb-3 overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-400 to-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${teamGoalPct}%` }} />
              </div>
              <p className="relative text-xs text-gray-500"><span className="text-cyan-300 font-semibold">{teamGoalPct.toFixed(0)}%</span> complete today</p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-purple-950/25 p-5 shadow-xl shadow-purple-950/10">
              <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-purple-500/10 blur-2xl" />
              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-100">Monthly Goal</p>
                    <p className="text-xs text-gray-500">Month-to-date progress</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-purple-300">{monthTotalDeals} / {goals.monthly}</span>
              </div>
              <div className="relative w-full bg-gray-700 rounded-full h-2.5 mb-3 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-400 to-fuchsia-500 h-2.5 rounded-full transition-all" style={{ width: `${monthlyGoalPct}%` }} />
              </div>
              <p className="relative text-xs text-gray-500"><span className="text-purple-300 font-semibold">{monthlyGoalPct.toFixed(0)}%</span> complete this month</p>
            </div>
          </div>
        )}

        {dealsByState.length > 0 && (
          <div className="rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 p-5 shadow-xl shadow-black/10">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-600 bg-gray-900/50 text-gray-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100">Deals by State — {rangeLabel}</p>
                <p className="text-xs text-gray-500">Share of funded deals by state</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dealsByState.map(item => {
                const share = rangeDealCount > 0 ? Math.round((item.deals / rangeDealCount) * 100) : 0;
                return (
                  <div key={item.state} className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-gray-900/80 to-emerald-950/20 p-5">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
                    <div className="relative flex items-center justify-between gap-4">
                      <div>
                        <p className="text-2xl font-bold text-gray-100">{item.state}</p>
                        <p className="mt-2 text-4xl font-bold text-emerald-300">{item.deals}</p>
                        <p className="mt-1 text-sm text-gray-400">{formatCurrency(item.amount)}</p>
                      </div>
                      <div className="grid h-16 w-16 place-items-center rounded-full text-sm font-bold text-emerald-200"
                        style={{ background: `conic-gradient(rgb(16 185 129) ${share}%, rgba(55,65,81,.85) 0)` }}>
                        <div className="grid h-12 w-12 place-items-center rounded-full bg-gray-900">{share}%</div>
                      </div>
                    </div>
                    <div className="relative mt-5 h-2.5 overflow-hidden rounded-full bg-gray-700/80">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: STATE PERFORMANCE ── */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-100">State Performance</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                <Calendar className="h-3.5 w-3.5" /> {viewMonthLabel}
              </p>
            </div>
          </div>
          {(currentUserRole === 'admin' || currentUserRole === 'manager') && isViewingCurrentMonth && (
            <button onClick={() => setShowGoalModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm shadow-lg shadow-blue-950/30">
              <Settings className="w-4 h-4" /> Set State Goals
            </button>
          )}
        </div>

        {hasFundingData && (
          <div className="relative overflow-hidden bg-gradient-to-r from-green-950 via-emerald-950 to-green-900 rounded-xl p-5 border border-green-700/60 mb-4 flex items-center justify-between flex-wrap gap-4 shadow-xl shadow-green-950/20">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_45%)]" />
            <div className="relative">
              <p className="text-green-300 text-xs font-semibold mb-2 uppercase tracking-wider">All States Combined</p>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-4xl font-bold text-white leading-none">{totalFundedCount}</p>
                  <p className="text-green-400 text-xs mt-0.5">funded deals</p>
                </div>
                <div className="h-10 w-px bg-green-700/70" />
                <div>
                  <p className="text-2xl font-bold text-green-200">{formatCurrency(totalFundedAmount)}</p>
                  <p className="text-green-500 text-xs mt-0.5">total volume</p>
                </div>
              </div>
            </div>
            <div className="relative flex items-center gap-3 rounded-xl border border-green-600/50 bg-green-950/40 px-4 py-3 text-right">
              <DollarSign className="h-7 w-7 text-green-300" />
              <div>
                <p className="text-green-400 text-xs">Avg per deal</p>
                <p className="text-xl font-bold text-green-100">
                {formatCurrency(totalFundedCount > 0 ? totalFundedAmount / totalFundedCount : 0)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stateStats.map((stat, idx) => {
            const share = totalFundedCount > 0 ? Math.round((stat.funded / totalFundedCount) * 100) : 0;
            const accentColors = [
              'rgb(139 92 246)',
              'rgb(59 130 246)',
              'rgb(249 115 22)',
              'rgb(34 211 238)',
              'rgb(250 204 21)',
              'rgb(16 185 129)',
            ];
            const accent = accentColors[idx % accentColors.length];
            return (
              <div key={stat.state} className="relative overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 p-4 shadow-lg shadow-black/10">
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ backgroundColor: accent }} />
                <div className="relative flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-14 w-14 place-items-center rounded-full text-xs font-bold text-gray-100"
                      style={{ background: `conic-gradient(${accent} ${stat.monthlyGoal > 0 ? Math.min(stat.progress, 100) : share}%, rgba(55,65,81,.85) 0)` }}>
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-gray-900">{stat.state}</div>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-100">{stat.state}</p>
                      <p className="text-xs text-gray-500">{stat.totalApps} total apps</p>
                    </div>
                  </div>
                  {stat.monthlyGoal > 0 ? (
                    <div className="text-right">
                      <p className={`text-xl font-bold ${getProgressTextColor(stat.progress)}`}>{stat.funded}</p>
                      <p className="text-xs text-gray-500">/ {stat.monthlyGoal} goal</p>
                    </div>
                  ) : (
                    <span className="rounded-full border border-gray-700 bg-gray-900/50 px-2 py-1 text-xs italic text-gray-500">No goal set</span>
                  )}
                </div>

              {stat.monthlyGoal > 0 ? (
                <>
                  <div className="w-full bg-gray-700/80 rounded-full h-2.5 mb-3 overflow-hidden">
                    <div className={`h-2.5 rounded-full ${getProgressColor(stat.progress)}`}
                      style={{ width: `${Math.min(stat.progress, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${getProgressTextColor(stat.progress)}`}>
                      {stat.progress.toFixed(0)}% complete
                    </span>
                    {isViewingCurrentMonth && (
                      <>
                        <span className="text-gray-400">
                          Need <span className="text-gray-200 font-medium">{stat.neededPerDay}/day</span>
                        </span>
                        <span className="text-gray-400">
                          <span className="text-gray-200 font-medium">{stat.daysRemaining}</span> days left
                        </span>
                      </>
                    )}
                  </div>
                  {stat.totalAmount > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <span className="text-xs text-green-400 font-semibold">{formatCurrency(stat.totalAmount)}</span>
                      <span className="text-xs text-gray-500 ml-2">funded volume</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="relative flex items-center justify-between text-xs text-gray-400">
                  <span>{share}% of funded deals</span>
                  {stat.funded > 0 && (
                    <span className="rounded-full border border-green-700/60 bg-green-900/30 px-2 py-1 text-green-300">
                      {stat.funded} funded
                    </span>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 3: REP PERFORMANCE ── */}
      {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
        <div>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-100">Rep Performance</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar className="h-3.5 w-3.5" /> {rangeLabel} · Deals credited to who marked them
                </p>
              </div>
            </div>
          </div>

          {repPerformance.length > 0 ? (
            <div className="bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-xl border border-gray-700 overflow-hidden shadow-xl shadow-black/10">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="bg-gray-950/70">
                  <tr>
                    {([
                      { key: 'repName', label: 'Rep' },
                      { key: 'totalCalls', label: 'Total Calls' },
                      { key: 'noCall', label: 'No Call' },
                      { key: 'pending', label: 'Pending' },
                      { key: 'noAnswer', label: 'No Answer' },
                      { key: 'deals', label: 'Deals' },
                      { key: 'confirmedDeals', label: 'Confirmed' },
                      { key: 'conversionRate', label: 'Conv. Rate' },
                    ] as { key: keyof RepPerformanceRow; label: string }[]).map(col => {
                      const active = repSortKey === col.key;
                      const SortIcon = !active ? ArrowUpDown : repSortDir === 'asc' ? ArrowUp : ArrowDown;
                      return (
                        <th key={col.key} className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          <button
                            type="button"
                            onClick={() => toggleRepSort(col.key)}
                            className={`inline-flex items-center gap-1 hover:text-gray-200 transition ${active ? 'text-blue-300' : ''}`}
                          >
                            {col.label}
                            <SortIcon className="h-3.5 w-3.5" />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/80">
                  {repPerformance.map((rep: any, idx: number) => {
                    const initials = rep.repName
                      .split(' ')
                      .map((part: string) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    const avatarColors = ['bg-purple-600', 'bg-blue-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-orange-600', 'bg-emerald-600'];
                    return (
                    <tr key={rep.repId} className={`${idx % 2 === 0 ? 'bg-gray-800/40' : 'bg-gray-900/20'} hover:bg-gray-750 transition`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColors[idx % avatarColors.length]}`}>
                            {initials || <UserRound className="h-4 w-4" />}
                          </div>
                          <span className="text-sm font-medium text-gray-200">{rep.repName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4"><span className="text-sm font-semibold text-blue-400">{rep.totalCalls}</span></td>
                      <td className="px-5 py-4"><span className="text-sm text-gray-400">{rep.noCall}</span></td>
                      <td className="px-5 py-4"><span className="text-sm font-semibold text-yellow-400">{rep.pending}</span></td>
                      <td className="px-5 py-4"><span className="text-sm font-semibold text-orange-400">{rep.noAnswer}</span></td>
                      <td className="px-5 py-4">
                        {rep.deals > 0 ? (
                          <button
                            onClick={() => openRepDealsModal(rep.repId, rep.repName, 'deal')}
                            className={dealCountButtonCls}
                          >
                            {rep.deals}
                          </button>
                        ) : (
                          <span className="text-sm font-semibold text-green-400">0</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {rep.confirmedDeals > 0 ? (
                          <button
                            onClick={() => openRepDealsModal(rep.repId, rep.repName, 'confirmed')}
                            className={confirmedCountButtonCls}
                          >
                            <BadgeCheck className="h-3 w-3" /> {rep.confirmedDeals}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-400">
                            <BadgeCheck className="h-3 w-3" /> 0
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4"><span className="text-sm font-semibold text-blue-400">{rep.conversionRate}%</span></td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-950/70 border-t-2 border-gray-600">
                  <tr>
                    <td className="px-5 py-4 text-sm font-bold text-gray-200">Team Total</td>
                    <td className="px-5 py-4"><span className="text-sm font-bold text-blue-400">{teamTotals.totalCalls}</span></td>
                    <td className="px-5 py-4"><span className="text-sm font-bold text-gray-300">{teamTotals.noCall}</span></td>
                    <td className="px-5 py-4"><span className="text-sm font-bold text-yellow-400">{teamTotals.pending}</span></td>
                    <td className="px-5 py-4"><span className="text-sm font-bold text-orange-400">{teamTotals.noAnswer}</span></td>
                    <td className="px-5 py-4">
                      {teamTotals.deals > 0 ? (
                        <button
                          onClick={() => openRepDealsModal(undefined, 'Team', 'deal')}
                          className={dealCountButtonCls}
                        >
                          {teamTotals.deals}
                        </button>
                      ) : (
                        <span className="text-sm font-bold text-green-400">0</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {teamTotals.confirmedDeals > 0 ? (
                        <button
                          onClick={() => openRepDealsModal(undefined, 'Team', 'confirmed')}
                          className={confirmedCountButtonCls}
                        >
                          <BadgeCheck className="h-3 w-3" /> {teamTotals.confirmedDeals}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-400">
                          <BadgeCheck className="h-3 w-3" /> 0
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4"><span className="text-sm font-bold text-blue-400">{teamConvRate}%</span></td>
                  </tr>
                </tfoot>
              </table>
              </div>
              <div className="px-5 py-3 bg-gray-950/40 border-t border-gray-700">
                <p className="text-xs text-gray-500">
                  Showing <span className="text-gray-400 font-medium">{rangeLabel}</span>
                  &nbsp;·&nbsp; Click deal or confirmed count to view &amp; edit
                  &nbsp;·&nbsp; Deals credited to who marked them
                  &nbsp;·&nbsp; Deals lock into All Deals after 24h (earlier status changes drop out)
                  &nbsp;·&nbsp; Conv. Rate = Confirmed &divide; All Deals
                  &nbsp;·&nbsp; Click column headers to sort
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center text-gray-400">
              No rep activity for this period
            </div>
          )}
        </div>
      )}

      {/* Month picker modal */}
      {showMonthPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"
          onClick={() => setShowMonthPicker(false)}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setViewYear(y => y - 1)} className="p-1 hover:bg-gray-700 rounded text-gray-400">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-semibold text-gray-100">{viewYear}</h3>
              <button
                onClick={() => { if (viewYear < currentYear) setViewYear(y => y + 1); }}
                disabled={viewYear >= currentYear}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MONTH_NAMES.map((name, idx) => {
                const month = idx + 1;
                const isFuture = viewYear > currentYear || (viewYear === currentYear && month > currentMonth);
                const isSelected = viewMonth === month;
                return (
                  <button
                    key={name}
                    disabled={isFuture}
                    onClick={() => goToMonth(viewYear, month)}
                    className={`px-3 py-2 rounded-lg text-sm transition ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : isFuture
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowMonthPicker(false)}
              className="mt-4 w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Rep deals modal */}
      {repDealsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-10 z-50 px-4"
          onClick={() => {
            setRepDealsModal(null);
            setRepDealsSearch('');
            setRepDealsStatusFilter('all');
          }}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">
                  {repDealsModal.repName}&apos;s {repDealsModal.dealType === 'deal' ? 'Deals' : 'Confirmed Deals'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {rangeLabel} ·{' '}
                  {(repDealsSearchQuery || repDealsStatusFilter !== 'all')
                    ? `${filteredRepDealsRows.length} of ${repDealsRows.length}`
                    : repDealsRows.length}{' '}
                  {repDealsModal.dealType === 'deal' ? 'deal' : 'confirmed deal'}
                  {((repDealsSearchQuery || repDealsStatusFilter !== 'all') ? filteredRepDealsRows.length : repDealsRows.length) !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportRepDealsModal}
                  disabled={repDealsLoading || filteredRepDealsRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-700 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-40 transition"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
                <button
                  onClick={() => {
                    setRepDealsModal(null);
                    setRepDealsSearch('');
                    setRepDealsStatusFilter('all');
                  }}
                  className="text-gray-400 hover:text-gray-200 text-2xl font-light"
                >
                  &times;
                </button>
              </div>
            </div>
            {!repDealsLoading && repDealsRows.length > 0 && (
              <div className="px-6 py-3 border-b border-gray-700 shrink-0 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type="text"
                    value={repDealsSearch}
                    onChange={e => setRepDealsSearch(e.target.value)}
                    placeholder="Search App ID, customer, dealer, or rep…"
                    className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {repDealsModal.dealType === 'deal' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Filter by status</label>
                    <select
                      value={repDealsStatusFilter}
                      onChange={e => setRepDealsStatusFilter(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All statuses</option>
                      {repDealsStatusOptions.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div className="overflow-auto flex-1">
              {repDealsLoading ? (
                <p className="text-center text-gray-500 py-12">Loading deals…</p>
              ) : repDealsRows.length === 0 ? (
                <p className="text-center text-gray-500 py-12">No {repDealsModal.dealType === 'deal' ? 'deals' : 'confirmed deals'} found.</p>
              ) : filteredRepDealsRows.length === 0 ? (
                <p className="text-center text-gray-500 py-12">No deals match your search{repDealsStatusFilter !== 'all' ? ' / filter' : ''}.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 sticky top-0">
                    <tr>
                      {([
                        { key: 'repName', label: 'Rep' },
                        { key: 'applicationId', label: 'App ID' },
                        { key: 'dealerName', label: 'Dealer' },
                        { key: 'customerName', label: 'Customer' },
                        { key: 'state', label: 'State' },
                        { key: 'amount', label: 'Amount' },
                        { key: 'date', label: 'Date' },
                        { key: 'statusLast', label: 'Status Last' },
                        { key: 'activity', label: 'Activity' },
                        { key: 'fuStatus', label: 'FU Status' },
                        { key: 'note', label: 'Note' },
                        { key: 'source', label: 'Source' },
                      ] as { key: keyof RepDealRow; label: string }[]).map(col => {
                        const active = repDealsSortKey === col.key;
                        const SortIcon = !active ? ArrowUpDown : repDealsSortDir === 'asc' ? ArrowUp : ArrowDown;
                        return (
                          <th key={col.key} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleRepDealsSort(col.key)}
                              className={`inline-flex items-center gap-1 hover:text-gray-200 transition ${active ? 'text-blue-300' : ''}`}
                            >
                              {col.label}
                              <SortIcon className="h-3 w-3" />
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredRepDealsRows.map(row => (
                      <tr key={row.key} className="hover:bg-gray-750">
                        <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{row.repName}</td>
                        <td className="px-3 py-2.5 text-blue-400 font-mono text-xs whitespace-nowrap">{row.applicationId}</td>
                        <td className="px-3 py-2.5 text-gray-300 max-w-[140px] truncate">{row.dealerName}</td>
                        <td className="px-3 py-2.5 text-gray-300 max-w-[120px] truncate">{row.customerName}</td>
                        <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">{row.state}</span></td>
                        <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          {editingRepDealAmount === row.key ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={tempRepDealAmount}
                                onChange={e => setTempRepDealAmount(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleRepDealAmountSave(row);
                                  if (e.key === 'Escape') { setEditingRepDealAmount(null); setTempRepDealAmount(''); }
                                }}
                                className="w-24 px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => handleRepDealAmountSave(row)}
                                className="text-green-400 hover:text-green-300"
                                title="Save amount"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditingRepDealAmount(null); setTempRepDealAmount(''); }}
                                className="text-gray-400 hover:text-gray-200"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group">
                              <span className="text-green-400">{formatCurrency(row.amount)}</span>
                              <button
                                onClick={() => {
                                  setEditingRepDealAmount(row.key);
                                  setTempRepDealAmount(String(row.amount || 0));
                                }}
                                className="text-gray-500 hover:text-blue-300 opacity-60 group-hover:opacity-100 transition"
                                title="Edit amount"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{row.date.toLocaleDateString()}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{row.statusLast}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{row.activity}</td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <select
                            value={row.fuStatus}
                            onChange={e => handleRepDealStatusChange(row, e.target.value)}
                            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {FU_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            {!FU_OPTIONS.includes(row.fuStatus) && row.fuStatus && (
                              <option value={row.fuStatus}>{row.fuStatus}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs max-w-[160px] truncate" title={row.note}>{row.note}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${row.source === 'call' ? 'bg-purple-900 text-purple-300 border border-purple-700' : 'bg-gray-700 text-gray-400 border border-gray-600'}`}>
                            {row.source === 'call' ? 'Calls' : 'Manual'}
                          </span>
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

      {creditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
          onClick={() => setCreditModal(null)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl w-full max-w-md p-5 shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-100 mb-1">Credit this deal</h3>
            <p className="text-sm text-gray-400 mb-4">
              Set status to <span className="text-green-300 font-medium">{creditModal.newStatus}</span> and choose who gets credit.
            </p>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Credit to</label>
            <select
              value={creditModal.creditId}
              onChange={e => setCreditModal({ ...creditModal, creditId: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 mb-5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {creditOptions.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreditModal(null)}
                className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={applyRepDealCreditModal}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal modals */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Set State Goal — {viewMonthLabel}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">State</label>
                <select value={selectedState} onChange={e => setSelectedState(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select State</option>
                  {[...new Set(calls.map(c => c.state))].sort().map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Monthly Funded Goal</label>
                <input type="number" value={goalForm.monthlyGoal}
                  onChange={e => setGoalForm({ ...goalForm, monthlyGoal: e.target.value })}
                  placeholder="e.g., 200"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Funding Days in Month</label>
                <input type="number" value={goalForm.fundingDays}
                  onChange={e => setGoalForm({ ...goalForm, fundingDays: e.target.value })}
                  placeholder="e.g., 20"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSetGoal} disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition">
                {loading ? 'Saving...' : 'Set Goal'}
              </button>
              <button onClick={() => { setShowGoalModal(false); setSelectedState(''); setGoalForm({ monthlyGoal: '', fundingDays: '' }); setError(''); }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showTeamGoals && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Set Team Goals</h3>
            <div className="space-y-4">
              {[{ label: 'Daily Team Goal', key: 'daily' }, { label: 'Weekly Team Goal', key: 'weekly' }, { label: 'Monthly Team Goal', key: 'monthly' }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
                  <input type="number" value={teamGoalInput[key as keyof typeof teamGoalInput]}
                    onChange={e => setTeamGoalInput({ ...teamGoalInput, [key]: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSaveTeamGoals}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                Save Goals
              </button>
              <button onClick={() => setShowTeamGoals(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
