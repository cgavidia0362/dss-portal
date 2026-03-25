import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, DollarSign, Target } from 'lucide-react';

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

interface Goals {
  daily: { [repId: string]: number };
  team: number;
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ReportingTab({ currentUserId, currentUserRole, calls, goals, setGoals }: ReportingTabProps) {
  const [viewMode, setViewMode] = useState<'all' | 'my'>('all');
  const [editingWeeklyGoal, setEditingWeeklyGoal] = useState(false);
  const [editingMonthlyGoal, setEditingMonthlyGoal] = useState(false);
  const [tempWeeklyGoal, setTempWeeklyGoal] = useState(0);
  const [tempMonthlyGoal, setTempMonthlyGoal] = useState(0);

  const filteredCalls = viewMode === 'my' && currentUserRole === 'rep'
    ? calls.filter((call) => call.assignedTo === currentUserId)
    : calls;

  const totalCalls = filteredCalls.length;
  const deals = filteredCalls.filter((c) => c.fuStatus === 'Deal').length;
  const confirmedDeals = filteredCalls.filter((c) => c.fuStatus === 'Confirmed Deal').length;
  
  const dealAmount = filteredCalls
    .filter((c) => c.fuStatus === 'Deal')
    .reduce((sum, call) => {
      const amount = parseFloat(call.buyerFinal.replace(/[^0-9.-]+/g, ''));
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

  const noDeals = filteredCalls.filter((c) => c.fuStatus === 'No Deal').length;
  const pending = filteredCalls.filter((c) => c.fuStatus === 'Pending').length;
  const noAnswer = filteredCalls.filter((c) => c.fuStatus === 'No Answer').length;

  // Weekly goal progress
  const weeklyGoalProgress = goals.weekly > 0 ? Math.min((deals / goals.weekly) * 100, 100) : 0;

  // Monthly goal progress
  const monthlyGoalProgress = goals.monthly > 0 ? Math.min((deals / goals.monthly) * 100, 100) : 0;

  // Deals by State
  const dealsByState = filteredCalls
    .filter((c) => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal')
    .reduce((acc, call) => {
      acc[call.state] = (acc[call.state] || 0) + 1;
      return acc;
    }, {} as { [state: string]: number });

  const stateData = Object.entries(dealsByState)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Deals by Week (within each month)
  const dealsByWeek = filteredCalls
    .filter((c) => c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal')
    .reduce((acc, call) => {
      const date = new Date(call.submittedDate);
      const year = date.getFullYear();
      const dayOfMonth = date.getDate();
      
      // Calculate week number within the month (1-4)
      const weekInMonth = Math.ceil(dayOfMonth / 7);
      const monthName = date.toLocaleString('default', { month: 'short' });
      
      const key = `${monthName} ${year} - Week ${weekInMonth}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as { [week: string]: number });

  const weekData = Object.entries(dealsByWeek)
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // FU Status Breakdown
  const fuStatusData = [
    { name: 'Deal', value: deals, color: COLORS[0] },
    { name: 'Confirmed Deal', value: confirmedDeals, color: COLORS[1] },
    { name: 'No Deal', value: noDeals, color: COLORS[3] },
    { name: 'Pending', value: pending, color: COLORS[2] },
    { name: 'No Answer', value: noAnswer, color: COLORS[4] },
  ].filter((item) => item.value > 0);

  // Performance by Rep
  const repPerformance = calls.reduce((acc, call) => {
    if (call.assignedTo && call.assignedToName) {
      if (!acc[call.assignedTo]) {
        acc[call.assignedTo] = {
          name: call.assignedToName,
          total: 0,
          deals: 0,
          confirmedDeals: 0,
          noDeals: 0,
          pending: 0,
        };
      }
      acc[call.assignedTo].total += 1;
      if (call.fuStatus === 'Deal') acc[call.assignedTo].deals += 1;
      if (call.fuStatus === 'Confirmed Deal') acc[call.assignedTo].confirmedDeals += 1;
      if (call.fuStatus === 'No Deal') acc[call.assignedTo].noDeals += 1;
      if (call.fuStatus === 'Pending') acc[call.assignedTo].pending += 1;
    }
    return acc;
  }, {} as { [repId: string]: { name: string; total: number; deals: number; confirmedDeals: number; noDeals: number; pending: number } });

  const repData = Object.values(repPerformance);

  const handleSaveWeeklyGoal = () => {
    setGoals((prev) => ({ ...prev, weekly: tempWeeklyGoal }));
    setEditingWeeklyGoal(false);
  };

  const handleSaveMonthlyGoal = () => {
    setGoals((prev) => ({ ...prev, monthly: tempMonthlyGoal }));
    setEditingMonthlyGoal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Reporting</h2>
          <p className="text-gray-400 mt-1">
            Analytics and performance metrics
          </p>
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

      {/* Long-term Goals Management (Weekly & Monthly) */}
      <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-400" />
          Long-term Goals
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          These goals are for reporting and analytics only. Daily goals are managed in the Assign tab.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Weekly Goal */}
          <div className="bg-gray-750 p-4 rounded-lg border border-gray-600">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-300 font-medium">Weekly Goal</span>
              {editingWeeklyGoal ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempWeeklyGoal}
                    onChange={(e) => setTempWeeklyGoal(parseInt(e.target.value) || 0)}
                    className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 w-24"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveWeeklyGoal}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingWeeklyGoal(false)}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-blue-400">{goals.weekly}</span>
                  <button
                    onClick={() => {
                      setEditingWeeklyGoal(true);
                      setTempWeeklyGoal(goals.weekly);
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${weeklyGoalProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {deals} / {goals.weekly} ({weeklyGoalProgress.toFixed(0)}%)
            </p>
          </div>

          {/* Monthly Goal */}
          <div className="bg-gray-750 p-4 rounded-lg border border-gray-600">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-300 font-medium">Monthly Goal</span>
              {editingMonthlyGoal ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempMonthlyGoal}
                    onChange={(e) => setTempMonthlyGoal(parseInt(e.target.value) || 0)}
                    className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 w-24"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveMonthlyGoal}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingMonthlyGoal(false)}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-purple-400">{goals.monthly}</span>
                  <button
                    onClick={() => {
                      setEditingMonthlyGoal(true);
                      setTempMonthlyGoal(goals.monthly);
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all"
                style={{ width: `${monthlyGoalProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {deals} / {goals.monthly} ({monthlyGoalProgress.toFixed(0)}%)
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Calls</p>
              <p className="text-3xl font-bold text-blue-400 mt-2">{totalCalls}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-blue-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Deals</p>
              <p className="text-3xl font-bold text-green-400 mt-2">{deals}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Confirmed Deals</p>
              <p className="text-3xl font-bold text-emerald-400 mt-2">{confirmedDeals}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-emerald-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Deal Amount</p>
              <p className="text-2xl font-bold text-purple-400 mt-2">
                ${dealAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <DollarSign className="w-10 h-10 text-purple-400" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">No Deals</p>
          <p className="text-3xl font-bold text-red-400 mt-2">{noDeals}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Pending</p>
          <p className="text-3xl font-bold text-yellow-400 mt-2">{pending}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">No Answer</p>
          <p className="text-3xl font-bold text-orange-400 mt-2">{noAnswer}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Deals by State
          </h3>
          {stateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stateData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis dataKey="state" type="category" width={50} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '0.5rem',
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-12">No deal data available</p>
          )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Deals by Week
          </h3>
          {weekData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weekData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="week" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '0.5rem',
                  }}
                />
                <Bar dataKey="count" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-12">No deal data available</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            FU Status Breakdown
          </h3>
          {fuStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={fuStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {fuStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
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
          ) : (
            <p className="text-gray-400 text-center py-12">No status data available</p>
          )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Performance by Rep
          </h3>
          {repData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-300">Rep</th>
                    <th className="px-3 py-2 text-center text-gray-300">Total</th>
                    <th className="px-3 py-2 text-center text-gray-300">Deals</th>
                    <th className="px-3 py-2 text-center text-gray-300">Confirmed</th>
                    <th className="px-3 py-2 text-center text-gray-300">Close Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {repData.map((rep, index) => {
                    const closeRate = rep.total > 0 ? ((rep.deals / rep.total) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={index} className="hover:bg-gray-750">
                        <td className="px-3 py-2 text-gray-200">{rep.name}</td>
                        <td className="px-3 py-2 text-center text-gray-300">{rep.total}</td>
                        <td className="px-3 py-2 text-center text-green-400 font-medium">{rep.deals}</td>
                        <td className="px-3 py-2 text-center text-emerald-400 font-medium">{rep.confirmedDeals}</td>
                        <td className="px-3 py-2 text-center text-blue-400 font-medium">{closeRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-12">No rep data available</p>
          )}
        </div>
      </div>
    </div>
  );
}