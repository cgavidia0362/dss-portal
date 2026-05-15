import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, Target, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Call {
  id: string;
  state: string;
  fuStatus?: string;
  submittedDate: string;
  dealDate?: Date;
  updatedAt: Date;
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
  monthlyGoal: number;
  fundingDays: number;
  dailyGoal: number;
  weeklyGoal: number;
  progress: number;
  neededPerDay: number;
  daysElapsed: number;
  daysRemaining: number;
}

interface ReportingTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'rep';
  calls: Call[];
  goals: any;
  setGoals: (goals: any) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ReportingTab({
  currentUserId,
  currentUserRole,
  calls,
}: ReportingTabProps) {
  const [stateGoals, setStateGoals] = useState<StateGoal[]>([]);
  const [stateStats, setStateStats] = useState<StateStats[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [goalForm, setGoalForm] = useState({
    monthlyGoal: '',
    fundingDays: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const currentDay = new Date().getDate();

  useEffect(() => {
    fetchStateGoals();
  }, []);

  useEffect(() => {
    if (stateGoals.length > 0) {
      calculateStateStats();
    }
  }, [stateGoals, calls]);

  const fetchStateGoals = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('state_goals')
        .select('*')
        .eq('month', currentMonth)
        .eq('year', currentYear);

      if (fetchError) throw fetchError;

      if (data) {
        const formatted: StateGoal[] = data.map((goal: any) => ({
          id: goal.id,
          state: goal.state,
          month: goal.month,
          year: goal.year,
          monthlyGoal: goal.monthly_goal,
          fundingDays: goal.funding_days,
        }));
        setStateGoals(formatted);
      }
    } catch (err: any) {
      console.error('Error fetching goals:', err);
      setError('Failed to load goals: ' + err.message);
    }
  };

  const calculateStateStats = () => {
    // Get unique states from calls
    const states = [...new Set(calls.map((call) => call.state))].sort();

    const stats: StateStats[] = states.map((state) => {
      const stateCalls = calls.filter((call) => call.state === state);
      const totalApps = stateCalls.length;

      // Count funded deals this month
      const fundedThisMonth = stateCalls.filter((call) => {
        if (!call.dealDate) return false;
        const dealDate = new Date(call.dealDate);
        return (
          (call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal') &&
          dealDate.getMonth() + 1 === currentMonth &&
          dealDate.getFullYear() === currentYear
        );
      }).length;

      // Find goal for this state
      const stateGoal = stateGoals.find((g) => g.state === state);
      const monthlyGoal = stateGoal?.monthlyGoal || 0;
      const fundingDays = stateGoal?.fundingDays || 20;

      // Calculate goals
      const dailyGoal = monthlyGoal > 0 ? Math.round(monthlyGoal / fundingDays) : 0;
      const weeklyGoal = dailyGoal * 5;

      // Calculate progress
      const progress = monthlyGoal > 0 ? (fundedThisMonth / monthlyGoal) * 100 : 0;

      // Calculate pacing (assuming today is a funding day)
      const daysElapsed = Math.min(currentDay, fundingDays);
      const daysRemaining = Math.max(fundingDays - daysElapsed, 1);
      const neededPerDay =
        monthlyGoal > 0 ? Math.ceil((monthlyGoal - fundedThisMonth) / daysRemaining) : 0;

      return {
        state,
        totalApps,
        funded: fundedThisMonth,
        monthlyGoal,
        fundingDays,
        dailyGoal,
        weeklyGoal,
        progress,
        neededPerDay,
        daysElapsed,
        daysRemaining,
      };
    });

    setStateStats(stats);
  };

  const handleSetGoal = async () => {
    if (!selectedState || !goalForm.monthlyGoal || !goalForm.fundingDays) {
      setError('All fields are required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { error: upsertError } = await supabase.from('state_goals').upsert(
        {
          state: selectedState,
          month: currentMonth,
          year: currentYear,
          monthly_goal: parseInt(goalForm.monthlyGoal),
          funding_days: parseInt(goalForm.fundingDays),
          created_by: currentUserId,
        },
        {
          onConflict: 'state,month,year',
        }
      );

      if (upsertError) throw upsertError;

      await fetchStateGoals();
      setShowGoalModal(false);
      setSelectedState('');
      setGoalForm({ monthlyGoal: '', fundingDays: '' });
    } catch (err: any) {
      console.error('Error setting goal:', err);
      setError('Failed to set goal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 90) return 'bg-green-500';
    if (progress >= 70) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getProgressTextColor = (progress: number) => {
    if (progress >= 90) return 'text-green-400';
    if (progress >= 70) return 'text-blue-400';
    if (progress >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Prepare data for charts
  const dealsByWeek = calls.reduce((acc: any[], call) => {
    if (!call.dealDate) return acc;
    const date = new Date(call.dealDate);
    const year = date.getFullYear();
    const dayOfMonth = date.getDate();
    const weekNum = Math.ceil(dayOfMonth / 7);
    const key = `${year}-W${weekNum}`;

    const existing = acc.find((item) => item.week === key);
    if (existing) {
      existing.deals += 1;
    } else {
      acc.push({ week: key, deals: 1 });
    }
    return acc;
  }, []);

  const statusDistribution = calls.reduce((acc: any[], call) => {
    const status = call.fuStatus || 'Unassigned';
    const existing = acc.find((item) => item.name === status);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: status, value: 1 });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Header with Set Goals Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">State Performance</h2>
          <p className="text-gray-400 mt-1">
            {new Date().toLocaleString('default', { month: 'long' })} {currentYear}
          </p>
        </div>
        {currentUserRole === 'admin' && (
          <button
            onClick={() => setShowGoalModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Settings className="w-5 h-5" />
            Set State Goals
          </button>
        )}
      </div>

      {/* State Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stateStats.map((stat) => (
          <div
            key={stat.state}
            className="bg-gray-800 rounded-lg p-6 border border-gray-700"
          >
            {/* State Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-100">{stat.state}</h3>
              {stat.monthlyGoal > 0 && (
                <span
                  className={`text-3xl font-bold ${getProgressTextColor(
                    stat.progress
                  )}`}
                >
                  {stat.funded}
                </span>
              )}
            </div>

            {/* Goal Badge */}
            {stat.monthlyGoal > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-400">
                    Goal: {stat.monthlyGoal}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="relative w-full h-2 bg-gray-700 rounded-full mb-4">
                  <div
                    className={`absolute top-0 left-0 h-full rounded-full ${getProgressColor(
                      stat.progress
                    )}`}
                    style={{ width: `${Math.min(stat.progress, 100)}%` }}
                  />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-400">Apps</p>
                    <p className="text-lg font-semibold text-gray-200">
                      {stat.totalApps}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Funded</p>
                    <p className="text-lg font-semibold text-gray-200">
                      {stat.funded} / {stat.monthlyGoal}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Progress</p>
                    <p className={`text-lg font-semibold ${getProgressTextColor(stat.progress)}`}>
                      {stat.progress.toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Need/Day</p>
                    <p className="text-lg font-semibold text-gray-200">
                      {stat.neededPerDay}
                    </p>
                  </div>
                </div>

                {/* Pacing Info */}
                <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-400">
                  <p>Daily: {stat.dailyGoal} | Weekly: {stat.weeklyGoal}</p>
                  <p className="mt-1">
                    {stat.daysRemaining} days remaining of {stat.fundingDays}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-400 text-sm mb-2">No goal set</p>
                <p className="text-2xl font-bold text-gray-500">{stat.totalApps}</p>
                <p className="text-sm text-gray-500">Total Apps</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deals by Week */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Deals by Week
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dealsByWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="week" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                }}
              />
              <Bar dataKey="deals" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Distribution */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Status Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => entry.name}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {statusDistribution.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Set Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Set State Goal</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  State
                </label>
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select State</option>
                  {[...new Set(calls.map((call) => call.state))]
                    .sort()
                    .map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Monthly Funded Goal
                </label>
                <input
                  type="number"
                  value={goalForm.monthlyGoal}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, monthlyGoal: e.target.value })
                  }
                  placeholder="e.g., 200"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Funding Days in Month
                </label>
                <input
                  type="number"
                  value={goalForm.fundingDays}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, fundingDays: e.target.value })
                  }
                  placeholder="e.g., 20"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Number of working days in this month
                </p>
              </div>

              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-300">
                  {goalForm.monthlyGoal && goalForm.fundingDays ? (
                    <>
                      <strong>Daily Goal:</strong>{' '}
                      {Math.round(
                        parseInt(goalForm.monthlyGoal) / parseInt(goalForm.fundingDays)
                      )}{' '}
                      deals/day
                      <br />
                      <strong>Weekly Goal:</strong>{' '}
                      {Math.round(
                        (parseInt(goalForm.monthlyGoal) / parseInt(goalForm.fundingDays)) *
                          5
                      )}{' '}
                      deals/week
                    </>
                  ) : (
                    'Enter values to see calculated goals'
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSetGoal}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition"
              >
                {loading ? 'Saving...' : 'Set Goal'}
              </button>
              <button
                onClick={() => {
                  setShowGoalModal(false);
                  setSelectedState('');
                  setGoalForm({ monthlyGoal: '', fundingDays: '' });
                  setError('');
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}