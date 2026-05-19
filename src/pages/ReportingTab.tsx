import { useState, useEffect } from 'react';
import { Target, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Call {
  id: string;
  state: string;
  fuStatus?: string;
  submittedDate: string;
  dealDate?: Date;
  updatedAt: Date;
  assignedTo?: string;
  assignedToName?: string;
  amount?: number;
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

interface DailyDealSummary {
  id: string;
  addedBy: string;
  fuStatus: string;
  dealDate: string;
  amount: string;
}

interface ReportingTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'rep';
  calls: Call[];
  goals: Goals;
  setGoals: (goals: Goals) => void;
  fundingData: FundingData;
  todayDailyDeals?: DailyDealSummary[];
}

type TimePeriod = 'daily' | 'weekly' | 'monthly';

export default function ReportingTab({
  currentUserId, currentUserRole, calls, goals, setGoals, fundingData, todayDailyDeals,
}: ReportingTabProps) {
  const [stateGoals, setStateGoals] = useState<StateGoal[]>([]);
  const [stateStats, setStateStats] = useState<StateStats[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [goalForm, setGoalForm] = useState({ monthlyGoal: '', fundingDays: '' });
  const [showTeamGoals, setShowTeamGoals] = useState(false);
  const [teamGoalInput, setTeamGoalInput] = useState({
    daily: goals.team.toString(),
    weekly: goals.weekly.toString(),
    monthly: goals.monthly.toString(),
  });
  const [period, setPeriod] = useState<TimePeriod>('daily');
  const [repPeriod, setRepPeriod] = useState<TimePeriod>('daily');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const currentDay = new Date().getDate();

  useEffect(() => { fetchStateGoals(); }, []);
  useEffect(() => { if (stateGoals.length > 0) calculateStateStats(); }, [stateGoals, calls, fundingData]);

  const fetchStateGoals = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('state_goals').select('*').eq('month', currentMonth).eq('year', currentYear);
      if (fetchError) throw fetchError;
      if (data) {
        setStateGoals(data.map((g: any) => ({
          id: g.id, state: g.state, month: g.month, year: g.year,
          monthlyGoal: g.monthly_goal, fundingDays: g.funding_days,
        })));
      }
    } catch (err: any) { console.error('Error fetching goals:', err); }
  };

  const calculateStateStats = () => {
    const states = [...new Set(calls.map(c => c.state))].sort();
    const stats: StateStats[] = states.map(state => {
      const stateCalls = calls.filter(c => c.state === state);
      const totalApps = stateCalls.length;

      let funded = 0;
      let totalAmount = 0;
      if (fundingData[state]) {
        funded = fundingData[state].count;
        totalAmount = fundingData[state].totalAmount;
      } else {
        funded = stateCalls.filter(call => {
          if (!call.dealDate) return false;
          const d = new Date(call.dealDate);
          return (call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal') &&
            d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
        }).length;
      }

      const stateGoal = stateGoals.find(g => g.state === state);
      const monthlyGoal = stateGoal?.monthlyGoal || 0;
      const fundingDays = stateGoal?.fundingDays || 20;
      const dailyGoal = monthlyGoal > 0 ? Math.round(monthlyGoal / fundingDays) : 0;
      const progress = monthlyGoal > 0 ? (funded / monthlyGoal) * 100 : 0;
      const daysElapsed = Math.min(currentDay, fundingDays);
      const daysRemaining = Math.max(fundingDays - daysElapsed, 1);
      const neededPerDay = monthlyGoal > 0 ? Math.ceil((monthlyGoal - funded) / daysRemaining) : 0;

      return { state, totalApps, funded, totalAmount, monthlyGoal, fundingDays, dailyGoal, progress, neededPerDay, daysRemaining };
    });
    setStateStats(stats);
  };

  const handleSetGoal = async () => {
    if (!selectedState || !goalForm.monthlyGoal || !goalForm.fundingDays) {
      setError('All fields are required'); return;
    }
    try {
      setLoading(true); setError('');
      const { error: upsertError } = await supabase.from('state_goals').upsert(
        { state: selectedState, month: currentMonth, year: currentYear,
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

  const handleSaveTeamGoals = () => {
    setGoals({ ...goals, team: parseInt(teamGoalInput.daily) || 0, weekly: parseInt(teamGoalInput.weekly) || 0, monthly: parseInt(teamGoalInput.monthly) || 0 });
    setShowTeamGoals(false);
  };

  // Date range for period
  const getStartDate = (p: TimePeriod) => {
    const now = new Date();
    if (p === 'daily') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (p === 'weekly') {
      const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0,0,0,0); return s;
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  };

  const filterByPeriod = (p: TimePeriod) => {
    const start = getStartDate(p);
    return calls.filter(c => {
      const d = c.dealDate ? new Date(c.dealDate) : new Date(c.updatedAt);
      return d >= start;
    });
  };

  const getAmount = (call: Call) =>
    parseFloat((call.buyerFinal || call.amount?.toString() || '0').replace(/[^0-9.-]+/g, '')) || 0;

  // Period stats
  const periodCalls = filterByPeriod(period);
  const periodDealCalls = periodCalls.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal');

  const dailyDealCount = (todayDailyDeals || []).filter(d =>
    d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal'
  ).length;

  const periodTotalDeals = periodDealCalls.length + (period === 'daily' ? dailyDealCount : 0);
  const csvTotalAmount = periodDealCalls.reduce((sum, c) => sum + getAmount(c), 0);

  const dailyDealsAmount = period === 'daily'
    ? (todayDailyDeals || [])
        .filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal')
        .reduce((sum, d) => sum + (parseFloat((d.amount || '0').replace(/[^0-9.-]+/g, '')) || 0), 0)
    : 0;

  const periodTotalAmount = csvTotalAmount + dailyDealsAmount;
  const periodAvgDeal = periodTotalDeals > 0 ? periodTotalAmount / periodTotalDeals : 0;

  // Static stats
  const totalCalls = calls.length;
  const totalPending = calls.filter(c => c.fuStatus === 'Pending').length;
  const totalDealsAllTime = calls.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal').length;

  // Today's deals for goal tracking
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const csvDealsToday = calls.filter(c =>
    (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && c.dealDate && new Date(c.dealDate) >= todayStart
  ).length;
  const dealsToday = csvDealsToday + dailyDealCount;
  const teamGoalPct = goals.team > 0 ? Math.min((dealsToday / goals.team) * 100, 100) : 0;
  const monthlyGoalPct = goals.monthly > 0 ? Math.min((totalDealsAllTime / goals.monthly) * 100, 100) : 0;

  // Deals by state for period
  const dealsByState = periodDealCalls.reduce((acc: { state: string; deals: number; amount: number }[], call) => {
    const ex = acc.find(i => i.state === call.state);
    if (ex) { ex.deals++; ex.amount += getAmount(call); }
    else acc.push({ state: call.state, deals: 1, amount: getAmount(call) });
    return acc;
  }, []).sort((a, b) => b.deals - a.deals);

  // Rep performance
  const calculateRepPerformance = (p: TimePeriod) => {
    const filtered = filterByPeriod(p);
    const repData = filtered.reduce((acc: any[], call) => {
      if (!call.assignedTo || !call.assignedToName) return acc;
      const ex = acc.find(r => r.repId === call.assignedTo);
      const isDeal = call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal';
      const isConfirmed = call.fuStatus === 'Confirmed Deal';
      const isPending = call.fuStatus === 'Pending';
      const isNoAnswer = call.fuStatus === 'No Answer';
      if (ex) {
        ex.totalCalls++;
        if (isDeal) ex.deals++;
        if (isConfirmed) ex.confirmedDeals++;
        if (isPending) ex.pending++;
        if (isNoAnswer) ex.noAnswer++;
      } else {
        acc.push({
          repId: call.assignedTo, repName: call.assignedToName,
          totalCalls: 1,
          deals: isDeal ? 1 : 0,
          confirmedDeals: isConfirmed ? 1 : 0,
          pending: isPending ? 1 : 0,
          noAnswer: isNoAnswer ? 1 : 0,
        });
      }
      return acc;
    }, []);
    repData.forEach(r => {
      r.conversionRate = r.totalCalls > 0 ? ((r.confirmedDeals / r.totalCalls) * 100).toFixed(1) : '0';
    });
    return repData.sort((a: any, b: any) => b.deals - a.deals);
  };

  const repPerformance = calculateRepPerformance(repPeriod);

  // State performance totals
  const hasFundingData = Object.keys(fundingData).length > 0;
  const totalFundedCount = Object.values(fundingData).reduce((sum, d) => sum + d.count, 0);
  const totalFundedAmount = Object.values(fundingData).reduce((sum, d) => sum + d.totalAmount, 0);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  const getProgressColor = (p: number) => p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-blue-500' : p >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const getProgressTextColor = (p: number) => p >= 90 ? 'text-green-400' : p >= 70 ? 'text-blue-400' : p >= 50 ? 'text-yellow-400' : 'text-red-400';

  const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
  const repPeriodLabel = repPeriod.charAt(0).toUpperCase() + repPeriod.slice(1);

  return (
    <div className="space-y-8">
      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">{error}</div>}

      {/* ── SECTION 1: PERFORMANCE OVERVIEW ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-100">Performance Overview</h2>
          <div className="flex items-center gap-3">
            {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
              <button
                onClick={() => setShowTeamGoals(true)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
              >
                <Target className="w-4 h-4" /> Set Goals
              </button>
            )}
            <div className="flex gap-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              {(['daily','weekly','monthly'] as TimePeriod[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-4 py-2 text-sm font-medium transition ${period === p ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Deals</p>
            <p className="text-3xl font-bold text-green-400">{periodTotalDeals}</p>
            <p className="text-xs text-gray-500 mt-1">{periodLabel}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Amount</p>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(periodTotalAmount)}</p>
            <p className="text-xs text-gray-500 mt-1">Avg: {formatCurrency(periodAvgDeal)}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Calls</p>
            <p className="text-3xl font-bold text-blue-400">{totalCalls}</p>
            <p className="text-xs text-gray-500 mt-1">All time</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Pending</p>
            <p className="text-3xl font-bold text-yellow-400">{totalPending}</p>
            <p className="text-xs text-gray-500 mt-1">Current</p>
          </div>
        </div>

        {/* Goals Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-300">Team Daily Goal</p>
              <span className="text-sm font-bold text-cyan-400">{dealsToday} / {goals.team}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
              <div className="bg-cyan-500 h-2.5 rounded-full transition-all" style={{ width: `${teamGoalPct}%` }} />
            </div>
            <p className="text-xs text-gray-500">{teamGoalPct.toFixed(0)}% complete today</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-300">Monthly Goal</p>
              <span className="text-sm font-bold text-purple-400">{totalDealsAllTime} / {goals.monthly}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
              <div className="bg-purple-500 h-2.5 rounded-full transition-all" style={{ width: `${monthlyGoalPct}%` }} />
            </div>
            <p className="text-xs text-gray-500">{monthlyGoalPct.toFixed(0)}% complete this month</p>
          </div>
        </div>

        {/* Deals by State for period */}
        {dealsByState.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-sm font-medium text-gray-300 mb-3">
              Deals by State — {periodLabel}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {dealsByState.map(item => (
                <div key={item.state} className="bg-gray-700 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-gray-100">{item.state}</p>
                  <p className="text-2xl font-bold text-green-400">{item.deals}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatCurrency(item.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: STATE PERFORMANCE ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">State Performance</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {new Date().toLocaleString('default', { month: 'long' })} {currentYear}
            </p>
          </div>
          {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
            <button onClick={() => setShowGoalModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm">
              <Settings className="w-4 h-4" /> Set State Goals
            </button>
          )}
        </div>

        {hasFundingData && (
          <div className="bg-gradient-to-r from-green-900 to-emerald-900 rounded-lg p-4 border border-green-700 mb-4 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-green-300 text-xs font-medium mb-1 uppercase tracking-wide">All States Combined</p>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-4xl font-bold text-white">{totalFundedCount}</p>
                  <p className="text-green-400 text-xs mt-0.5">funded deals</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-300">{formatCurrency(totalFundedAmount)}</p>
                  <p className="text-green-500 text-xs mt-0.5">total volume</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-green-400 text-xs">Avg per deal</p>
              <p className="text-xl font-bold text-green-200">
                {formatCurrency(totalFundedCount > 0 ? totalFundedAmount / totalFundedCount : 0)}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stateStats.map(stat => (
            <div key={stat.state} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xl font-bold text-gray-100">{stat.state}</span>
                {stat.monthlyGoal > 0 ? (
                  <span className={`text-2xl font-bold ${getProgressTextColor(stat.progress)}`}>
                    {stat.funded}
                    <span className="text-sm text-gray-500 font-normal"> / {stat.monthlyGoal}</span>
                  </span>
                ) : (
                  <span className="text-sm text-gray-500 italic">No goal set</span>
                )}
              </div>

              {stat.monthlyGoal > 0 ? (
                <>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                    <div className={`h-2 rounded-full ${getProgressColor(stat.progress)}`}
                      style={{ width: `${Math.min(stat.progress, 100)}%` }} />
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${getProgressTextColor(stat.progress)}`}>
                      {stat.progress.toFixed(0)}% complete
                    </span>
                    <span className="text-gray-400">
                      Need <span className="text-gray-200 font-medium">{stat.neededPerDay}/day</span>
                    </span>
                    <span className="text-gray-400">
                      <span className="text-gray-200 font-medium">{stat.daysRemaining}</span> days left
                    </span>
                  </div>

                  {/* Amount row */}
                  {stat.totalAmount > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <span className="text-xs text-green-400 font-semibold">{formatCurrency(stat.totalAmount)}</span>
                      <span className="text-xs text-gray-500 ml-2">funded volume</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{stat.totalApps} total apps</span>
                  {stat.funded > 0 && <span className="text-green-400">{stat.funded} funded</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 3: REP PERFORMANCE ── */}
      {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-100">Rep Performance</h2>
            <div className="flex gap-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              {(['daily','weekly','monthly'] as TimePeriod[]).map(p => (
                <button key={p} onClick={() => setRepPeriod(p)}
                  className={`px-4 py-2 text-sm font-medium transition ${repPeriod === p ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {repPerformance.length > 0 ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Rep</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Deals</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Confirmed</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pending</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">No Answer</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Conv. Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {repPerformance.map((rep: any) => (
                    <tr key={rep.repId} className="hover:bg-gray-750">
                      <td className="px-5 py-4 text-sm font-medium text-gray-200">{rep.repName}</td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-semibold text-green-400">{rep.deals}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-semibold text-emerald-400">{rep.confirmedDeals}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-yellow-400">{rep.pending}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-orange-400">{rep.noAnswer}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-semibold text-blue-400">{rep.conversionRate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 bg-gray-750 border-t border-gray-700">
                <p className="text-xs text-gray-500">
                  Showing <span className="text-gray-400 font-medium">{repPeriodLabel}</span> view
                  &nbsp;·&nbsp; Conv. Rate = Confirmed Deals &divide; Total Calls
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

      {/* ── MODALS ── */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Set State Goal</h3>
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
              {goalForm.monthlyGoal && goalForm.fundingDays && (
                <div className="bg-gray-700 rounded-lg p-4 text-sm text-gray-300">
                  <strong>Daily Goal:</strong> {Math.round(parseInt(goalForm.monthlyGoal) / parseInt(goalForm.fundingDays))} deals/day
                  &nbsp;·&nbsp;
                  <strong>Weekly:</strong> {Math.round((parseInt(goalForm.monthlyGoal) / parseInt(goalForm.fundingDays)) * 5)} deals/week
                </div>
              )}
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