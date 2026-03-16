import { useState, useMemo } from 'react';
import {
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  PhoneOff,
} from 'lucide-react';
import { mockCalls } from '../lib/mockData';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Inline types
interface Call {
  id: string;
  applicationId: string;
  dealerName: string;
  state: string;
  buyerFinal: number;
  statusLast: string;
  timestampSubmit: Date;
  submittedDate: string;
  assignedTo?: string;
  assignedToName?: string;
  fuStatus?:
    | 'Deal'
    | 'No Deal'
    | 'Pending'
    | 'No Answer'
    | 'Closed'
    | 'Duplicates';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
}

interface ReportingTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'rep';
}

export default function ReportingTab({
  currentUserId,
  currentUserRole,
}: ReportingTabProps) {
  const [viewMode, setViewMode] = useState<'all' | 'mine'>(
    currentUserRole === 'admin' ? 'all' : 'mine'
  );

  // Goals state (admin only)
  const [goals, setGoals] = useState({
    day: 10,
    week: 50,
    month: 200,
  });
  const [editingGoals, setEditingGoals] = useState(false);
  const [tempGoals, setTempGoals] = useState(goals);

  // Filter calls based on view mode
  const filteredCalls = useMemo(() => {
    const calls = mockCalls as Call[];
    if (viewMode === 'mine') {
      return calls.filter((call) => call.assignedTo === currentUserId);
    }
    return calls;
  }, [viewMode, currentUserId]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const deals = filteredCalls.filter((c) => c.fuStatus === 'Deal');
    const totalDealAmount = deals.reduce(
      (sum, call) => sum + call.buyerFinal,
      0
    );

    return {
      total: filteredCalls.length,
      deal: deals.length,
      dealAmount: totalDealAmount,
      noDeal: filteredCalls.filter((c) => c.fuStatus === 'No Deal').length,
      pending: filteredCalls.filter((c) => c.fuStatus === 'Pending').length,
      noAnswer: filteredCalls.filter((c) => c.fuStatus === 'No Answer').length,
    };
  }, [filteredCalls]);

  // Prepare data for pie chart
  const pieData = [
    { name: 'Deal', value: kpis.deal, color: '#10b981' },
    { name: 'No Deal', value: kpis.noDeal, color: '#ef4444' },
    { name: 'Pending', value: kpis.pending, color: '#f59e0b' },
    { name: 'No Answer', value: kpis.noAnswer, color: '#6b7280' },
  ].filter((item) => item.value > 0);

  // Group by rep (for summary table)
  const repSummary = useMemo(() => {
    const repMap: {
      [key: string]: {
        repName: string;
        total: number;
        deal: number;
        noDeal: number;
        pending: number;
        noAnswer: number;
      };
    } = {};

    filteredCalls.forEach((call) => {
      const repId = call.assignedTo || 'unassigned';
      const repName = call.assignedToName || 'Unassigned';

      if (!repMap[repId]) {
        repMap[repId] = {
          repName,
          total: 0,
          deal: 0,
          noDeal: 0,
          pending: 0,
          noAnswer: 0,
        };
      }

      repMap[repId].total++;
      if (call.fuStatus === 'Deal') repMap[repId].deal++;
      if (call.fuStatus === 'No Deal') repMap[repId].noDeal++;
      if (call.fuStatus === 'Pending') repMap[repId].pending++;
      if (call.fuStatus === 'No Answer') repMap[repId].noAnswer++;
    });

    return Object.values(repMap);
  }, [filteredCalls]);

  return (
    <div className="space-y-6">
      {/* Set Goals Section (Admin Only) */}
      {currentUserRole === 'admin' && (
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-100">
                Deal Count Goals
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Set target goals for your team
              </p>
            </div>
            {!editingGoals ? (
              <button
                onClick={() => {
                  setEditingGoals(true);
                  setTempGoals(goals);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Edit Goals
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setGoals(tempGoals);
                    setEditingGoals(false);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingGoals(false);
                    setTempGoals(goals);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Goals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Day Goal */}
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-300">Daily Goal</p>
                {editingGoals ? (
                  <input
                    type="number"
                    value={tempGoals.day}
                    onChange={(e) =>
                      setTempGoals({
                        ...tempGoals,
                        day: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-20 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-gray-100 text-center"
                  />
                ) : (
                  <p className="text-xl font-bold text-blue-400">{goals.day}</p>
                )}
              </div>
              {!editingGoals && (
                <>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-400">Current:</span>
                    <span className="text-gray-100 font-semibold">
                      {kpis.deal}
                    </span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        kpis.deal >= goals.day
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          (kpis.deal / goals.day) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {kpis.deal >= goals.day
                      ? '🎉 Goal achieved!'
                      : `${goals.day - kpis.deal} more to go`}
                  </p>
                </>
              )}
            </div>

            {/* Week Goal */}
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-300">Weekly Goal</p>
                {editingGoals ? (
                  <input
                    type="number"
                    value={tempGoals.week}
                    onChange={(e) =>
                      setTempGoals({
                        ...tempGoals,
                        week: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-20 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-gray-100 text-center"
                  />
                ) : (
                  <p className="text-xl font-bold text-blue-400">
                    {goals.week}
                  </p>
                )}
              </div>
              {!editingGoals && (
                <>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-400">Current:</span>
                    <span className="text-gray-100 font-semibold">
                      {kpis.deal}
                    </span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        kpis.deal >= goals.week
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          (kpis.deal / goals.week) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {kpis.deal >= goals.week
                      ? '🎉 Goal achieved!'
                      : `${goals.week - kpis.deal} more to go`}
                  </p>
                </>
              )}
            </div>

            {/* Month Goal */}
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-300">
                  Monthly Goal
                </p>
                {editingGoals ? (
                  <input
                    type="number"
                    value={tempGoals.month}
                    onChange={(e) =>
                      setTempGoals({
                        ...tempGoals,
                        month: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-20 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-gray-100 text-center"
                  />
                ) : (
                  <p className="text-xl font-bold text-blue-400">
                    {goals.month}
                  </p>
                )}
              </div>
              {!editingGoals && (
                <>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-400">Current:</span>
                    <span className="text-gray-100 font-semibold">
                      {kpis.deal}
                    </span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        kpis.deal >= goals.month
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          (kpis.deal / goals.month) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {kpis.deal >= goals.month
                      ? '🎉 Goal achieved!'
                      : `${goals.month - kpis.deal} more to go`}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header with Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Reporting</h2>
          <p className="text-gray-400 mt-1">
            Follow-up status analytics and trends
          </p>
        </div>

        {/* View Mode Toggle (Admin only) */}
        {currentUserRole === 'admin' && (
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All Calls
            </button>
            <button
              onClick={() => setViewMode('mine')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === 'mine'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              My Calls
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Calls</p>
              <p className="text-2xl font-bold text-gray-100 mt-1">
                {kpis.total}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Deals</p>
              <p className="text-2xl font-bold text-green-400 mt-1">
                {kpis.deal}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Deal Amount</p>
              <p className="text-2xl font-bold text-green-400 mt-1">
                ${(kpis.dealAmount / 1000).toFixed(0)}K
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">No Deals</p>
              <p className="text-2xl font-bold text-red-400 mt-1">
                {kpis.noDeal}
              </p>
            </div>
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Pending</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                {kpis.pending}
              </p>
            </div>
            <Clock className="w-8 h-8 text-yellow-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">No Answer</p>
              <p className="text-2xl font-bold text-gray-400 mt-1">
                {kpis.noAnswer}
              </p>
            </div>
            <PhoneOff className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Pie Chart - Breakdown */}
      <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">
          FU Status Breakdown
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(entry) => `${entry.name}: ${entry.value}`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#f3f4f6',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Table by Rep */}
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100">
            Performance by Rep
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Rep Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Total Calls
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Deals
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  No Deals
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Pending
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  No Answer
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  Close Rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {repSummary.map((rep, index) => {
                const closeRate =
                  rep.total > 0
                    ? ((rep.deal / rep.total) * 100).toFixed(1)
                    : '0.0';
                return (
                  <tr key={index} className="hover:bg-gray-750">
                    <td className="px-6 py-4 text-sm font-medium text-gray-100">
                      {rep.repName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {rep.total}
                    </td>
                    <td className="px-6 py-4 text-sm text-green-400">
                      {rep.deal}
                    </td>
                    <td className="px-6 py-4 text-sm text-red-400">
                      {rep.noDeal}
                    </td>
                    <td className="px-6 py-4 text-sm text-yellow-400">
                      {rep.pending}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {rep.noAnswer}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-100">
                      {closeRate}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {repSummary.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No data available for the selected view.
          </div>
        )}
      </div>
    </div>
  );
}
