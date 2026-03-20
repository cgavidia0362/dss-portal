import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Target, TrendingUp } from 'lucide-react';

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
}

interface Goals {
  daily: number;
  weekly: number;
  monthly: number;
}

interface ReportingTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'rep';
  calls: Call[];
  goals: Goals;
  setGoals: React.Dispatch<React.SetStateAction<Goals>>;
}

export default function ReportingTab({ currentUserId, currentUserRole, calls, goals, setGoals }: ReportingTabProps) {
  const [viewMode, setViewMode] = useState<'all' | 'my'>('all');
  const [editingGoals, setEditingGoals] = useState(false);
  const [tempGoals, setTempGoals] = useState<Goals>(goals);

  const filteredCalls = calls.filter((call) => {
    if (currentUserRole === 'rep') return call.assignedTo === currentUserId;
    if (viewMode === 'my') return call.assignedTo === currentUserId;
    return true;
  });

  // Get current week and month deals
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const dealsThisWeek = filteredCalls.filter((c) => {
    const dealDate = new Date(c.updatedAt);
    return (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && dealDate >= startOfWeek;
  }).length;

  const dealsThisMonth = filteredCalls.filter((c) => {
    const dealDate = new Date(c.updatedAt);
    return (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && dealDate >= startOfMonth;
  }).length;

  const totalCalls = filteredCalls.length;
  const deals = filteredCalls.filter((c) => c.fuStatus === 'Deal');
  const confirmedDeals = filteredCalls.filter((c) => c.fuStatus === 'Confirmed Deal');
  const noDeal = filteredCalls.filter((c) => c.fuStatus === 'No Deal');
  const pending = filteredCalls.filter((c) => c.fuStatus === 'Pending');
  const noAnswer = filteredCalls.filter((c) => c.fuStatus === 'No Answer');

  const dealAmount = deals.reduce((sum, call) => {
    const amount = parseFloat(call.buyerFinal.replace(/[^0-9.-]+/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const confirmedDealAmount = confirmedDeals.reduce((sum, call) => {
    const amount = parseFloat(call.buyerFinal.replace(/[^0-9.-]+/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const dealsByState: { [key: string]: number } = {};
  filteredCalls.forEach((call) => {
    if (call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal') {
      dealsByState[call.state] = (dealsByState[call.state] || 0) + 1;
    }
  });

  const getWeekOfMonth = (date: Date): number => {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    const firstWeekday = firstDayOfMonth.getDay();
    return Math.ceil((dayOfMonth + firstWeekday) / 7);
  };

  const dealsByWeek: { [key: string]: number } = {};
  filteredCalls.forEach((call) => {
    if (call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal') {
      const date = new Date(call.submittedDate);
      const monthYear = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
      const week = getWeekOfMonth(date);
      const key = `${monthYear} - Week ${week}`;
      dealsByWeek[key] = (dealsByWeek[key] || 0) + 1;
    }
  });

  const pieData = [
    { name: 'Deal', value: deals.length, color: '#10b981' },
    { name: 'Confirmed Deal', value: confirmedDeals.length, color: '#059669' },
    { name: 'No Deal', value: noDeal.length, color: '#ef4444' },
    { name: 'Pending', value: pending.length, color: '#f59e0b' },
    { name: 'No Answer', value: noAnswer.length, color: '#f97316' },
  ].filter((item) => item.value > 0);

  const repPerformance = [
    { id: 'rep1', name: 'John Smith' },
    { id: 'rep2', name: 'Sarah Johnson' },
  ].map((rep) => {
    const repCalls = filteredCalls.filter((c) => c.assignedTo === rep.id);
    const repDeals = repCalls.filter((c) => c.fuStatus === 'Deal');
    const repConfirmedDeals = repCalls.filter((c) => c.fuStatus === 'Confirmed Deal');
    const closeRate = repCalls.length > 0 
      ? (((repDeals.length + repConfirmedDeals.length) / repCalls.length) * 100).toFixed(1)
      : '0.0';

    return {
      name: rep.name,
      totalCalls: repCalls.length,
      deals: repDeals.length,
      confirmedDeals: repConfirmedDeals.length,
      closeRate: `${closeRate}%`,
    };
  });

  const handleSaveGoals = () => {
    setGoals(tempGoals);
    setEditingGoals(false);
  };

  const handleCancelGoals = () => {
    setTempGoals(goals);
    setEditingGoals(false);
  };

  const weeklyProgress = goals.weekly > 0 ? Math.min((dealsThisWeek / goals.weekly) * 100, 100) : 0;
  const monthlyProgress = goals.monthly > 0 ? Math.min((dealsThisMonth / goals.monthly) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Reporting</h2>
          <p className="text-gray-400 mt-1">Analytics and performance metrics</p>
        </div>

        {currentUserRole === 'admin' && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All Calls
            </button>
            <button
              onClick={() => setViewMode('my')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === 'my'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              My Calls
            </button>
          </div>
        )}
      </div>

      {/* Goals Section - Admin Only */}
      {currentUserRole === 'admin' && (
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-6 rounded-lg shadow border border-purple-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Target className="w-6 h-6 text-purple-300" />
              <h3 className="text-lg font-semibold text-white">Deal Goals</h3>
            </div>
            {!editingGoals && (
              <button
                onClick={() => setEditingGoals(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition"
              >
                Edit Goals
              </button>
            )}
          </div>

          {editingGoals ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-purple-200 mb-2">Daily Goal</label>
                  <input
                    type="number"
                    value={tempGoals.daily}
                    onChange={(e) => setTempGoals({ ...tempGoals, daily: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-purple-800 border border-purple-600 rounded-lg text-white"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-purple-200 mb-2">Weekly Goal</label>
                  <input
                    type="number"
                    value={tempGoals.weekly}
                    onChange={(e) => setTempGoals({ ...tempGoals, weekly: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-purple-800 border border-purple-600 rounded-lg text-white"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-purple-200 mb-2">Monthly Goal</label>
                  <input
                    type="number"
                    value={tempGoals.monthly}
                    onChange={(e) => setTempGoals({ ...tempGoals, monthly: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-purple-800 border border-purple-600 rounded-lg text-white"
                    min="0"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveGoals}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
                >
                  Save Goals
                </button>
                <button
                  onClick={handleCancelGoals}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-purple-800 bg-opacity-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-purple-200">Daily Goal</p>
                  <TrendingUp className="w-4 h-4 text-purple-300" />
                </div>
                <p className="text-2xl font-bold text-white">{goals.daily}</p>
                <p className="text-xs text-purple-300 mt-1">deals per day</p>
              </div>
              <div className="bg-purple-800 bg-opacity-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-purple-200">Weekly Goal</p>
                  <TrendingUp className="w-4 h-4 text-purple-300" />
                </div>
                <p className="text-2xl font-bold text-white">{dealsThisWeek} / {goals.weekly}</p>
                <div className="w-full bg-purple-950 rounded-full h-2 mt-2">
                  <div
                    className="bg-purple-400 h-2 rounded-full transition-all"
                    style={{ width: `${weeklyProgress}%` }}
                  />
                </div>
                <p className="text-xs text-purple-300 mt-1">{weeklyProgress.toFixed(0)}% complete</p>
              </div>
              <div className="bg-purple-800 bg-opacity-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-purple-200">Monthly Goal</p>
                  <TrendingUp className="w-4 h-4 text-purple-300" />
                </div>
                <p className="text-2xl font-bold text-white">{dealsThisMonth} / {goals.monthly}</p>
                <div className="w-full bg-purple-950 rounded-full h-2 mt-2">
                  <div
                    className="bg-purple-400 h-2 rounded-full transition-all"
                    style={{ width: `${monthlyProgress}%` }}
                  />
                </div>
                <p className="text-xs text-purple-300 mt-1">{monthlyProgress.toFixed(0)}% complete</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Total Calls</p>
          <p className="text-3xl font-bold text-blue-400 mt-2">{totalCalls}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Deals</p>
          <p className="text-3xl font-bold text-green-400 mt-2">{deals.length}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Confirmed Deals</p>
          <p className="text-3xl font-bold text-emerald-500 mt-2">{confirmedDeals.length}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Deal Amount</p>
          <p className="text-2xl font-bold text-green-400 mt-2">
            ${dealAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">No Deals</p>
          <p className="text-3xl font-bold text-red-400 mt-2">{noDeal.length}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Pending</p>
          <p className="text-3xl font-bold text-yellow-400 mt-2">{pending.length}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">No Answer</p>
          <p className="text-3xl font-bold text-orange-400 mt-2">{noAnswer.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Deals by State</h3>
          {Object.keys(dealsByState).length === 0 ? (
            <p className="text-gray-400 text-center py-8">No deals yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(dealsByState)
                .sort(([, a], [, b]) => b - a)
                .map(([state, count]) => (
                  <div key={state} className="flex items-center justify-between">
                    <span className="text-gray-300 font-medium">{state}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{
                            width: `${(count / Math.max(...Object.values(dealsByState))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-gray-200 font-bold w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Deals by Week</h3>
          {Object.keys(dealsByWeek).length === 0 ? (
            <p className="text-gray-400 text-center py-8">No deals yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(dealsByWeek)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([week, count]) => (
                  <div key={week} className="flex items-center justify-between">
                    <span className="text-gray-300 font-medium">{week}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${(count / Math.max(...Object.values(dealsByWeek))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-gray-200 font-bold w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">FU Status Breakdown</h3>
          {pieData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Performance by Rep</h3>
          {repPerformance.every((rep) => rep.totalCalls === 0) ? (
            <p className="text-gray-400 text-center py-8">No calls assigned yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">
                      Rep
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-300">
                      Total
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-300">
                      Deals
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-300">
                      Confirmed
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-300">
                      Close Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {repPerformance.map((rep) => (
                    <tr key={rep.name} className="border-b border-gray-700">
                      <td className="py-3 px-3 text-sm text-gray-200">{rep.name}</td>
                      <td className="py-3 px-3 text-sm text-gray-300 text-right">
                        {rep.totalCalls}
                      </td>
                      <td className="py-3 px-3 text-sm text-green-400 text-right">
                        {rep.deals}
                      </td>
                      <td className="py-3 px-3 text-sm text-emerald-500 text-right">
                        {rep.confirmedDeals}
                      </td>
                      <td className="py-3 px-3 text-sm text-blue-400 text-right font-bold">
                        {rep.closeRate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}