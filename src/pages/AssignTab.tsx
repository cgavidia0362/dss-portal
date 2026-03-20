import { useState } from 'react';
import { UserPlus, CheckSquare, Square } from 'lucide-react';
import { mockCalls } from '../lib/mockData';

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
  fuStatus?: 'Deal' | 'Confirmed Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
}

interface AssignTabProps {
  currentUserRole: 'admin' | 'rep';
}

type AssignMode = 'state' | 'dealer' | 'fiType' | 'date';

export default function AssignTab({ currentUserRole }: AssignTabProps) {
  const [calls, setCalls] = useState<Call[]>(mockCalls);
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [selectedRep, setSelectedRep] = useState<string>('');
  
  // Quick assign state
  const [assignMode, setAssignMode] = useState<AssignMode>('state');
  const [quickAssignValue, setQuickAssignValue] = useState('');
  const [quickAssignRep, setQuickAssignRep] = useState('');
  
  // Mock reps data
  const reps = [
    { id: 'rep1', name: 'John Smith' },
    { id: 'rep2', name: 'Sarah Johnson' },
  ];

  // Only admins can see this tab
  if (currentUserRole !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">This tab is only accessible to administrators.</p>
      </div>
    );
  }

  // Get unassigned calls
  const unassignedCalls = calls.filter((call) => !call.assignedTo);
  const assignedCalls = calls.filter((call) => call.assignedTo);

  // Get unique values for dropdowns
  const uniqueStates = Array.from(new Set(unassignedCalls.map((c) => c.state))).sort();
  const uniqueDealers = Array.from(new Set(unassignedCalls.map((c) => c.dealerName))).sort();
  const uniqueFiTypes = Array.from(new Set(unassignedCalls.map((c) => c.fiType).filter(Boolean))).sort();
  const uniqueDates = Array.from(new Set(unassignedCalls.map((c) => c.submittedDate))).sort();

  // Toggle individual call selection
  const toggleCallSelection = (callId: string) => {
    const newSelected = new Set(selectedCalls);
    if (newSelected.has(callId)) {
      newSelected.delete(callId);
    } else {
      newSelected.add(callId);
    }
    setSelectedCalls(newSelected);
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedCalls.size === unassignedCalls.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(unassignedCalls.map((c) => c.id)));
    }
  };

  // Assign selected calls to rep
  const handleAssignSelected = () => {
    if (!selectedRep) {
      alert('Please select a rep to assign to');
      return;
    }
    if (selectedCalls.size === 0) {
      alert('Please select at least one call to assign');
      return;
    }

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

  // Quick assign handler
  const handleQuickAssign = () => {
    if (!quickAssignValue || !quickAssignRep) {
      alert('Please select both criteria and rep');
      return;
    }

    const repName = reps.find((r) => r.id === quickAssignRep)?.name || '';
    
    let callsToAssign: Call[] = [];
    let criteriaLabel = '';

    switch (assignMode) {
      case 'state':
        callsToAssign = unassignedCalls.filter((call) => call.state === quickAssignValue);
        criteriaLabel = `from ${quickAssignValue}`;
        break;
      case 'dealer':
        callsToAssign = unassignedCalls.filter((call) => call.dealerName === quickAssignValue);
        criteriaLabel = `from dealer "${quickAssignValue}"`;
        break;
      case 'fiType':
        callsToAssign = unassignedCalls.filter((call) => call.fiType === quickAssignValue);
        criteriaLabel = `with FI Type "${quickAssignValue}"`;
        break;
      case 'date':
        callsToAssign = unassignedCalls.filter((call) => call.submittedDate === quickAssignValue);
        criteriaLabel = `from date ${quickAssignValue}`;
        break;
    }

    if (callsToAssign.length === 0) {
      alert('No unassigned calls found for this criteria');
      return;
    }

    setCalls((prevCalls) =>
      prevCalls.map((call) =>
        callsToAssign.some((c) => c.id === call.id)
          ? { ...call, assignedTo: quickAssignRep, assignedToName: repName }
          : call
      )
    );

    setQuickAssignValue('');
    setQuickAssignRep('');
    alert(`Assigned ${callsToAssign.length} calls ${criteriaLabel} to ${repName}`);
  };

  // Get options for current assign mode
  const getAssignOptions = () => {
    switch (assignMode) {
      case 'state':
        return uniqueStates.map((state) => ({
          value: state,
          label: `${state} (${unassignedCalls.filter((c) => c.state === state).length} calls)`,
        }));
      case 'dealer':
        return uniqueDealers.map((dealer) => ({
          value: dealer,
          label: `${dealer} (${unassignedCalls.filter((c) => c.dealerName === dealer).length} calls)`,
        }));
      case 'fiType':
        return uniqueFiTypes.map((fiType) => ({
          value: fiType,
          label: `${fiType} (${unassignedCalls.filter((c) => c.fiType === fiType).length} calls)`,
        }));
      case 'date':
        return uniqueDates.map((date) => ({
          value: date,
          label: `${date} (${unassignedCalls.filter((c) => c.submittedDate === date).length} calls)`,
        }));
      default:
        return [];
    }
  };

  const getModeLabel = () => {
    switch (assignMode) {
      case 'state': return 'State';
      case 'dealer': return 'Dealer';
      case 'fiType': return 'FI Type';
      case 'date': return 'Date';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Assign Calls</h2>
        <p className="text-gray-400 mt-1">
          Assign unassigned calls to sales representatives
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Unassigned Calls</p>
              <p className="text-3xl font-bold text-yellow-400 mt-2">
                {unassignedCalls.length}
              </p>
            </div>
            <UserPlus className="w-12 h-12 text-yellow-400" />
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Assigned Calls</p>
              <p className="text-3xl font-bold text-green-400 mt-2">
                {assignedCalls.length}
              </p>
            </div>
            <CheckSquare className="w-12 h-12 text-green-400" />
          </div>
        </div>
      </div>

      {/* Quick Assign */}
      <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">
          Quick Assign
        </h3>

        {/* Mode Selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setAssignMode('state'); setQuickAssignValue(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              assignMode === 'state'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            By State
          </button>
          <button
            onClick={() => { setAssignMode('dealer'); setQuickAssignValue(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              assignMode === 'dealer'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            By Dealer
          </button>
          <button
            onClick={() => { setAssignMode('fiType'); setQuickAssignValue(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              assignMode === 'fiType'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            By FI Type
          </button>
          <button
            onClick={() => { setAssignMode('date'); setQuickAssignValue(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              assignMode === 'date'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            By Date
          </button>
        </div>

        {/* Assignment Controls */}
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-gray-400 mb-2">
              Select {getModeLabel()}
            </label>
            <select
              value={quickAssignValue}
              onChange={(e) => setQuickAssignValue(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
            >
              <option value="">Choose {getModeLabel().toLowerCase()}...</option>
              {getAssignOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-gray-400 mb-2">
              Assign To
            </label>
            <select
              value={quickAssignRep}
              onChange={(e) => setQuickAssignRep(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
            >
              <option value="">Choose rep...</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleQuickAssign}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            Quick Assign
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
              <span className="text-sm text-gray-400">
                {selectedCalls.size} selected
              </span>
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
              >
                <option value="">Assign to...</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAssignSelected}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
              >
                Assign Selected
              </button>
            </div>
          )}
        </div>

        {unassignedCalls.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CheckSquare className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-lg font-medium">All calls have been assigned!</p>
            <p className="text-sm mt-2">
              Upload new calls to assign them to your team.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <button
                      onClick={toggleSelectAll}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      {selectedCalls.size === unassignedCalls.length ? (
                        <CheckSquare className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                    App ID
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                    Dealer Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                    State
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                    FI Type
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {unassignedCalls.map((call) => (
                  <tr
                    key={call.id}
                    className="hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleCallSelection(call.id)}
                  >
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCallSelection(call.id);
                        }}
                        className="text-gray-400 hover:text-gray-200"
                      >
                        {selectedCalls.has(call.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-gray-100">
                      {call.applicationId}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-200">
                      {call.dealerName}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-300">
                      {call.state}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-200">
                      ${call.buyerFinal.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-300">
                      {call.submittedDate}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-300">
                      {call.fiType || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assigned Calls Summary */}
      {assignedCalls.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Assignment Summary
          </h3>
          <div className="space-y-3">
            {reps.map((rep) => {
              const repCalls = assignedCalls.filter(
                (call) => call.assignedTo === rep.id
              );
              return (
                <div
                  key={rep.id}
                  className="flex items-center justify-between bg-gray-700 p-4 rounded-lg"
                >
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
    </div>
  );
}