import { useState } from 'react';
import { Search, UserPlus, UserMinus, CheckSquare, Square } from 'lucide-react';
import { mockCalls } from '../lib/mockData';

// Inline types (StackBlitz import workaround)
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
  fuStatus?: 'Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
}

interface AssignTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'rep';
}

// Mock reps for assignment dropdown
const mockReps = [
  { id: 'rep1', name: 'John Smith' },
  { id: 'rep2', name: 'Sarah Johnson' },
];

export default function AssignTab({
  currentUserId,
  currentUserRole,
}: AssignTabProps) {
  const [calls, setCalls] = useState<Call[]>(mockCalls);
  const [selectedCallIds, setSelectedCallIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState('');
  const [selectedRep, setSelectedRep] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Quick Assign states
  const [quickAssignBy, setQuickAssignBy] = useState<'state' | 'dealer' | 'fiType'>('state');
  const [quickAssignValue, setQuickAssignValue] = useState('');
  const [quickAssignRep, setQuickAssignRep] = useState('');

  // Filter calls
  const filteredCalls = calls.filter((call) => {
    const matchesSearch =
      !searchTerm ||
      call.dealerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.applicationId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesState = !filterState || call.state === filterState;

    return matchesSearch && matchesState;
  });

  // Get unique values
  const uniqueStates = Array.from(new Set(calls.map((c) => c.state))).sort();
  const uniqueDealers = Array.from(new Set(calls.map((c) => c.dealerName))).sort();
  const uniqueFiTypes = ['Independent', 'Franchise'];

  // Handle select all
  const handleSelectAll = () => {
    if (selectedCallIds.length === filteredCalls.length) {
      setSelectedCallIds([]);
    } else {
      setSelectedCallIds(filteredCalls.map((c) => c.id));
    }
  };

  // Handle individual checkbox
  const handleSelectCall = (callId: string) => {
    setSelectedCallIds((prev) =>
      prev.includes(callId)
        ? prev.filter((id) => id !== callId)
        : [...prev, callId]
    );
  };

  // Assign calls to rep
  const handleAssign = () => {
    if (!selectedRep || selectedCallIds.length === 0) return;

    const repName = mockReps.find((r) => r.id === selectedRep)?.name || '';

    setCalls((prevCalls) =>
      prevCalls.map((call) =>
        selectedCallIds.includes(call.id)
          ? { ...call, assignedTo: selectedRep, assignedToName: repName }
          : call
      )
    );

    setSuccessMessage(
      `Successfully assigned ${selectedCallIds.length} call(s) to ${repName}`
    );
    setShowSuccess(true);
    setSelectedCallIds([]);
    setSelectedRep('');

    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Unassign calls
  const handleUnassign = () => {
    if (selectedCallIds.length === 0) return;

    setCalls((prevCalls) =>
      prevCalls.map((call) =>
        selectedCallIds.includes(call.id)
          ? { ...call, assignedTo: undefined, assignedToName: undefined }
          : call
      )
    );

    setSuccessMessage(
      `Successfully unassigned ${selectedCallIds.length} call(s)`
    );
    setShowSuccess(true);
    setSelectedCallIds([]);

    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Quick Assign
  const handleQuickAssign = () => {
    if (!quickAssignValue || !quickAssignRep) return;

    const repName = mockReps.find((r) => r.id === quickAssignRep)?.name || '';
    
    let callsToAssign: Call[] = [];

    if (quickAssignBy === 'state') {
      callsToAssign = calls.filter((call) => call.state === quickAssignValue);
    } else if (quickAssignBy === 'dealer') {
      callsToAssign = calls.filter((call) => call.dealerName === quickAssignValue);
    } else if (quickAssignBy === 'fiType') {
      callsToAssign = calls.filter((call) => call.fiType === quickAssignValue);
    }

    setCalls((prevCalls) =>
      prevCalls.map((call) => {
        if (quickAssignBy === 'state' && call.state === quickAssignValue) {
          return { ...call, assignedTo: quickAssignRep, assignedToName: repName };
        } else if (quickAssignBy === 'dealer' && call.dealerName === quickAssignValue) {
          return { ...call, assignedTo: quickAssignRep, assignedToName: repName };
        } else if (quickAssignBy === 'fiType' && call.fiType === quickAssignValue) {
          return { ...call, assignedTo: quickAssignRep, assignedToName: repName };
        }
        return call;
      })
    );

    const assignByLabel = quickAssignBy === 'state' ? 'state' : quickAssignBy === 'dealer' ? 'dealer' : 'FI Type';
    setSuccessMessage(
      `Successfully assigned ${callsToAssign.length} call(s) from ${assignByLabel} "${quickAssignValue}" to ${repName}`
    );
    setShowSuccess(true);
    setQuickAssignValue('');
    setQuickAssignRep('');

    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Only admins can see this tab
  if (currentUserRole !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">
          This tab is only accessible to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Assign Calls</h2>
        <p className="text-gray-400 mt-1">
          Assign calls to sales representatives
        </p>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-900 border border-green-700 text-green-100 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Quick Assign - ALL IN ONE BOX */}
      <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">
          Quick Assign
        </h3>
        
        <div className="space-y-4">
          {/* Assignment Type Selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Assign By
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setQuickAssignBy('state');
                  setQuickAssignValue('');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  quickAssignBy === 'state'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                State
              </button>
              <button
                onClick={() => {
                  setQuickAssignBy('dealer');
                  setQuickAssignValue('');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  quickAssignBy === 'dealer'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Dealer
              </button>
              <button
                onClick={() => {
                  setQuickAssignBy('fiType');
                  setQuickAssignValue('');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  quickAssignBy === 'fiType'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                FI Type
              </button>
            </div>
          </div>

          {/* Selection and Assignment */}
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[250px]">
              <label className="block text-sm text-gray-400 mb-2">
                {quickAssignBy === 'state' && 'Select State'}
                {quickAssignBy === 'dealer' && 'Select Dealer'}
                {quickAssignBy === 'fiType' && 'Select FI Type'}
              </label>
              <select
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                value={quickAssignValue}
                onChange={(e) => setQuickAssignValue(e.target.value)}
              >
                <option value="">Choose...</option>
                {quickAssignBy === 'state' &&
                  uniqueStates.map((state) => (
                    <option key={state} value={state}>
                      {state} ({calls.filter((c) => c.state === state).length} calls)
                    </option>
                  ))}
                {quickAssignBy === 'dealer' &&
                  uniqueDealers.map((dealer) => (
                    <option key={dealer} value={dealer}>
                      {dealer} ({calls.filter((c) => c.dealerName === dealer).length} calls)
                    </option>
                  ))}
                {quickAssignBy === 'fiType' &&
                  uniqueFiTypes.map((type) => (
                    <option key={type} value={type}>
                      {type} ({calls.filter((c) => c.fiType === type).length} calls)
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Assign To Rep
              </label>
              <select
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                value={quickAssignRep}
                onChange={(e) => setQuickAssignRep(e.target.value)}
              >
                <option value="">Choose rep...</option>
                {mockReps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleQuickAssign}
              disabled={!quickAssignValue || !quickAssignRep}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
            >
              <UserPlus className="w-4 h-4" />
              Quick Assign
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Manual Assignment */}
      <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700 space-y-4">
        {/* Search & State Filter */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by dealer or app ID..."
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <select
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
          >
            <option value="">All States</option>
            {uniqueStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        {/* Manual Assignment Actions */}
        <div className="flex gap-4 items-center flex-wrap">
          <p className="text-sm text-gray-400">
            {selectedCallIds.length} call(s) selected
          </p>

          <select
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            disabled={selectedCallIds.length === 0}
          >
            <option value="">Select Rep...</option>
            {mockReps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleAssign}
            disabled={!selectedRep || selectedCallIds.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4 h-4" />
            Assign to Rep
          </button>

          <button
            onClick={handleUnassign}
            disabled={selectedCallIds.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed"
          >
            <UserMinus className="w-4 h-4" />
            Unassign
          </button>
        </div>
      </div>

      {/* Calls Table */}
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-gray-300 hover:text-gray-100"
                  >
                    {selectedCallIds.length === filteredCalls.length &&
                    filteredCalls.length > 0 ? (
                      <CheckSquare className="w-5 h-5" />
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
                  FI Type
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                  Submit Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                  Assigned To
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredCalls.map((call) => (
                <tr
                  key={call.id}
                  className={`hover:bg-gray-750 ${
                    selectedCallIds.includes(call.id) ? 'bg-blue-900/30' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleSelectCall(call.id)}
                      className="text-gray-300 hover:text-gray-100"
                    >
                      {selectedCallIds.includes(call.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-100">
                    {call.applicationId}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {call.dealerName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {call.state}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {call.fiType || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">
                    ${call.buyerFinal.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        call.statusLast === 'Approved'
                          ? 'bg-green-900 text-green-200'
                          : call.statusLast === 'Pending'
                          ? 'bg-yellow-900 text-yellow-200'
                          : 'bg-red-900 text-red-200'
                      }`}
                    >
                      {call.statusLast}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {call.submittedDate}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {call.assignedToName || (
                      <span className="text-gray-500 italic">Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCalls.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No calls found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}