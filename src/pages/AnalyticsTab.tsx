import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  state?: string;
}

interface FundingData {
  [state: string]: {
    count: number;
    totalAmount: number;
  };
}

interface DailyDealSummary {
  id: string;
  addedBy: string;
  fuStatus: string;
  dealDate: string;
  amount: string;
}

interface AnalyticsTabProps {
  currentUser: User;
  calls: Call[];
  fundingData: FundingData;
  todayDailyDeals?: DailyDealSummary[];
}

interface PerStateGoal {
  monthlyGoal: number;
  fundingDays: number;
}

type TimePeriod = 'daily' | 'weekly' | 'monthly';

export default function AnalyticsTab({ currentUser, calls, fundingData, todayDailyDeals }: AnalyticsTabProps) {
  const [dealPeriod, setDealPeriod] = useState<TimePeriod>('daily');
  const [perStateGoals, setPerStateGoals] = useState<{ [state: string]: PerStateGoal }>({});

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const currentDay = new Date().getDate();

  // Parse rep's states
  const repStates = (currentUser.state || '').split(',').map(s => s.trim()).filter(Boolean);

  useEffect(() => {
    if (repStates.length > 0) fetchStateGoals(repStates);
  }, [currentUser.state]);

  const fetchStateGoals = async (stateList: string[]) => {
    try {
      const { data } = await supabase
        .from('state_goals').select('*')
        .in('state', stateList).eq('month', currentMonth).eq('year', currentYear);
      if (data) {
        const goalMap: { [state: string]: PerStateGoal } = {};
        data.forEach((g: any) => {
          goalMap[g.state] = { monthlyGoal: g.monthly_goal, fundingDays: g.funding_days };
        });
        setPerStateGoals(goalMap);
      }
    } catch {
      setPerStateGoals({});
    }
  };

  const myCalls = calls.filter(c => c.assignedTo === currentUser.id);

  const getStartDate = (period: TimePeriod) => {
    const now = new Date();
    if (period === 'daily') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'weekly') {
      const s = new Date(now);
      s.setDate(now.getDate() - now.getDay());
      s.setHours(0, 0, 0, 0);
      return s;
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  };

  const getMyDealsForPeriod = (period: TimePeriod) => {
    const startDate = getStartDate(period);
    const csvDeals = myCalls.filter(c => {
      if (c.fuStatus !== 'Deal' && c.fuStatus !== 'Confirmed Deal') return false;
      const date = c.dealDate ? new Date(c.dealDate) : new Date(c.updatedAt);
      return date >= startDate;
    }).length;
    if (period === 'daily') {
      const myDailyDeals = (todayDailyDeals || []).filter(d =>
        d.addedBy === currentUser.id &&
        (d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal')
      ).length;
      return csvDeals + myDailyDeals;
    }
    return csvDeals;
  };

  const myDeals = getMyDealsForPeriod(dealPeriod);
  const myConfirmedDeals = myCalls.filter(c => c.fuStatus === 'Confirmed Deal').length;
  const myPending = myCalls.filter(c => c.fuStatus === 'Pending').length;
  const myNoAnswer = myCalls.filter(c => c.fuStatus === 'No Answer').length;
  const myTotalDeals = myCalls.filter(c => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal').length;
  const closingRate = myCalls.length > 0 ? ((myTotalDeals / myCalls.length) * 100).toFixed(1) : '0';

  const hasDailyDealsBonus = dealPeriod === 'daily' &&
    (todayDailyDeals || []).filter(d =>
      d.addedBy === currentUser.id &&
      (d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal')
    ).length > 0;

    const countBusinessDaysElapsed = (year: number, month: number, toDay: number): number => {
      let count = 0;
      for (let d = 1; d <= toDay; d++) {
        const date = new Date(year, month - 1, d);
        const dow = date.getDay();
        if (dow !== 0 && dow !== 6) count++;
      }
      return count;
    };
  
  // Build per-state performance data
  const statePerformanceData = repStates.map(st => {
    const goal = perStateGoals[st];
    const monthlyGoal = goal?.monthlyGoal || 0;
    const fundingDays = goal?.fundingDays || 20;
    const dailyGoal = monthlyGoal > 0 ? Math.round(monthlyGoal / fundingDays) : 0;

    // Total funded for this state (from funding report or from calls)
    const totalFunded = fundingData[st]
      ? fundingData[st].count
      : myCalls.filter(c => {
          if (c.state !== st || !c.dealDate) return false;
          const d = new Date(c.dealDate);
          return (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') &&
            d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
        }).length;

    // My contribution to this state this month
    const myDealsForState = myCalls.filter(c => {
      if (c.state !== st || !c.dealDate) return false;
      const d = new Date(c.dealDate);
      return (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') &&
        d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
    }).length;

    const progress = monthlyGoal > 0 ? (totalFunded / monthlyGoal) * 100 : 0;
    const daysElapsed = countBusinessDaysElapsed(currentYear, currentMonth, currentDay);
    const daysRemaining = Math.max(fundingDays - daysElapsed, 0);
    const neededPerDay = monthlyGoal > 0 && daysRemaining > 0
      ? Math.ceil((monthlyGoal - totalFunded) / daysRemaining) : 0;
    const remainingToGoal = Math.max(monthlyGoal - totalFunded, 0);
    const hasFundingReport = !!fundingData[st];

    return {
      state: st, monthlyGoal, fundingDays, dailyGoal,
      totalFunded, myDealsForState, progress,
      daysElapsed, daysRemaining, neededPerDay, remainingToGoal,
      hasFundingReport, hasGoal: !!goal,
    };
  });

  const getProgressColor = (p: number) =>
    p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-blue-500' : p >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const getProgressTextColor = (p: number) =>
    p >= 90 ? 'text-green-400' : p >= 70 ? 'text-blue-400' : p >= 50 ? 'text-yellow-400' : 'text-red-400';

  const periodLabel = dealPeriod.charAt(0).toUpperCase() + dealPeriod.slice(1);

  return (
    <div className="space-y-5">

      {/* HEADER + TOGGLE */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">My Analytics</h2>
          <p className="text-sm text-gray-400 mt-0.5">Your personal performance — {currentUser.name}</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-gray-700">
          {(['daily', 'weekly', 'monthly'] as TimePeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setDealPeriod(p)}
              className={`px-5 py-2 text-sm font-medium transition ${
                dealPeriod === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-5 gap-3">

        {/* My Deals */}
        <div className="bg-gray-800 rounded-lg border border-green-800 p-4 flex flex-col gap-1.5">
          <p className="text-xs text-green-400 uppercase tracking-wider">My Deals</p>
          <p className="text-4xl font-bold text-green-400 leading-none">{myDeals}</p>
          <p className="text-xs text-gray-500">
            {periodLabel.toLowerCase()}
            {hasDailyDealsBonus && <span className="ml-1.5 text-green-500">+daily entries</span>}
          </p>
        </div>

        {/* Confirmed */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-1.5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Confirmed</p>
          <p className="text-4xl font-bold text-emerald-400 leading-none">{myConfirmedDeals}</p>
          <p className="text-xs text-gray-500">confirmed deals</p>
        </div>

        {/* Closing Rate */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-1.5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Closing Rate</p>
          <p className="text-4xl font-bold text-blue-400 leading-none">{closingRate}%</p>
          <p className="text-xs text-gray-500">{myTotalDeals} of {myCalls.length} calls</p>
        </div>

        {/* Pending */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-1.5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Pending</p>
          <p className="text-4xl font-bold text-yellow-400 leading-none">{myPending}</p>
          <p className="text-xs text-gray-500">awaiting response</p>
        </div>

        {/* No Answer */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-1.5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">No Answer</p>
          <p className="text-4xl font-bold text-orange-400 leading-none">{myNoAnswer}</p>
          <p className="text-xs text-gray-500">unanswered</p>
        </div>

      </div>

      {/* STATE PERFORMANCE — one card per state */}
      {repStates.length > 0 ? (
        <div className="space-y-4">
          {statePerformanceData.map(sd => (
            <div key={sd.state} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">

              {/* Card header */}
              <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <p className="text-sm font-semibold text-gray-200">
                  State Performance — {sd.state}
                </p>
              </div>

              <div className="p-5">
                {sd.hasGoal ? (
                  <>
                    {/* Top: 4 metric boxes */}
                    <div className="grid grid-cols-4 gap-3 mb-5">
                      <div className="bg-gray-750 rounded-lg p-3 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Monthly Goal</p>
                        <p className="text-xl font-bold text-gray-100 leading-none">{sd.monthlyGoal}</p>
                      </div>
                      <div className="bg-gray-750 rounded-lg p-3 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                          {sd.state} Total Funded
                        </p>
                        <p className={`text-xl font-bold leading-none ${getProgressTextColor(sd.progress)}`}>
                          {sd.totalFunded}
                        </p>
                        {sd.hasFundingReport && (
                          <p className="text-xs text-green-500 mt-1">from funding report</p>
                        )}
                      </div>
                      <div className="bg-gray-750 rounded-lg p-3 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                          My Deals ({sd.state})
                        </p>
                        <p className="text-xl font-bold text-blue-400 leading-none">{sd.myDealsForState}</p>
                        <p className="text-xs text-gray-500 mt-1">this month</p>
                      </div>
                      <div className="bg-gray-750 rounded-lg p-3 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Daily Goal</p>
                        <p className="text-xl font-bold text-purple-400 leading-none">{sd.dailyGoal}</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Monthly Progress</p>
                        <p className={`text-sm font-bold ${getProgressTextColor(sd.progress)}`}>
                          {sd.progress.toFixed(0)}%
                        </p>
                      </div>
                      <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(sd.progress)}`}
                          style={{ width: `${Math.min(sd.progress, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Bottom: 4 stat pills */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Days Elapsed', value: sd.daysElapsed, color: 'text-gray-200' },
                        { label: 'Days Left', value: sd.daysRemaining, color: 'text-gray-200' },
                        { label: 'Need / Day', value: sd.neededPerDay, color: 'text-yellow-400' },
                        { label: 'To Goal', value: sd.remainingToGoal, color: 'text-red-400' },
                      ].map(stat => (
                        <div key={stat.label}
                          className="flex items-center justify-between border border-gray-700 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-gray-400">{stat.label}</p>
                          <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-base font-medium text-gray-400">
                      No goal set for {sd.state} this month.
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Ask your admin to set a state goal in the Reporting tab.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
          <p className="text-base font-medium text-gray-400">No state assigned to your account.</p>
          <p className="text-sm text-gray-500 mt-1">
            Ask your admin to assign your state in the Users tab.
          </p>
        </div>
      )}

    </div>
  );
}