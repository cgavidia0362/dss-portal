import { useState, useMemo } from 'react';
import { Search, UserMinus, Target, List, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
  customerName?: string;
  updatedAt: Date;
  createdAt?: Date;
  isDuplicate?: boolean;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  active: boolean;
  allowedStatuses: string[];
  state?: string;
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

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const getStatusLastStyle = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('approved') || s === 'approval') return 'bg-green-900 text-green-300 border-green-700';
  if (s === 'pending approval' || s.includes('pending approval')) return 'bg-purple-900 text-purple-300 border-purple-700';
  if (s.includes('counter')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('denial') || s.includes('declined')) return 'bg-red-900 text-red-300 border-red-700';
  if (s.includes('accepted')) return 'bg-blue-900 text-blue-300 border-blue-700';
  if (s.includes('funded') || s.includes('funding')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  if (s.includes('duplicate')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

const DEALERS_PER_PAGE = 10;

export default function AssignTab({ calls, setCalls, users, goals, setGoals }: AssignTabProps) {

  // ── ASSIGN STATE ─────────────────────────────────────────────────
  const [filterState, setFilterState] = useState('');
  const [selectedDealers, setSelectedDealers] = useState<Set<string>>(new Set());
  const [assignToId, setAssignToId] = useState('');
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerPage, setDealerPage] = useState(1);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // ── VIEW CALLS POPUP ─────────────────────────────────────────────
  const [viewCallsRep, setViewCallsRep] = useState<User | null>(null);
  const [viewSearchQuery, setViewSearchQuery] = useState('');
  const [viewTab, setViewTab] = useState<'calls' | 'dealers'>('calls');

  // ── UNASSIGN MODAL ───────────────────────────────────────────────
  const [unassignRep, setUnassignRep] = useState<User | null>(null);
  const [unassignMode, setUnassignMode] = useState<'dealer' | 'state' | 'individual'>('dealer');
  const [selectedUnassignDealer, setSelectedUnassignDealer] = useState('');
  const [selectedUnassignState, setSelectedUnassignState] = useState('');
  const [selectedUnassignCalls, setSelectedUnassignCalls] = useState<Set<string>>(new Set());
  const [unassignSearch, setUnassignSearch] = useState('');
  const [unassigning, setUnassigning] = useState(false);

  // ── SET GOAL MODAL ───────────────────────────────────────────────
  const [goalRep, setGoalRep] = useState<User | null>(null);
  const [goalValue, setGoalValue] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  // ── COMPUTED ─────────────────────────────────────────────────────
  const reps = users.filter(u => u.role === 'rep');
  const unassignedCalls = useMemo(() => calls.filter(c => !c.assignedTo), [calls]);

  const uniqueStates = useMemo(() =>
    Array.from(new Set(unassignedCalls.map(c => c.state))).sort(),
    [unassignedCalls]
  );

  const dealersInState = useMemo(() => {
    if (!filterState) return [];
    const dealerMap: { [name: string]: { callCount: number; cifNumber: string } } = {};
    unassignedCalls
      .filter(c => c.state === filterState)
      .forEach(c => {
        if (!dealerMap[c.dealerName]) dealerMap[c.dealerName] = { callCount: 0, cifNumber: c.dealerCifNumber };
        dealerMap[c.dealerName].callCount++;
      });
    return Object.entries(dealerMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.callCount - a.callCount);
  }, [unassignedCalls, filterState]);

  const filteredDealers = useMemo(() => {
    const q = dealerSearch.toLowerCase().trim();
    if (!q) return dealersInState;
    return dealersInState.filter(d => d.name.toLowerCase().includes(q));
  }, [dealersInState, dealerSearch]);

  const totalDealerPages = Math.max(1, Math.ceil(filteredDealers.length / DEALERS_PER_PAGE));
  const paginatedDealers = filteredDealers.slice((dealerPage - 1) * DEALERS_PER_PAGE, dealerPage * DEALERS_PER_PAGE);

  const totalCallsInSelection = useMemo(() => {
    if (selectedDealers.size === 0) return 0;
    return unassignedCalls.filter(c =>
      selectedDealers.has(c.dealerName) && c.state === filterState
    ).length;
  }, [selectedDealers, unassignedCalls, filterState]);

  const getRepCalls = (repId: string) => calls.filter(c => c.assignedTo === repId);

  // ── ASSIGN ───────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!assignToId || selectedDealers.size === 0) return;
    const rep = users.find(u => u.id === assignToId);
    if (!rep) return;
    const callsToAssign = unassignedCalls.filter(c =>
      selectedDealers.has(c.dealerName) && c.state === filterState
    );
    if (!callsToAssign.length) return;
    const callIds = callsToAssign.map(c => c.id);
    setCalls(prev => prev.map(c => callIds.includes(c.id)
      ? { ...c, assignedTo: assignToId, assignedToName: rep.name }
      : c
    ));
    const count = callIds.length;
    const dealerCount = selectedDealers.size;
    setSelectedDealers(new Set());
    setAssignToId('');
    setSuccess(`${count} call${count !== 1 ? 's' : ''} from ${dealerCount} dealer${dealerCount !== 1 ? 's' : ''} assigned to ${rep.name}`);
    setTimeout(() => setSuccess(''), 4000);
    await supabase.from('calls').update({
      assigned_to: assignToId,
      assigned_to_name: rep.name,
      updated_at: new Date().toISOString(),
    }).in('id', callIds);
  };

  const toggleDealer = (dealerName: string) => {
    setSelectedDealers(prev => {
      const n = new Set(prev);
      if (n.has(dealerName)) n.delete(dealerName); else n.add(dealerName);
      return n;
    });
  };

  const toggleSelectAllDealers = () => {
    if (dealersInState.every(d => selectedDealers.has(d.name))) {
      setSelectedDealers(new Set());
    } else {
      setSelectedDealers(new Set(dealersInState.map(d => d.name)));
    }
  };

  const handleStateChange = (state: string) => {
    setFilterState(state);
    setSelectedDealers(new Set());
    setDealerSearch('');
    setDealerPage(1);
  };

  // ── UNASSIGN ─────────────────────────────────────────────────────
  const openUnassign = (rep: User) => {
    setUnassignRep(rep);
    setUnassignMode('dealer');
    setSelectedUnassignDealer('');
    setSelectedUnassignState('');
    setSelectedUnassignCalls(new Set());
    setUnassignSearch('');
  };

  const getUnassignCallIds = (): string[] => {
    if (!unassignRep) return [];
    const repCalls = getRepCalls(unassignRep.id);
    if (unassignMode === 'dealer') {
      if (!selectedUnassignDealer) return [];
      return repCalls.filter(c => c.dealerName === selectedUnassignDealer).map(c => c.id);
    }
    if (unassignMode === 'state') {
      if (!selectedUnassignState) return [];
      return repCalls.filter(c => c.state === selectedUnassignState).map(c => c.id);
    }
    return Array.from(selectedUnassignCalls);
  };

  const handleUnassign = async () => {
    const callIds = getUnassignCallIds();
    if (!callIds.length) { setError('No calls selected to unassign.'); return; }
    setUnassigning(true);
    setCalls(prev => prev.map(c => callIds.includes(c.id)
      ? { ...c, assignedTo: undefined, assignedToName: undefined }
      : c
    ));
    await supabase.from('calls').update({
      assigned_to: null,
      assigned_to_name: null,
      updated_at: new Date().toISOString(),
    }).in('id', callIds);
    setUnassigning(false);
    setUnassignRep(null);
    setSuccess(`${callIds.length} call${callIds.length !== 1 ? 's' : ''} unassigned successfully`);
    setTimeout(() => setSuccess(''), 3000);
  };

  // ── SET GOAL ─────────────────────────────────────────────────────
  const openGoal = (rep: User) => {
    setGoalRep(rep);
    setGoalValue(String(goals.daily[rep.id] || ''));
  };

  const handleSaveGoal = async () => {
    if (!goalRep) return;
    const val = parseInt(goalValue) || 0;
    setSavingGoal(true);
    const newDaily = { ...goals.daily, [goalRep.id]: val };
    setGoals(prev => ({ ...prev, daily: newDaily }));
    await supabase.from('team_goals').update({
      rep_daily_goals: newDaily,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSavingGoal(false);
    setGoalRep(null);
    setSuccess(`Goal updated for ${goalRep.name}`);
    setTimeout(() => setSuccess(''), 3000);
  };

  // ── UNASSIGN MODAL DATA ───────────────────────────────────────────
  const unassignRepCalls = unassignRep ? getRepCalls(unassignRep.id) : [];
  const unassignDealers = Array.from(new Set(unassignRepCalls.map(c => c.dealerName))).sort();
  const unassignStates = Array.from(new Set(unassignRepCalls.map(c => c.state))).sort();
  const filteredUnassignIndividual = unassignRepCalls.filter(c => {
    const q = unassignSearch.toLowerCase();
    return !q || c.applicationId.toLowerCase().includes(q) || c.dealerName.toLowerCase().includes(q);
  });

  // ── VIEW CALLS DATA ───────────────────────────────────────────────
  const viewRepCalls = viewCallsRep ? getRepCalls(viewCallsRep.id) : [];

  const viewRepDealers = useMemo(() => {
    if (!viewCallsRep) return [];
    const dealerMap: { [name: string]: { callCount: number; state: string; topStatus: string } } = {};
    viewRepCalls.forEach(c => {
      if (!dealerMap[c.dealerName]) dealerMap[c.dealerName] = { callCount: 0, state: c.state, topStatus: c.statusLast || '' };
      dealerMap[c.dealerName].callCount++;
    });
    const maxCount = Math.max(...Object.values(dealerMap).map(d => d.callCount), 1);
    return Object.entries(dealerMap)
      .map(([name, data]) => ({ name, ...data, maxCount }))
      .sort((a, b) => b.callCount - a.callCount);
  }, [viewRepCalls, viewCallsRep]);

  const filteredViewCalls = viewRepCalls.filter(c => {
    const q = viewSearchQuery.toLowerCase();
    return !q || c.applicationId.toLowerCase().includes(q) ||
      c.dealerName.toLowerCase().includes(q) ||
      (c.customerName || '').toLowerCase().includes(q);
  });

  const filteredViewDealers = viewRepDealers.filter(d => {
    const q = viewSearchQuery.toLowerCase();
    return !q || d.name.toLowerCase().includes(q);
  });

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarColors = ['bg-blue-900 text-blue-300', 'bg-green-900 text-green-300', 'bg-purple-900 text-purple-300', 'bg-amber-900 text-amber-300', 'bg-cyan-900 text-cyan-300', 'bg-pink-900 text-pink-300'];
  const getAvatarColor = (idx: number) => avatarColors[idx % avatarColors.length];

  const allDealersSelected = dealersInState.length > 0 && dealersInState.every(d => selectedDealers.has(d.name));

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Assign</h2>
        <p className="text-sm text-gray-400 mt-0.5">Manage call assignments and rep workloads</p>
      </div>

      {success && <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-lg text-sm">{success}</div>}
      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* ── ASSIGNMENT SUMMARY ──────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Assignment summary</h3>
        {reps.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 text-center text-sm text-gray-500">No reps found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reps.map((rep, idx) => {
              const repCalls = getRepCalls(rep.id);
              const dailyGoal = goals.daily[rep.id] || 0;
              return (
                <div key={rep.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${getAvatarColor(idx)}`}>
                      {initials(rep.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-100 truncate">{rep.name}</p>
                      <p className="text-xs text-gray-400">
                        {repCalls.length} call{repCalls.length !== 1 ? 's' : ''} assigned
                        {dailyGoal > 0 && <span className="ml-2 text-gray-500">· Goal: {dailyGoal}/day</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setViewCallsRep(rep); setViewSearchQuery(''); setViewTab('calls'); }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-900 bg-opacity-40 hover:bg-opacity-60 border border-blue-700 text-blue-300 rounded-lg text-xs transition">
                      <List className="w-3 h-3 flex-shrink-0" />
                      <span>View calls</span>
                    </button>
                    <button
                      onClick={() => openUnassign(rep)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-900 bg-opacity-30 hover:bg-opacity-50 border border-red-800 text-red-300 rounded-lg text-xs transition">
                      <UserMinus className="w-3 h-3 flex-shrink-0" />
                      <span>Unassign</span>
                    </button>
                    <button
                      onClick={() => openGoal(rep)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-900 bg-opacity-30 hover:bg-opacity-50 border border-amber-800 text-amber-300 rounded-lg text-xs transition">
                      <Target className="w-3 h-3 flex-shrink-0" />
                      <span>Set goal</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ASSIGN CALLS ────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">
          Assign calls
          <span className="ml-2 text-gray-400 font-normal">({unassignedCalls.length} unassigned)</span>
        </h3>

        {/* Step 1: Pick a state */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Step 1 — Select a state</p>
          <div className="flex items-center gap-3 flex-wrap">
            {uniqueStates.map(state => {
              const count = unassignedCalls.filter(c => c.state === state).length;
              return (
                <button
                  key={state}
                  onClick={() => handleStateChange(filterState === state ? '' : state)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                    filterState === state
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-blue-600 hover:text-blue-300'
                  }`}>
                  <span>{state}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterState === state ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
            {uniqueStates.length === 0 && (
              <p className="text-sm text-gray-500 italic">No unassigned calls found.</p>
            )}
          </div>
        </div>

        {/* Step 2: Pick dealers + assign (only shown when state selected) */}
        {filterState && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">

            {/* Header with assign controls */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Step 2 — Select dealers in <span className="text-gray-200 font-medium">{filterState}</span></p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {dealersInState.length} dealer{dealersInState.length !== 1 ? 's' : ''} · {unassignedCalls.filter(c => c.state === filterState).length} total calls
                  {selectedDealers.size > 0 && (
                    <span className="ml-2 text-blue-400 font-medium">· {selectedDealers.size} dealer{selectedDealers.size !== 1 ? 's' : ''} selected ({totalCallsInSelection} calls)</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={assignToId}
                  onChange={e => setAssignToId(e.target.value)}
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Assign to rep…</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button
                  onClick={handleAssign}
                  disabled={!assignToId || selectedDealers.size === 0}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition whitespace-nowrap">
                  {selectedDealers.size > 0 && assignToId
                    ? `Assign ${totalCallsInSelection} call${totalCallsInSelection !== 1 ? 's' : ''} →`
                    : 'Assign'}
                </button>
              </div>
            </div>

            {/* Dealer search */}
            <div className="px-4 py-2.5 border-b border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search dealers…"
                  value={dealerSearch}
                  onChange={e => { setDealerSearch(e.target.value); setDealerPage(1); }}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Dealer table header */}
            <div className="grid grid-cols-[28px_1fr_60px_80px] gap-0 px-4 py-2 bg-gray-750 border-b border-gray-700 items-center">
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allDealersSelected}
                  onChange={toggleSelectAllDealers}
                  title="Select all dealers"
                  className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                />
              </div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">Dealer</div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 text-center">Calls</div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 text-right">
                {selectedDealers.size > 0 && (
                  <button
                    onClick={() => setSelectedDealers(new Set())}
                    className="text-blue-400 hover:text-blue-300 text-xs font-normal transition">
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Dealer rows */}
            <div className="divide-y divide-gray-700">
              {paginatedDealers.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No dealers match your search.</div>
              ) : paginatedDealers.map(dealer => {
                const isSelected = selectedDealers.has(dealer.name);
                return (
                  <div
                    key={dealer.name}
                    className={`grid grid-cols-[28px_1fr_60px_80px] gap-0 px-4 py-3 cursor-pointer transition-colors items-center ${isSelected ? 'bg-blue-900 bg-opacity-15' : 'hover:bg-gray-750'}`}
                    onClick={() => toggleDealer(dealer.name)}>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={e => { e.stopPropagation(); toggleDealer(dealer.name); }}
                        className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                      />
                    </div>
                    <div className="px-2">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-300' : 'text-gray-100'}`}>
                        {dealer.name}
                      </p>
                      <p className="text-xs text-gray-500">{filterState}</p>
                    </div>
                    <div className="px-2 text-center">
                      <span className={`text-sm font-bold ${isSelected ? 'text-blue-300' : 'text-gray-300'}`}>
                        {dealer.callCount}
                      </span>
                      <p className="text-[10px] text-gray-600">call{dealer.callCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="px-2 text-right">
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden ml-auto" style={{ width: '60px' }}>
                        <div
                          className={`h-full rounded-full transition-all ${isSelected ? 'bg-blue-500' : 'bg-gray-500'}`}
                          style={{ width: `${Math.round((dealer.callCount / Math.max(...dealersInState.map(d => d.callCount), 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalDealerPages > 1 && (
              <div className="px-4 py-2.5 border-t border-gray-700 flex items-center justify-between bg-gray-750">
                <p className="text-xs text-gray-500">
                  Showing {Math.min((dealerPage - 1) * DEALERS_PER_PAGE + 1, filteredDealers.length)}–{Math.min(dealerPage * DEALERS_PER_PAGE, filteredDealers.length)} of {filteredDealers.length} dealers
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDealerPage(p => Math.max(1, p - 1))}
                    disabled={dealerPage === 1}
                    className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
                    <ChevronLeft className="w-4 h-4 text-gray-400" />
                  </button>
                  {Array.from({ length: Math.min(5, totalDealerPages) }, (_, i) => {
                    let page: number;
                    if (totalDealerPages <= 5) page = i + 1;
                    else if (dealerPage <= 3) page = i + 1;
                    else if (dealerPage >= totalDealerPages - 2) page = totalDealerPages - 4 + i;
                    else page = dealerPage - 2 + i;
                    return (
                      <button
                        key={page}
                        onClick={() => setDealerPage(page)}
                        className={`w-7 h-7 rounded text-xs transition ${dealerPage === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}>
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setDealerPage(p => Math.min(totalDealerPages, p + 1))}
                    disabled={dealerPage >= totalDealerPages}
                    className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
                    <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── VIEW CALLS POPUP ────────────────────────────────────── */}
      {viewCallsRep && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-10 z-50 px-4"
          onClick={() => setViewCallsRep(null)}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-4xl overflow-hidden"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">{viewCallsRep.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {viewRepCalls.length} call{viewRepCalls.length !== 1 ? 's' : ''} · {viewRepDealers.length} dealer{viewRepDealers.length !== 1 ? 's' : ''} · press Escape to close
                </p>
              </div>
              <button onClick={() => setViewCallsRep(null)} className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
            </div>

            <div className="flex border-b border-gray-700">
              <button
                onClick={() => { setViewTab('calls'); setViewSearchQuery(''); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition border-b-2 ${viewTab === 'calls' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
                Calls ({viewRepCalls.length})
              </button>
              <button
                onClick={() => { setViewTab('dealers'); setViewSearchQuery(''); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition border-b-2 ${viewTab === 'dealers' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
                Dealers ({viewRepDealers.length})
              </button>
            </div>

            <div className="px-4 py-3 border-b border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder={viewTab === 'calls' ? 'Search App ID, dealer, customer…' : 'Search dealer name…'}
                  value={viewSearchQuery}
                  onChange={e => setViewSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>

            {viewTab === 'calls' && (
              <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '115px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '38px' }} />
                    <col style={{ width: '70px' }} />
                    <col style={{ width: '62px' }} />
                    <col style={{ width: '105px' }} />
                    <col style={{ width: '88px' }} />
                  </colgroup>
                  <thead className="bg-gray-750 sticky top-0">
                    <tr className="border-b border-gray-700">
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">App ID</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Dealer</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">St</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status Last</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">FU Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredViewCalls.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">No calls found</td></tr>
                    ) : filteredViewCalls.map(call => (
                      <tr key={call.id} className="hover:bg-gray-750 transition-colors">
                        <td className="px-2 py-2 text-xs text-blue-400 font-medium truncate">{call.applicationId}</td>
                        <td className="px-2 py-2 text-xs text-gray-200 truncate">{call.dealerName}</td>
                        <td className="px-2 py-2 text-xs text-gray-400 truncate">{call.customerName || '—'}</td>
                        <td className="px-2 py-2">
                          <span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600">{call.state}</span>
                        </td>
                        <td className="px-2 py-2 text-xs font-medium text-gray-100">
                          ${parseAmount(call.buyerFinal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{call.submittedDate}</td>
                        <td className="px-2 py-2">
                          <span className={`px-1.5 py-0 rounded-full text-[10px] border truncate ${getStatusLastStyle(call.statusLast)}`}>{call.statusLast}</span>
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-400">{call.fuStatus || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {viewTab === 'dealers' && (
              <div className="overflow-y-auto max-h-[55vh]">
                {filteredViewDealers.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">No dealers found</div>
                ) : (
                  <table className="w-full" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '200px' }} />
                      <col style={{ width: '50px' }} />
                      <col style={{ width: '180px' }} />
                      <col style={{ width: '115px' }} />
                    </colgroup>
                    <thead className="bg-gray-750 sticky top-0">
                      <tr className="border-b border-gray-700">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Dealer</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">St</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Calls</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status Last</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {filteredViewDealers.map(dealer => (
                        <tr key={dealer.name} className="hover:bg-gray-750 transition-colors">
                          <td className="px-3 py-2.5 text-sm font-medium text-gray-100 truncate">{dealer.name}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600">{dealer.state}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-300 w-5 flex-shrink-0">{dealer.callCount}</span>
                              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((dealer.callCount / dealer.maxCount) * 100)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-1.5 py-0 rounded-full text-[10px] border ${getStatusLastStyle(dealer.topStatus)}`}>{dealer.topStatus || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <div className="px-6 py-3 border-t border-gray-700">
              <p className="text-xs text-gray-500">Press Escape to close</p>
            </div>
          </div>
        </div>
      )}

      {/* ── UNASSIGN MODAL ──────────────────────────────────────── */}
      {unassignRep && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-10 z-50 px-4"
          onClick={() => setUnassignRep(null)}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Unassign from {unassignRep.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{unassignRepCalls.length} calls currently assigned</p>
              </div>
              <button onClick={() => setUnassignRep(null)} className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
            </div>

            <div className="flex border-b border-gray-700">
              {(['dealer', 'state', 'individual'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setUnassignMode(mode); setSelectedUnassignDealer(''); setSelectedUnassignState(''); setSelectedUnassignCalls(new Set()); setUnassignSearch(''); }}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition border-b-2 capitalize ${
                    unassignMode === mode
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}>
                  By {mode}
                </button>
              ))}
            </div>

            <div className="p-5">
              {unassignMode === 'dealer' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">Select a dealer to remove all their calls from {unassignRep.name}.</p>
                  <select
                    value={selectedUnassignDealer}
                    onChange={e => setSelectedUnassignDealer(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select a dealer…</option>
                    {unassignDealers.map(d => {
                      const cnt = unassignRepCalls.filter(c => c.dealerName === d).length;
                      return <option key={d} value={d}>{d} ({cnt} call{cnt !== 1 ? 's' : ''})</option>;
                    })}
                  </select>
                  {selectedUnassignDealer && (
                    <div className="bg-gray-750 border border-gray-600 rounded-lg px-4 py-3">
                      <p className="text-sm text-gray-300">
                        This will unassign <span className="font-medium text-white">{unassignRepCalls.filter(c => c.dealerName === selectedUnassignDealer).length} calls</span> from <span className="font-medium text-white">{selectedUnassignDealer}</span>.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {unassignMode === 'state' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">Select a state to remove all calls in that state from {unassignRep.name}.</p>
                  <select
                    value={selectedUnassignState}
                    onChange={e => setSelectedUnassignState(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select a state…</option>
                    {unassignStates.map(s => {
                      const cnt = unassignRepCalls.filter(c => c.state === s).length;
                      return <option key={s} value={s}>{s} ({cnt} call{cnt !== 1 ? 's' : ''})</option>;
                    })}
                  </select>
                  {selectedUnassignState && (
                    <div className="bg-gray-750 border border-gray-600 rounded-lg px-4 py-3">
                      <p className="text-sm text-gray-300">
                        This will unassign <span className="font-medium text-white">{unassignRepCalls.filter(c => c.state === selectedUnassignState).length} calls</span> in state <span className="font-medium text-white">{selectedUnassignState}</span>.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {unassignMode === 'individual' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">Select specific calls to unassign from {unassignRep.name}.</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search App ID or dealer…"
                      value={unassignSearch}
                      onChange={e => setUnassignSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="border border-gray-600 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    {filteredUnassignIndividual.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-gray-500">No calls found</p>
                    ) : filteredUnassignIndividual.map(call => (
                      <div
                        key={call.id}
                        className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-700 last:border-0 cursor-pointer hover:bg-gray-750 transition-colors ${selectedUnassignCalls.has(call.id) ? 'bg-red-900 bg-opacity-10' : ''}`}
                        onClick={() => {
                          setSelectedUnassignCalls(prev => {
                            const n = new Set(prev);
                            if (n.has(call.id)) n.delete(call.id); else n.add(call.id);
                            return n;
                          });
                        }}>
                        <input
                          type="checkbox"
                          checked={selectedUnassignCalls.has(call.id)}
                          readOnly
                          className="w-3.5 h-3.5 accent-red-500 flex-shrink-0 pointer-events-none"
                        />
                        <span className="text-xs text-blue-400 font-medium w-28 flex-shrink-0">{call.applicationId}</span>
                        <span className="text-xs text-gray-200 flex-1 truncate">{call.dealerName}</span>
                        <span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600 flex-shrink-0">{call.state}</span>
                      </div>
                    ))}
                  </div>
                  {selectedUnassignCalls.size > 0 && (
                    <p className="text-xs text-gray-400">{selectedUnassignCalls.size} call{selectedUnassignCalls.size !== 1 ? 's' : ''} selected</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setUnassignRep(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">
                Cancel
              </button>
              <button
                onClick={handleUnassign}
                disabled={unassigning || getUnassignCallIds().length === 0}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition">
                {unassigning ? 'Unassigning…' : `Unassign ${getUnassignCallIds().length > 0 ? `(${getUnassignCallIds().length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SET GOAL MODAL ───────────────────────────────────────── */}
      {goalRep && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 px-4"
          onClick={() => setGoalRep(null)}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h3 className="text-base font-semibold text-gray-100">Set daily goal</h3>
              <button onClick={() => setGoalRep(null)} className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-300">
                Daily deal goal for <span className="font-medium text-white">{goalRep.name}</span>
              </p>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Deals per day</label>
                <input
                  type="number"
                  min="0"
                  value={goalValue}
                  onChange={e => setGoalValue(e.target.value)}
                  placeholder="0"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); }}
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-lg text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center font-medium"
                />
              </div>
              {goals.daily[goalRep.id] > 0 && (
                <p className="text-xs text-gray-500 text-center">Current goal: {goals.daily[goalRep.id]}/day</p>
              )}
            </div>
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-700">
              <button onClick={() => setGoalRep(null)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">
                Cancel
              </button>
              <button
                onClick={handleSaveGoal}
                disabled={savingGoal}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition">
                {savingGoal ? 'Saving…' : 'Save goal'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}