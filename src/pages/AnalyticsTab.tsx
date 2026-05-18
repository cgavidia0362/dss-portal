import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, CheckCircle2, Clock, XCircle, Award, Target } from 'lucide-react';

interface Call {
  id: string;
  state: string;
  fuStatus?: string;
  submittedDate: string;
  dealDate?: Date;
  updatedAt: Date;
  assignedTo?: string;
}

interface User {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'rep';
  state?: string;
}

interface AnalyticsTabProps {
  currentUser: User;
  calls: Call[];
}

type TimePeriod = 'daily' | 'weekly' | 'monthly';

export default function AnalyticsTab({ currentUser, calls }: AnalyticsTabProps) {
  const [dealPeriod, setDealPeriod] = useState<TimePeriod>('daily');
  const [stateGoal, setStateGoal] = useState<{ monthlyGoal: number; fundingDays: number } | null>(null);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const currentDay = new Date().getDate();

  useEffect(() => {
    if (currentUser.state) fetchStateGoal(currentUser.state);
  }, [currentUser.state]);

  const fetchStateGoal = async (state: string) => {
    try {
      const { data } = await supabase
        .from('state_goals')
        .select('*')
        .eq('state', state)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .single();
      if (data) setStateGoal({ monthlyGoal: data.monthly_goal, fundingDays: data.funding_days });
    } catch {
      setStateGoal(null);
    }
  };

  // My calls only
  const myCalls = calls.filter(c => c.assignedTo === currentUser.id);

  const getStartDate = (period: TimePeriod) => {
    const now = new Date();
    if (period === 'daily') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return start;
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  };

  const getMyDealsForPeriod = (period: TimePeriod) => {
    const startDate = getStartDate(period);
    return myCalls.filter(c => {
      if (c.fuStatus !== 'Deal' && c.fuStatus !== 'Confirmed Deal') return false;
      const date = c.dealDate ? new Date(c.dealDate) : new Date(c.updatedAt);
      return date >= startDate;
    }).length;
  };

  const myPending = myCalls.filter(c => c.fuStatus === 'Pending').length;
  const myConfirmedDeals = myCalls.filter(c => c.fuStatus === 'Confirmed Deal').length;
  const myNoAnswer = myCalls.filter(c => c.fuStatus === 'No Answer').length;
  const myTotalDeals = myCalls.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal').length;
  const closingRate = myCalls.length > 0 ? ((myTotalDeals / myCalls.length) * 100).toFixed(1) : '0';

  // State performance
  const stateCalls = currentUser.state ? calls.filter(c => c.state === currentUser.state) : [];

  const stateFundedThisMonth = stateCalls.filter(c => {
    if (!c.dealDate) return false;
    const d = new Date(c.dealDate);
    return (
      (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') &&
      d.getMonth() + 1 === currentMonth &&
      d.getFullYear() === currentYear
    );
  }).length;

  const myContributionThisMonth = myCalls.filter(c => {
    if (!c.dealDate) return false;
    const d = new Date(c.dealDate);
    return (
      (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') &&
      d.getMonth() + 1 === currentMonth &&
      d.getFullYear() === currentYear
    );
  }).length;

  const dailyGoal = stateGoal ? Math.round(stateGoal.monthlyGoal / stateGoal.fundingDays) : 0;
  const progress = stateGoal && stateGoal.monthlyGoal > 0
    ? (stateFundedThisMonth / stateGoal.monthlyGoal) * 100
    : 0;
  const daysElapsed = stateGoal ? Math.min(currentDay, stateGoal.fundingDays) : 0;
  const daysRemaining = stateGoal ? Math.max(stateGoal.fundingDays - daysElapsed, 1) : 0;
  const neededPerDay = stateGoal
    ? Math.ceil((stateGoal.monthlyGoal - stateFundedThisMonth) / daysRemaining)
    : 0;

  const getProgressColor = (p: number) => {
    if (p >= 90) return 'bg-green-500';
    if (p >= 70) return 'bg-blue-500';
    if (p >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getProgressTextColor = (p: number) => {
    if (p >= 90) return 'text-green-400';
    if (p >= 70) return 'text-blue-400';
    if (p >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">My Analytics</h2>
        <p className="text-gray-400 mt-1">Your personal performance — {currentUser.name}</p>
      </div>

      {/* SECTION 1: MY DEALS WITH PERIOD TOGGLE */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-100">My Deals</h3>
          <div className="flex gap-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            {(['daily', 'weekly', 'monthly'] as TimePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setDealPeriod(p)}
                className={`px-4 py-2 text-sm font-medium transition ${
                  dealPeriod === p
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 flex items-center gap-6">
          <Award className="w-14 h-14 text-green-400 opacity-60" />
          <div>
            <p className="text-sm text-gray-400 mb-1">
              {dealPeriod.charAt(0).toUpperCase() + dealPeriod.slice(1)} Deals
            </p>
            <p className="text-6xl font-bold text-green-400">{getMyDealsForPeriod(dealPeriod)}</p>
          </div>
        </div>
      </div>

      {/* SECTION 2: STATUS OVERVIEW */}
      <div>
        <h3 className="text-xl font-semibold text-gray-100 mb-4">Status Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-400">Confirmed Deals</p>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-emerald-400">{myConfirmedDeals}</p>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-400">Closing Rate</p>
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-3xl font-bold text-blue-400">{closingRate}%</p>
            <p className="text-xs text-gray-500 mt-1">{myTotalDeals} of {myCalls.length} calls</p>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-400">Pending</p>
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <p className="text-3xl font-bold text-yellow-400">{myPending}</p>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-400">No Answer</p>
              <XCircle className="w-5 h-5 text-orange-400" />
            </div>
            <p className="text-3xl font-bold text-orange-400">{myNoAnswer}</p>
          </div>
        </div>
      </div>

      {/* SECTION 3: STATE PERFORMANCE */}
      <div>
        <h3 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-400" />
          State Performance {currentUser.state ? `— ${currentUser.state}` : ''}
        </h3>

        {currentUser.state ? (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            {stateGoal ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-400 mb-1">Monthly Goal</p>
                    <p className="text-2xl font-bold text-gray-100">{stateGoal.monthlyGoal}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-400 mb-1">State Total (Month)</p>
                    <p className={`text-2xl font-bold ${getProgressTextColor(progress)}`}>
                      {stateFundedThisMonth}
                    </p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-400 mb-1">My Contribution</p>
                    <p className="text-2xl font-bold text-blue-400">{myContributionThisMonth}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-400 mb-1">Daily Goal</p>
                    <p className="text-2xl font-bold text-purple-400">{dailyGoal}</p>
                  </div>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-gray-400">Monthly Progress</p>
                  <p className={`text-sm font-bold ${getProgressTextColor(progress)}`}>
                    {progress.toFixed(0)}%
                  </p>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
                  <div
                    className={`h-3 rounded-full transition-all ${getProgressColor(progress)}`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-gray-700 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Days Elapsed</p>
                    <p className="text-gray-100 font-semibold text-lg">{daysElapsed}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Days Remaining</p>
                    <p className="text-gray-100 font-semibold text-lg">{daysRemaining}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Need Per Day</p>
                    <p className="text-gray-100 font-semibold text-lg">{neededPerDay}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Remaining to Goal</p>
                    <p className="text-gray-100 font-semibold text-lg">
                      {Math.max(stateGoal.monthlyGoal - stateFundedThisMonth, 0)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-400 text-center py-6">
                No goal has been set for {currentUser.state} this month yet.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center text-gray-400">
            No state assigned to your account yet. Ask your admin to assign your state.
          </div>
        )}
      </div>
    </div>
  );
}