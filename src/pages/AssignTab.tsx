import { useState, useRef, useEffect } from 'react';
import { UserPlus, CheckSquare, Square, Target, Users, X, Search, ChevronDown } from 'lucide-react';

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
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
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
  currentUserRole: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  calls: Call[];
  setCalls: React.Dispatch<React.SetStateAction<Call[]>>;
  users: User[];
  goals: Goals;
  setGoals: React.Dispatch<React.SetStateAction<Goals>>;
}

type AssignMode = 'state' | 'dealer';

const DEFAULT_SELECTED_STATUSES = new Set([
  'Approved', 'Counter', 'New Application', 'Pending Approval', 'Reconsider',
]);

export default function AssignTab({ currentUserRole, calls, setCalls, users, goals, setGoals }: AssignTabProps) {
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [assignMode, setAssignMode] = useState<AssignMode>('state');
  const [quickAssignValues, setQuickAssignValues] = useState<Set<string>>(new Set());
  const [quickAssignRep, setQuickAssignRep] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dealer selection modal (state mode only)
  const [showDealerModal, setShowDealerModal] = useState(false);
  const [selectedDealers, setSelectedDealers] = useState<Set<string>>(new Set());
  const [dealerModalSearch, setDealerModalSearch] = useState('');

  // Status filter modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(DEFAULT_SELECTED_STATUSES));

  // Unassigned calls search
  const [unassignedSearch, setUnassignedSearch] = useState('');

  // Goal editing
  const [editingRepGoal, setEditingRepGoal] = useState<string | null>(null);
  const [tempRepGoal, setTempRepGoal] = useState<number>(0);
  const [editingTeamGoal, setEditingTeamGoal] = useState(false);
  const [tempTeamGoal, setTempTeamGoal] = useState<number>(0);

  const reps = users.filter(u => u.role === 'rep' && u.active);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (currentUserRole !== 'admin' && currentUserRole !== 'manager') {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">This tab is only accessible to administrators.</p>
      </div>
    );
  }

  const unassignedCalls = calls.filter(call => !call.assignedTo);
  const assignedCalls = calls.filter(call => call.assignedTo);

  const uniqueStates = Array.from(new Set(unassignedCalls.map(c => c.state))).sort();
  const uniqueDealers = Array.from(new Set(unassignedCalls.map(c => c.dealerName))).sort();
  const uniqueStatuses = Array.from(new Set(unassignedCalls.map(c => c.statusLast).filter(Boolean))).sort();

  const filteredUnassigned = unassignedCalls.filter(call =>
    !unassignedSearch ||
    call.applicationId.toLowerCase().includes(unassignedSearch.toLowerCase()) ||
    call.dealerName.toLowerCase().includes(unassignedSearch.toLowerCase()) ||
    call.state.toLowerCase().includes(unassignedSearch.toLowerCase()) ||
    call.statusLast.toLowerCase().includes(unassignedSearch.toLowerCase())
  );

  // Dealers for the selected states (used in dealer modal)
  const dealersForSelectedStates = Array.from(
    new Set(
      unassignedCalls
        .filter(call => quickAssignValues.has(call.state))
        .map(call => call.dealerName)
    )
  ).sort();

  const getDealerCallCount = (dealerName: string) =>
    unassignedCalls.filter(call =>
      quickAssignValues.has(call.state) && call.dealerName === dealerName
    ).length;

  const filteredDealersInModal = dealersForSelectedStates.filter(d =>
    d.toLowerCase().includes(dealerModalSearch.toLowerCase())
  );

  const getOptions = () => {
    if (assignMode === 'state') {
      return uniqueStates.map(state => ({
        value: state,
        label: `${state} (${unassignedCalls.filter(c => c.state === state).length} calls)`,
      }));
    }
    return uniqueDealers.map(dealer => ({
      value: dealer,
      label: `${dealer} (${unassignedCalls.filter(c => c.dealerName === dealer).length} calls)`,
    }));
  };

  const filteredOptions = getOptions().filter(opt =>
    opt.label.toLowerCase().includes(dropdownSearch.toLowerCase())
  );

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

  const toggleQuickAssignValue = (value: string) => {
    const newSet = new Set(quickAssignValues);
    if (newSet.has(value)) newSet.delete(value);
    else newSet.add(value);
    setQuickAssignValues(newSet);
  };

  const toggleStatus = (status: string) => {
    const newSet = new Set(selectedStatuses);
    if (newSet.has(status)) newSet.delete(status);
    else newSet.add(status);
    setSelectedStatuses(newSet);
  };

  const toggleDealer = (dealer: string) => {
    const newSet = new Set(selectedDealers);
    if (newSet.has(dealer)) newSet.delete(dealer);
    else newSet.add(dealer);
    setSelectedDealers(newSet);
  };

  // Preview count for status modal
  const getPreviewCount = () => {
    return unassignedCalls.filter(call => {
      let matchesValue = false;
      if (assignMode === 'state') {
        matchesValue = selectedDealers.size > 0
          ? selectedDealers.has(call.dealerName)
          : quickAssignValues.has(call.state);
      } else {
        matchesValue = quickAssignValues.has(call.dealerName);
      }
      const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(call.statusLast);
      return matchesValue && matchesStatus;
    }).length;
  };

  // Step 1: Quick Assign clicked
  const handleQuickAssignClick = () => {
    if (quickAssignValues.size === 0 || !quickAssignRep) {
      alert('Please select both criteria and a rep');
      return;
    }
    if (assignMode === 'state') {
      // Show dealer selection modal first
      setSelectedDealers(new Set());
      setDealerModalSearch('');
      setShowDealerModal(true);
    } else {
      // By dealer — go straight to status modal
      setShowStatusModal(true);
    }
  };

  // Step 2: Dealer modal continue
  const handleDealerModalContinue = () => {
    if (selectedDealers.size === 0) {
      alert('Please select at least one dealer');
      return;
    }
    setShowDealerModal(false);
    setShowStatusModal(true);
  };

  // Step 3: Confirm assignment
  const handleConfirmAssign = () => {
    const repName = reps.find(r => r.id === quickAssignRep)?.name || '';

    const callsToAssign = unassignedCalls.filter(call => {
      let matchesValue = false;
      if (assignMode === 'state') {
        matchesValue = selectedDealers.has(call.dealerName);
      } else {
        matchesValue = quickAssignValues.has(call.dealerName);
      }
      const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(call.statusLast);
      return matchesValue && matchesStatus;
    });

    if (callsToAssign.length === 0) {
      alert('No calls found matching your criteria.');
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
    setShowDealerModal(false);
    setQuickAssignValues(new Set());
    setSelectedDealers(new Set());
    setQuickAssignRep('');
    alert(`Successfully assigned ${callsToAssign.length} calls to ${repName}`);
  };

  const toggleCallSelection = (callId: string) => {
    const newSelected = new Set(selectedCalls);
    if (newSelected.has(callId)) newSelected.delete(callId);
    else newSelected.add(callId);
    setSelectedCalls(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedCalls.size === filteredUnassigned.length) setSelectedCalls(new Set());
    else setSelectedCalls(new Set(filteredUnassigned.map(c => c.id)));
  };

  const handleAssignSelected = () => {
    if (!selectedRep) { alert('Please select a rep to assign to'); return; }
    if (selectedCalls.size === 0) { alert('Please select at least one call to assign'); return; }
    const repName = reps.find(r => r.id === selectedRep)?.name || '';
    setCalls(prevCalls =>
      prevCalls.map(call =>
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
    setGoals(prev => ({ ...prev, daily: { ...prev.daily, [repId]: tempRepGoal } }));
    setEditingRepGoal(null);
  };

  const handleSaveTeamGoal = () => {
    setGoals(prev => ({ ...prev, team: tempTeamGoal }));
    setEditingTeamGoal(false);
  };

  const getDropdownLabel = () => {
    if (quickAssignValues.size === 0) return `Choose ${assignMode === 'state' ? 'State' : 'Dealer'}(s)...`;
    if (quickAssignValues.size === 1) return Array.from(quickAssignValues)[0];
    return `${quickAssignValues.size} selected`;
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
                  <input type="number" value={tempTeamGoal} onChange={e => setTempTeamGoal(parseInt(e.target.value) || 0)} className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 w-20" autoFocus />
                  <button onClick={handleSaveTeamGoal} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition">Save</button>
                  <button onClick={() => setEditingTeamGoal(false)} className="px-3 py-1 bg-gray-600 text-white rounded text-sm transition">Cancel</button>
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
            {reps.map(rep => (
              <div key={rep.id} className="flex items-center justify-between bg-gray-750 p-4 rounded-lg border border-gray-600">
                <span className="text-gray-200 font-medium">{rep.name}</span>
                {editingRepGoal === rep.id ? (
                  <div className="flex items-center gap-2">
                    <input type="number" value={tempRepGoal} onChange={e => setTempRepGoal(parseInt(e.target.value) || 0)} className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 w-20" autoFocus />
                    <button onClick={() => handleSaveRepGoal(rep.id)} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition">Save</button>
                    <button onClick={() => setEditingRepGoal(null)} className="px-3 py-1 bg-gray-600 text-white rounded text-sm transition">Cancel</button>
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

        <div className="flex gap-2 mb-4">
          {(['state', 'dealer'] as AssignMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => { setAssignMode(mode); setQuickAssignValues(new Set()); setDropdownSearch(''); setDropdownOpen(false); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${assignMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              By {mode === 'state' ? 'State' : 'Dealer'}
            </button>
          ))}
        </div>

        <div className="flex gap-4 flex-wrap items-end">
          {/* Multi-select dropdown */}
          <div className="flex-1 min-w-[250px]" ref={dropdownRef}>
            <label className="block text-sm text-gray-400 mb-2">
              Select {assignMode === 'state' ? 'State' : 'Dealer'}(s)
            </label>
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-left text-gray-100 flex items-center justify-between hover:bg-gray-650 transition"
              >
                <span className={quickAssignValues.size === 0 ? 'text-gray-400' : 'text-gray-100'}>
                  {getDropdownLabel()}
                </span>
                <div className="flex items-center gap-2">
                  {quickAssignValues.size > 0 && (
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{quickAssignValues.size}</span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {dropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-2xl z-30">
                  <div className="p-2 border-b border-gray-600">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={`Search ${assignMode === 'state' ? 'states' : 'dealers'}...`}
                        value={dropdownSearch}
                        onChange={e => setDropdownSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-gray-600 border border-gray-500 rounded text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="px-3 py-2 border-b border-gray-600 flex gap-3">
                    <button onClick={e => { e.stopPropagation(); setQuickAssignValues(new Set(getOptions().map(o => o.value))); }} className="text-xs text-blue-400 hover:text-blue-300">Select All</button>
                    <button onClick={e => { e.stopPropagation(); setQuickAssignValues(new Set()); }} className="text-xs text-red-400 hover:text-red-300">Clear All</button>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredOptions.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-4">No results found</p>
                    ) : (
                      filteredOptions.map(option => {
                        const isChecked = quickAssignValues.has(option.value);
                        return (
                          <label
                            key={option.value}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition ${isChecked ? 'bg-blue-900 bg-opacity-40' : 'hover:bg-gray-600'}`}
                            onClick={e => e.stopPropagation()}
                          >
                            <input type="checkbox" checked={isChecked} onChange={() => toggleQuickAssignValue(option.value)} className="w-4 h-4 accent-blue-500 cursor-pointer" />
                            <span className={`text-sm ${isChecked ? 'text-blue-300 font-medium' : 'text-gray-200'}`}>{option.label}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rep selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-gray-400 mb-2">Assign To</label>
            <select value={quickAssignRep} onChange={e => setQuickAssignRep(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100">
              <option value="">Choose rep...</option>
              {reps.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
            </select>
          </div>

          <button onClick={handleQuickAssignClick} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">
            Quick Assign
            {quickAssignValues.size > 0 && (
              <span className="ml-2 bg-blue-500 px-2 py-0.5 rounded-full text-xs">{quickAssignValues.size}</span>
            )}
          </button>
        </div>

        {/* Step indicator for state mode */}
        {assignMode === 'state' && quickAssignValues.size > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            After clicking Quick Assign, you'll choose which dealers to include from {Array.from(quickAssignValues).join(', ')}.
          </p>
        )}
      </div>

      {/* Unassigned Calls Table */}
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h3 className="text-lg font-semibold text-gray-100">Unassigned Calls ({unassignedCalls.length})</h3>
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by App ID, Dealer, State, Status..."
                value={unassignedSearch}
                onChange={e => setUnassignedSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {unassignedSearch && (
                <button onClick={() => setUnassignedSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {selectedCalls.size > 0 && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">{selectedCalls.size} selected</span>
                <select value={selectedRep} onChange={e => setSelectedRep(e.target.value)} className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm">
                  <option value="">Assign to...</option>
                  {reps.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                </select>
                <button onClick={handleAssignSelected} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">
                  Assign Selected
                </button>
              </div>
            )}
          </div>
          {unassignedSearch && (
            <p className="text-xs text-gray-400 mt-2">Showing {filteredUnassigned.length} of {unassignedCalls.length} unassigned calls</p>
          )}
        </div>

        {filteredUnassigned.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CheckSquare className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-lg font-medium">{unassignedSearch ? 'No calls match your search.' : 'All calls have been assigned!'}</p>
            {!unassignedSearch && <p className="text-sm mt-2">Upload new calls to assign them to your team.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-200">
                      {selectedCalls.size === filteredUnassigned.length && filteredUnassigned.length > 0
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
                {filteredUnassigned.map(call => (
                  <tr key={call.id} className="hover:bg-gray-750 cursor-pointer" onClick={() => toggleCallSelection(call.id)}>
                    <td className="px-4 py-4">
                      <button onClick={e => { e.stopPropagation(); toggleCallSelection(call.id); }} className="text-gray-400 hover:text-gray-200">
                        {selectedCalls.has(call.id) ? <CheckSquare className="w-5 h-5 text-blue-400" /> : <Square className="w-5 h-5" />}
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
            {reps.map(rep => {
              const repCalls = assignedCalls.filter(call => call.assignedTo === rep.id);
              return (
                <div key={rep.id} className="flex items-center justify-between bg-gray-700 p-4 rounded-lg">
                  <span className="text-gray-200 font-medium">{rep.name}</span>
                  <span className="px-3 py-1 bg-blue-900 text-blue-200 rounded-full text-sm font-bold">{repCalls.length} calls assigned</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DEALER SELECTION MODAL */}
      {showDealerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-gray-100">Select Dealers</h3>
              <button onClick={() => setShowDealerModal(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Showing dealers from: <span className="text-blue-400 font-semibold">{Array.from(quickAssignValues).join(', ')}</span>
              <span className="ml-2 text-gray-500">({dealersForSelectedStates.length} dealers, {unassignedCalls.filter(c => quickAssignValues.has(c.state)).length} total calls)</span>
            </p>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search dealers..."
                value={dealerModalSearch}
                onChange={e => setDealerModalSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Select All / Clear */}
            <div className="flex gap-3 mb-3 pb-3 border-b border-gray-700">
              <button
                onClick={() => setSelectedDealers(new Set(dealersForSelectedStates))}
                className="text-sm text-blue-400 hover:text-blue-300 font-medium"
              >
                ✓ Select All ({dealersForSelectedStates.length})
              </button>
              <button
                onClick={() => setSelectedDealers(new Set())}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Clear All
              </button>
              {selectedDealers.size > 0 && (
                <span className="text-sm text-gray-400 ml-auto">{selectedDealers.size} selected</span>
              )}
            </div>

            {/* Dealer list */}
            <div className="max-h-64 overflow-y-auto space-y-1 mb-4">
              {filteredDealersInModal.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No dealers found</p>
              ) : (
                filteredDealersInModal.map(dealer => {
                  const isChecked = selectedDealers.has(dealer);
                  const callCount = getDealerCallCount(dealer);
                  return (
                    <label
                      key={dealer}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition ${isChecked ? 'bg-blue-900 bg-opacity-40' : 'hover:bg-gray-700'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDealer(dealer)}
                        className="w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                      />
                      <span className={`text-sm flex-1 ${isChecked ? 'text-blue-300 font-medium' : 'text-gray-200'}`}>
                        {dealer}
                      </span>
                      <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
                        {callCount} calls
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDealerModalContinue}
                disabled={selectedDealers.size === 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg font-medium transition"
              >
                Continue → ({selectedDealers.size} dealers selected)
              </button>
              <button
                onClick={() => setShowDealerModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
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
              Select which statuses to include. Only matching calls will be assigned.
            </p>
            <div className="flex gap-3 mb-3">
              <button onClick={() => setSelectedStatuses(new Set(uniqueStatuses))} className="text-xs text-blue-400 hover:text-blue-300 underline">Select All</button>
              <button onClick={() => setSelectedStatuses(new Set())} className="text-xs text-red-400 hover:text-red-300 underline">Clear All</button>
              <button onClick={() => setSelectedStatuses(new Set(DEFAULT_SELECTED_STATUSES))} className="text-xs text-green-400 hover:text-green-300 underline">Reset to Defaults</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {uniqueStatuses.map(status => {
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
            <div className="bg-gray-700 rounded-lg p-3 mb-4 text-center">
              <p className="text-gray-300 text-sm">
                This will assign <span className="text-blue-400 font-bold text-lg">{getPreviewCount()}</span> calls to{' '}
                <span className="text-white font-semibold">{reps.find(r => r.id === quickAssignRep)?.name}</span>
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
              <button onClick={() => setShowStatusModal(false)} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}