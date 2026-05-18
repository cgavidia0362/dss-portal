import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, Target, Settings, Award, CheckCircle2 } from 'lucide-react';
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
  weeklyGoal: number;
  progress: number;
  neededPerDay: number;
  daysElapsed: number;
  daysRemaining: number;
}

interface Goals {
  daily: { [repId: string]: number };
  team: number;
  weekly: number;
  monthly: number;
}

interface FundingData {
  [state: string]: {
    count: number;
    totalAmount: number;
  };
}

interface ReportingTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'rep';
  calls: Call[];
  goals: Goals;
  setGoals: (goals: Goals) => void;
  fundingData: FundingData;
}

type TimePeriod = 'daily' | 'weekly' | 'monthly';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ReportingTab({
  currentUserId, currentUserRole, calls, goals, setGoals, fundingData,
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
  const [revenuePeriod, setRevenuePeriod] = useState<TimePeriod>('monthly');
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

      // Use uploaded funding data if available, else fall back to call-based count
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
      const weeklyGoal = dailyGoal * 5;
      const progress = monthlyGoal > 0 ? (funded / monthlyGoal) * 100 : 0;
      const daysElapsed = Math.min(currentDay, fundingDays);
      const daysRemaining = Math.max(fundingDays - daysElapsed, 1);
      const neededPerDay = monthlyGoal > 0 ? Math.ceil((monthlyGoal - funded) / daysRemaining) : 0;

      return { state, totalApps, funded, totalAmount, monthlyGoal, fundingDays, dailyGoal, weeklyGoal, progress, neededPerDay, daysElapsed, daysRemaining };
    });

    setStateStats(stats);
  };

  // Total funded across all states
  const totalFundedCount = Object.values(fundingData).reduce((sum, d) => sum + d.count, 0);
  const totalFundedAmount = Object.values(fundingData).reduce((sum, d) => sum + d.totalAmount, 0);
  const hasFundingData = Object.keys(fundingData).length > 0;

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

  const getProgressColor = (p: number) => p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-blue-500' : p >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const getProgressTextColor = (p: number) => p >= 90 ? 'text-green-400' : p >= 70 ? 'text-blue-400' : p >= 50 ? 'text-yellow-400' : 'text-red-400';

  const getDateRange = (period: TimePeriod) => {
    const now = new Date();
    if (period === 'daily') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'weekly') {
      const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0,0,0,0); return s;
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  };

  const filterCallsByPeriod = (period: TimePeriod) => {
    const startDate = getDateRange(period);
    return calls.filter(call => {
      const d = call.dealDate ? new Date(call.dealDate) : new Date(call.updatedAt);
      return d >= startDate;
    });
  };

  const calculateRevenueStats = (period: TimePeriod) => {
    const filtered = filterCallsByPeriod(period);
    const dealCalls = filtered.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal');
    const getAmount = (call: Call) =>
      parseFloat((call.buyerFinal || call.amount?.toString() || '0').replace(/[^0-9.-]+/g, '')) || 0;
    const totalDeals = dealCalls.length;
    const totalRevenue = dealCalls.reduce((sum, c) => sum + getAmount(c), 0);
    const avgDeal = totalDeals > 0 ? totalRevenue / totalDeals : 0;
    const largestDeal = dealCalls.length > 0 ? Math.max(...dealCalls.map(c => getAmount(c))) : 0;
    const byState = dealCalls.reduce((acc: any[], call) => {
      const ex = acc.find(i => i.state === call.state);
      if (ex) { ex.deals++; ex.revenue += getAmount(call); }
      else acc.push({ state: call.state, deals: 1, revenue: getAmount(call) });
      return acc;
    }, []);
    return { totalDeals, totalRevenue, avgDeal, largestDeal, byState };
  };

  const revenueStats = calculateRevenueStats(revenuePeriod);

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const dealsToday = calls.filter(c => (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && c.dealDate && new Date(c.dealDate) >= todayStart).length;
  const totalDeals = calls.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal').length;
  const conversionRate = calls.length > 0 ? ((totalDeals / calls.length) * 100).toFixed(1) : '0';

  const calculateRepPerformance = (period: TimePeriod) => {
    const filtered = filterCallsByPeriod(period);
    const repData = filtered.reduce((acc: any[], call) => {
      if (!call.assignedTo || !call.assignedToName) return acc;
      const ex = acc.find(r => r.repId === call.assignedTo);
      const isDeal = call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal';
      const isConfirmed = ['Document Received','Funded','Funding Pending','Confirmed Deal'].includes(call.fuStatus || '');
      if (ex) { ex.calls++; if (isDeal) ex.dealsClaimed++; if (isConfirmed) ex.confirmedDeals++; }
      else acc.push({ repId: call.assignedTo, repName: call.assignedToName, calls: 1, dealsClaimed: isDeal ? 1 : 0, confirmedDeals: isConfirmed ? 1 : 0 });
      return acc;
    }, []);
    repData.forEach(r => { r.conversionRate = r.calls > 0 ? ((r.confirmedDeals / r.calls) * 100).toFixed(1) : '0'; });
    return repData;
  };

  const repPerformance = calculateRepPerformance(repPeriod);

  const dealsByWeek = calls.reduce((acc: any[], call) => {
    if (!call.dealDate) return acc;
    const d = new Date(call.dealDate);
    const key = `${d.getFullYear()}-W${Math.ceil(d.getDate()/7)}`;
    const ex = acc.find(i => i.week === key);
    if (ex) ex.deals++; else acc.push({ week: key, deals: 1 });
    return acc;
  }, []);

  const statusDistribution = calls.reduce((acc: any[], call) => {
    const status = call.fuStatus || 'Unassigned';
    const ex = acc.find(i => i.name === status);
    if (ex) ex.value++; else acc.push({ name: status, value: 1 });
    return acc;
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">{error}</div>}

      {/* SECTION 1: TOTAL DEALS */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-100">💰 Total Deals</h2>
          <div className="flex gap-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            {(['daily','weekly','monthly'] as TimePeriod[]).map(p => (
              <button key={p} onClick={() => setRevenuePeriod(p)}
                className={`px-4 py-2 text-sm font-medium transition ${revenuePeriod === p ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Deals', value: revenueStats.totalDeals, sub: 'All States' },
              { label: 'Total Revenue', value: formatCurrency(revenueStats.totalRevenue), sub: revenuePeriod.charAt(0).toUpperCase() + revenuePeriod.slice(1) },
              { label: 'Average Deal', value: formatCurrency(revenueStats.avgDeal), sub: 'Per Deal' },
              { label: 'Largest Deal', value: formatCurrency(revenueStats.largestDeal), sub: 'Single Deal' },
            ].map(card => (
              <div key={card.label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">{card.label}</p>
                <p className="text-3xl font-bold text-green-400">{card.value}</p>
                <p className="text-xs text-gray-500 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>
          {revenueStats.byState.length > 0 && (
            <>
              <div className="h-px bg-gray-700 my-4" />
              <h3 className="text-lg font-semibold text-gray-200 mb-3">By State</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {revenueStats.byState.map(item => (
                  <div key={item.state} className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-gray-200">{item.state}</p>
                      <p className="text-sm text-gray-400">{item.deals} deals</p>
                    </div>
                    <p className="text-lg font-bold text-green-400">{formatCurrency(item.revenue)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* SECTION 2: TEAM OVERVIEW */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-100">Team Overview</h2>
          {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
            <button onClick={() => setShowTeamGoals(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition text-sm">
              <Target className="w-4 h-4" /> Set Team Goals
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-400 text-sm">Deals Today</p><p className="text-3xl font-bold text-green-400">{dealsToday}</p></div>
              <CheckCircle2 className="w-12 h-12 text-green-400 opacity-20" />
            </div>
            <div className="mt-2 text-sm text-gray-500">Goal: {goals.team}/day</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-400 text-sm">Total Deals</p><p className="text-3xl font-bold text-blue-400">{totalDeals}</p></div>
              <Award className="w-12 h-12 text-blue-400 opacity-20" />
            </div>
            <div className="mt-2 text-sm text-gray-500">Monthly Goal: {goals.monthly}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-400 text-sm">Conversion Rate</p><p className="text-3xl font-bold text-purple-400">{conversionRate}%</p></div>
              <TrendingUp className="w-12 h-12 text-purple-400 opacity-20" />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: STATE PERFORMANCE */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">State Performance</h2>
            <p className="text-gray-400 mt-1">{new Date().toLocaleString('default', { month: 'long' })} {currentYear}</p>
          </div>
          {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
            <button onClick={() => setShowGoalModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
              <Settings className="w-5 h-5" /> Set State Goals
            </button>
          )}
        </div>

        {/* Total Funded Summary Tile */}
        {hasFundingData && (
          <div className="bg-gradient-to-r from-green-900 to-emerald-900 rounded-lg p-5 border border-green-700 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-green-300 text-sm font-medium mb-1">Total Funded — All States Combined</p>
                <div className="flex items-end gap-4">
                  <div>
                    <p className="text-5xl font-bold text-white">{totalFundedCount}</p>
                    <p className="text-green-400 text-sm mt-1">funded deals</p>
                  </div>
                  <div className="mb-1">
                    <p className="text-3xl font-bold text-green-300">{formatCurrency(totalFundedAmount)}</p>
                    <p className="text-green-500 text-sm mt-1">total loan volume</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-green-400 text-sm">Avg per deal</p>
                <p className="text-2xl font-bold text-green-200">
                  {formatCurrency(totalFundedCount > 0 ? totalFundedAmount / totalFundedCount : 0)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* State Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {stateStats.map(stat => (
            <div key={stat.state} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-100">{stat.state}</h3>
                {stat.monthlyGoal > 0 && (
                  <span className={`text-2xl font-bold ${getProgressTextColor(stat.progress)}`}>{stat.funded}</span>
                )}
              </div>
              {stat.monthlyGoal > 0 ? (
                <>
                  <div className="text-xs text-gray-400 mb-2">Goal: {stat.monthlyGoal}</div>
                  <div className="relative w-full h-1.5 bg-gray-700 rounded-full mb-3">
                    <div className={`absolute top-0 left-0 h-full rounded-full ${getProgressColor(stat.progress)}`}
                      style={{ width: `${Math.min(stat.progress, 100)}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-gray-400">Apps</p><p className="text-sm font-semibold text-gray-200">{stat.totalApps}</p></div>
                    <div><p className="text-gray-400">Progress</p><p className={`text-sm font-semibold ${getProgressTextColor(stat.progress)}`}>{stat.progress.toFixed(0)}%</p></div>
                    <div><p className="text-gray-400">Funded</p><p className="text-sm font-semibold text-gray-200">{stat.funded}/{stat.monthlyGoal}</p></div>
                    <div><p className="text-gray-400">Need/Day</p><p className="text-sm font-semibold text-gray-200">{stat.neededPerDay}</p></div>
                  </div>
                  {stat.totalAmount > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <p className="text-xs text-green-400 font-semibold">{formatCurrency(stat.totalAmount)}</p>
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400">
                    {stat.daysRemaining} days left • Daily: {stat.dailyGoal}
                  </div>
                </>
              ) : (
                <div className="text-center py-3">
                  <p className="text-gray-400 text-xs mb-1">No goal set</p>
                  <p className="text-xl font-bold text-gray-500">{stat.totalApps}</p>
                  <p className="text-xs text-gray-500">Total Apps</p>
                  {stat.funded > 0 && <p className="text-xs text-green-400 mt-1">{stat.funded} funded</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: REP PERFORMANCE */}
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
            <>
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      {['Rep','Calls','Deals Claimed','Confirmed Deals','Conversion Rate'].map(h => (
                        <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {repPerformance.map(rep => (
                      <tr key={rep.repId} className="hover:bg-gray-750">
                        <td className="px-6 py-4 text-sm font-medium text-gray-200">{rep.repName}</td>
                        <td className="px-6 py-4 text-sm text-gray-300">{rep.calls}</td>
                        <td className="px-6 py-4 text-sm text-gray-300">{rep.dealsClaimed}</td>
                        <td className="px-6 py-4 text-sm text-green-400 font-semibold">{rep.confirmedDeals}</td>
                        <td className="px-6 py-4 text-sm text-blue-400 font-semibold">{rep.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 bg-gray-800 rounded-lg p-4 border border-gray-700 text-sm text-gray-400">
                <strong className="text-gray-200">Currently Showing: {repPeriod.charAt(0).toUpperCase() + repPeriod.slice(1)} View</strong><br />
                • <strong>Calls:</strong> Apps touched in this period<br />
                • <strong>Deals Claimed:</strong> Marked as "Deal"<br />
                • <strong>Confirmed Deals:</strong> Deal → Document Received/Funded/Funding Pending<br />
                • <strong>Conversion Rate:</strong> (Confirmed Deals ÷ Total Calls) × 100
              </div>
            </>
          ) : (
            <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center text-gray-400">No rep activity for this period</div>
          )}
        </div>
      )}

      {/* SECTION 5: CHARTS */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100 mb-4">Trends & Analytics</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Deals by Week
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dealsByWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="week" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem' }} />
                <Bar dataKey="deals" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusDistribution} cx="50%" cy="50%" labelLine={false} label={e => e.name} outerRadius={100} fill="#8884d8" dataKey="value">
                  {statusDistribution.map((_, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* MODALS */}
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
                  {[...new Set(calls.map(c => c.state))].sort().map(state => <option key={state} value={state}>{state}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Monthly Funded Goal</label>
                <input type="number" value={goalForm.monthlyGoal} onChange={e => setGoalForm({ ...goalForm, monthlyGoal: e.target.value })}
                  placeholder="e.g., 200" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Funding Days in Month</label>
                <input type="number" value={goalForm.fundingDays} onChange={e => setGoalForm({ ...goalForm, fundingDays: e.target.value })}
                  placeholder="e.g., 20" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {goalForm.monthlyGoal && goalForm.fundingDays && (
                <div className="bg-gray-700 rounded-lg p-4 text-sm text-gray-300">
                  <strong>Daily Goal:</strong> {Math.round(parseInt(goalForm.monthlyGoal) / parseInt(goalForm.fundingDays))} deals/day<br />
                  <strong>Weekly Goal:</strong> {Math.round((parseInt(goalForm.monthlyGoal) / parseInt(goalForm.fundingDays)) * 5)} deals/week
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSetGoal} disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition">
                {loading ? 'Saving...' : 'Set Goal'}
              </button>
              <button onClick={() => { setShowGoalModal(false); setSelectedState(''); setGoalForm({ monthlyGoal: '', fundingDays: '' }); setError(''); }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showTeamGoals && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Set Team Goals</h3>
            <div className="space-y-4">
              {[{ label: 'Daily', key: 'daily' }, { label: 'Weekly', key: 'weekly' }, { label: 'Monthly', key: 'monthly' }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{label} Team Goal</label>
                  <input type="number" value={teamGoalInput[key as keyof typeof teamGoalInput]}
                    onChange={e => setTeamGoalInput({ ...teamGoalInput, [key]: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSaveTeamGoals} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">Save Goals</button>
              <button onClick={() => setShowTeamGoals(false)} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}