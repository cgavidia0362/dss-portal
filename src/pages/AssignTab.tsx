import { useState } from 'react';
import { UserPlus, CheckSquare, Square, Target, Users, X } from 'lucide-react';

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

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'rep';
  active: boolean;
  allowedStatuses: string[];
}

interface Goals {
  daily: { [repId: string]: number };
  team: number;
  weekly: number;
  monthly: number;
}

interface AssignTabProps {
  currentUserRole: 'admin' | 'manager' | 'rep';
  calls: Call[];
  setCalls: React.Dispatch<React.SetStateAction<Call[]>>;
  users: User[];
  goals: Goals;
  setGoals: React.Dispatch<React.SetStateAction<Goals>>;
}

type AssignMode = 'state' | 'dealer' | 'date';

const DEFAULT_SELECTED_STATUSES = new Set([
  'Approved', 'Counter', 'New Application', 'Pending Approval', 'Reconsider',
]);

export default function AssignTab({ currentUserRole, calls, setCalls, users, goals, setGoals }: AssignTabProps) {
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [assignMode, setAssignMode] = useState<AssignMode>('state');
  const [quickAssignValues, setQuickAssignValues] = useState<Set<string>>(new Set());
  const [quickAssignRep, setQuickAssignRep] = useState('');

  // Status filter modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(DEFAULT_SELECTED_STATUSES));

  const [editingRepGoal, setEditingRepGoal] = useState<string | null>(null);
  const [tempRepGoal, setTempRepGoal] = useState<number>(0);
  const [editingTeamGoal, setEditingTeamGoal] = useState(false);
  const [tempTeamGoal, setTempTeamGoal] = useState<number>(0);

  const reps = users.filter(u => u.role === 'rep' && u.active);

  if (currentUserRole !== 'admin' && currentUserRole !== 'manager') {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">This tab is only accessible to administrators.</p>
      </div>
    );
  }

  const unassignedCalls = calls.filter((call) => !call.assignedTo);
  const assignedCalls = calls.filter((call) => call.assignedTo);

  const uniqueStates = Array.from(new Set(unassignedCalls.map((c) => c.state))).sort();
  const uniqueDealers = Array.from(new Set(unassignedCalls.map((c) => c.dealerName))).sort();
  const uniqueDates = Array.from(new Set(unassignedCalls.map((c) => c.submittedDate))).sort();
  const uniqueStatuses = Array.from(new Set(unassignedCalls.map((c) => c.statusLast).filter(Boolean))).sort();

  // Status chip color
  const getStatusColor = (status: string, isSelected: boolean) => {
    if (!isSelected) return 'bg-gray-700 text-gray-400 border border-gray-600';
    const s = status.toLowerCase();
    if (s.includes('approved') || s.includes('approval')) return 'bg-green-600 text-white';
    if (s.includes('counter')) return 'bg-yellow-500 text-gray-900';
    if (s.includes('denial') || s.includes('declined')) return 'bg-red-600 text-white';
    if (s.includes('accepted')) return 'bg-blue-600 text-white';
    if (s.includes('pending')) return 'bg-orange-500 text-white';
    if (s.includes('document') || s.includes('funded') || s.includes('funding')) return 'bg-emerald-600 text-white';
    if (s.includes('new application')) return 'bg-cyan-600 text-white';
    if (s.includes('reconsider')) return 'bg-purple-600 text-white';
    if (s.includes('returned')) return 'bg-pink-600 text-white';
    return 'bg-blue-600 text-white';
  };

  // Toggle a quick assign value (multi-select)
  const toggleQuickAssignValue = (value: string) => {
    const newSet = new Set(quickAssignValues);
    if (newSet.has(value)) newSet.delete(value);
    else newSet.add(value);
    setQuickAssignValues(newSet);
  };

  // Toggle status in modal
  const toggleStatus = (status: string) => {
    const newSet = new Set(selectedStatuses);
    if (newSet.has(status)) newSet.delete(status);
    else newSet.add(status);
    setSelectedStatuses(newSet);
  };

  // Preview count of calls that will be assigned
  const getPreviewCount = () => {
    return unassignedCalls.filter(call => {
      let matchesValue = false;
      if (assignMode === 'state') matchesValue = quickAssignValues.has(call.state);
      if (assignMode === 'dealer') matchesValue = quickAssignValues.has(call.dealerName);
      if (assignMode === 'date') matchesValue = quickAssignValues.has(call.submittedDate);
      const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(call.statusLast);
      return matchesValue && matchesStatus;
    }).length;
  };

  const handleQuickAssignClick = () => {
    if (quickAssignValues.size === 0 || !quickAssignRep) {
      alert('Please select both criteria and a rep');
      return;
    }
    setShowStatusModal(true);
  };

  const handleConfirmAssign = () => {
    const repName = reps.find(r => r.id === quickAssignRep)?.name || '';

    const callsToAssign = unassignedCalls.filter(call => {
      let matchesValue = false;
      if (assignMode === 'state') matchesValue = quickAssignValues.has(call.state);
      if (assignMode === 'dealer') matchesValue = quickAssignValues.has(call.dealerName);
      if (assignMode === 'date') matchesValue = quickAssignValues.has(call.submittedDate);
      const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(call.statusLast);
      return matchesValue && matchesStatus;
    });

    if (callsToAssign.length === 0) {
      alert('No calls found matching your criteria and status filters.');
      setShowStatusModal(false);
      return;
    }

    setCalls(prevCalls =>
      prevCalls.map(call =>
        callsToAssign.some(c => c.id === call.id)
          ? { ...call, assignedTo: quickAssignRep, assignedToName: repName }
          : call
      )
    );

    setShowStatusModal(false);
    setQuickAssignValues(new Set());
    setQuickAssignRep('');
    alert(`Successfully assigned ${callsToAssign.length} calls to ${repName}`);
  };

  const getAssignOptions = () => {
    switch (assignMode) {
      case 'state':
        return uniqueStates.map(state => ({
          value: state,
          label: `${state} (${unassignedCalls.filter(c => c.state === state).length} calls)`,
        }));
      case 'dealer':
        return uniqueDealers.map(dealer => ({
          value: dealer,
          label: `${dealer} (${unassignedCalls.filter(c => c.dealerName === dealer).length} calls)`,
        }));
      case 'date':
        return uniqueDates.map(date => ({
          value: date,
          label: `${date} (${unassignedCalls.filter(c => c.submittedDate === date).length} calls)`,
        }));
      default:
        return [];
    }
  };

  const getModeLabel = () => {
    if (assignMode === 'state') return 'State';
    if (assignMode === 'dealer') return 'Dealer';
    return 'Date';
  };

  const toggleCallSelection = (callId: string) => {
    const newSelected = new Set(selectedCalls);
    if (newSelected.has(callId)) newSelected.delete(callId);
    else newSelected.add(callId);
    setSelectedCalls(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedCalls.size === unassignedCalls.length) setSelectedCalls(new Set());
    else setSelectedCalls(new Set(unassignedCalls.map((c) => c.id)));
  };

  const handleAssignSelected = () => {
    if (!selectedRep) { alert('Please select a rep to assign to'); return; }
    if (selectedCalls.size === 0) { alert('Please select at least one call to assign'); return; }
    const repName = reps.find((r) => r.id === selectedRep)?.name || '';
    setCalls((prevCalls) =>
      prevCalls.map((call) =>
        selectedCalls.has(call.id)
          ? { ...call, assignedTo: selectedRep, assignedToName: repName }
          : call
      )
    );
    setSelectedCalls(new Set());
    setSelectedRep('');
    alert(`Successfully assigned ${selectedCalls.size} calls to ${repName}`);
  };

  const handleSaveRepGoal = (repId: string) => {
    setGoals((prev) => ({ ...prev, daily: { ...prev.daily, [repId]: tempRepGoal } }));
    setEditingRepGoal(null);
  };

  const handleSaveTeamGoal = () => {
    setGoals((prev) => ({ ...prev, team: tempTeamGoal }));
    setEditingTeamGoal(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Assign Calls</h2>
        <p className="text-gray-400 mt-1">Assign unassigned calls to sales representatives</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Unassigned Calls</p>
              <p className="text-3xl font-bold text-yellow-400 mt-2">{unassignedCalls.length}</p>
            </div>
            <UserPlus className="w-12 h-12 text-yellow-400" />
          </div>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Assigned Calls</p>
              <p className="text-3xl font-bold text-green-400 mt-2">{assignedCalls.length}</p>
            </div>
            <CheckSquare className="w-12 h-12 text-green-400" />
          </div>
        </div>
      </div>

      {/* Daily Goals */}
      <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-400" />
          Daily Goals
        </h3>
        <div className="space-y-4">
          <div className="bg-gray-750 p-4 rounded-lg border border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-cyan-400" />
                <span className="text-gray-200 font-medium">Team Goal (Daily)</span>
              </div>
              {editingTeamGoal ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={tempTeamGoal} onChange={(e) => setTempTeamGoal(parseInt(e.target.value) || 0)} className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 w-20" autoFocus />
                  <button onClick={handleSaveTeamGoal} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition">Save</button>
                  <button onClick={() => setEditingTeamGoal(false)} className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-cyan-400">{goals.team}</span>
                  <button onClick={() => { setEditingTeamGoal(true); setTempTeamGoal(goals.team); }} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition">Edit</button>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-300">Individual Goals (Daily)</p>
            {reps.map((rep) => (
              <div key={rep.id} className="flex items-center justify-between bg-gray-750 p-4 rounded-lg border border-gray-600">
                <span className="text-gray-200 font-medium">{rep.name}</span>
                {editingRepGoal === rep.id ? (
                  <div className="flex items-center gap-2">
                    <input type="number" value={tempRepGoal} onChange={(e) => setTempRepGoal(parseInt(e.target.value) || 0)} className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 w-20" autoFocus />
                    <button onClick={() => handleSaveRepGoal(rep.id)} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition">Save</button>
                    <button onClick={() => setEditingRepGoal(null)} className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-purple-400">{goals.daily[rep.id] || 0}</span>
                    <button onClick={() => { setEditingRepGoal(rep.id); setTempRepGoal(goals.daily[rep.id] || 0); }} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition">Edit</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Assign */}
      <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Quick Assign</h3>

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-4">
          {(['state', 'dealer', 'date'] as AssignMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => { setAssignMode(mode); setQuickAssignValues(new Set()); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                assignMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              By {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Multi-select chips for state/dealer/date */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">
              Select {getModeLabel()}(s) — click multiple to assign at once
            </label>
            {quickAssignValues.size > 0 && (
              <button onClick={() => setQuickAssignValues(new Set())} className="text-xs text-blue-400 hover:text-blue-300 underline">
                Clear ({quickAssignValues.size} selected)
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-gray-750 rounded-lg border border-gray-600">
            {getAssignOptions().map((option) => {
              const isSelected = quickAssignValues.has(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => toggleQuickAssignValue(option.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rep selector + Quick Assign button */}
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-gray-400 mb-2">Assign To</label>
            <select
              value={quickAssignRep}
              onChange={(e) => setQuickAssignRep(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
            >
              <option value="">Choose rep...</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>{rep.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleQuickAssignClick}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            Quick Assign
            {quickAssignValues.size > 0 && (
              <span className="ml-2 bg-blue-500 px-2 py-0.5 rounded-full text-xs">
                {quickAssignValues.size} selected
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Unassigned Calls Table */}
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-100">
            Unassigned Calls ({unassignedCalls.length})
          </h3>
          {selectedCalls.size > 0 && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{selectedCalls.size} selected</span>
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
              >
                <option value="">Assign to...</option>
                {reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
              </select>
              <button onClick={handleAssignSelected} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">
                Assign Selected
              </button>
            </div>
          )}
        </div>

        {unassignedCalls.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CheckSquare className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-lg font-medium">All calls have been assigned!</p>
            <p className="text-sm mt-2">Upload new calls to assign them to your team.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-200">
                      {selectedCalls.size === unassignedCalls.length
                        ? <CheckSquare className="w-5 h-5 text-blue-400" />
                        : <Square className="w-5 h-5" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">App ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Dealer Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">State</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Status Last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {unassignedCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-750 cursor-pointer" onClick={() => toggleCallSelection(call.id)}>
                    <td className="px-4 py-4">
                      <button onClick={(e) => { e.stopPropagation(); toggleCallSelection(call.id); }} className="text-gray-400 hover:text-gray-200">
                        {selectedCalls.has(call.id)
                          ? <CheckSquare className="w-5 h-5 text-blue-400" />
                          : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-gray-100">{call.applicationId}</td>
                    <td className="px-4 py-4 text-sm text-gray-200">{call.dealerName}</td>
                    <td className="px-4 py-4 text-sm text-gray-300">{call.state}</td>
                    <td className="px-4 py-4 text-sm text-gray-200">{call.buyerFinal}</td>
                    <td className="px-4 py-4 text-sm text-gray-300">{call.submittedDate}</td>
                    <td className="px-4 py-4 text-sm text-gray-300">{call.statusLast}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assignment Summary */}
      {assignedCalls.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Assignment Summary</h3>
          <div className="space-y-3">
            {reps.map((rep) => {
              const repCalls = assignedCalls.filter(call => call.assignedTo === rep.id);
              return (
                <div key={rep.id} className="flex items-center justify-between bg-gray-700 p-4 rounded-lg">
                  <span className="text-gray-200 font-medium">{rep.name}</span>
                  <span className="px-3 py-1 bg-blue-900 text-blue-200 rounded-full text-sm font-bold">
                    {repCalls.length} calls assigned
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STATUS FILTER MODAL */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-100">Filter by Application Status</h3>
              <button onClick={() => setShowStatusModal(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              Select which statuses to include. Only calls matching these statuses will be assigned.
            </p>

            {/* Select All / Clear All */}
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => setSelectedStatuses(new Set(uniqueStatuses))}
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedStatuses(new Set())}
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                Clear All
              </button>
              <button
                onClick={() => setSelectedStatuses(new Set(DEFAULT_SELECTED_STATUSES))}
                className="text-xs text-green-400 hover:text-green-300 underline"
              >
                Reset to Defaults
              </button>
            </div>

            {/* Status Chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              {uniqueStatuses.map((status) => {
                const isSelected = selectedStatuses.has(status);
                return (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${getStatusColor(status, isSelected)}`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>

            {/* Preview count */}
            <div className="bg-gray-700 rounded-lg p-3 mb-4 text-center">
              <p className="text-gray-300 text-sm">
                This will assign{' '}
                <span className="text-blue-400 font-bold text-lg">{getPreviewCount()}</span>
                {' '}calls to{' '}
                <span className="text-white font-semibold">
                  {reps.find(r => r.id === quickAssignRep)?.name}
                </span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmAssign}
                disabled={getPreviewCount() === 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg font-medium transition"
              >
                Assign {getPreviewCount()} Calls
              </button>
              <button
                onClick={() => setShowStatusModal(false)}
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