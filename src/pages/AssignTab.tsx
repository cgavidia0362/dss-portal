import { useState, useMemo } from 'react';
import { Search, UserMinus, Target, List, ChevronLeft, ChevronRight as ChevronRightIcon, Check, Plus } from 'lucide-react';
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

const DEALERS_PER_PAGE = 25;
const CALLS_PER_PAGE = 25;
const STATUS_FILTER_OPTIONS = [
  { label: 'Approved',           onCls: 'bg-green-900 bg-opacity-40 border-green-600 text-green-300',   offCls: 'bg-gray-800 border-green-800 text-green-700' },
  { label: 'Counter',            onCls: 'bg-amber-900 bg-opacity-40 border-amber-600 text-amber-300',   offCls: 'bg-gray-800 border-amber-800 text-amber-700' },
  { label: 'New Application',    onCls: 'bg-cyan-900 bg-opacity-40 border-cyan-500 text-cyan-300',      offCls: 'bg-gray-800 border-cyan-800 text-cyan-700' },
  { label: 'Pending Approval',   onCls: 'bg-purple-900 bg-opacity-40 border-purple-600 text-purple-300', offCls: 'bg-gray-800 border-purple-800 text-purple-700' },
  { label: 'Reconsider',         onCls: 'bg-gray-700 border-gray-500 text-gray-300',                    offCls: 'bg-gray-800 border-gray-700 text-gray-600' },
  { label: 'Accepted',           onCls: 'bg-blue-900 bg-opacity-40 border-blue-600 text-blue-300',      offCls: 'bg-gray-800 border-blue-800 text-blue-700' },
  { label: 'Denial',             onCls: 'bg-red-900 bg-opacity-40 border-red-700 text-red-300',         offCls: 'bg-gray-800 border-red-900 text-red-700' },
  { label: 'Documents Received', onCls: 'bg-indigo-900 bg-opacity-40 border-indigo-600 text-indigo-300', offCls: 'bg-gray-800 border-indigo-800 text-indigo-700' },
  { label: 'Duplicate',          onCls: 'bg-orange-900 bg-opacity-40 border-orange-600 text-orange-300', offCls: 'bg-gray-800 border-orange-800 text-orange-700' },
  { label: 'Funding Pending',    onCls: 'bg-emerald-900 bg-opacity-40 border-emerald-600 text-emerald-300', offCls: 'bg-gray-800 border-emerald-800 text-emerald-700' },
];

const DEFAULT_STATUSES = new Set(['Approved', 'Counter', 'New Application', 'Pending Approval', 'Reconsider']);

const statusMatchesFilter = (statusLast: string, selected: Set<string>): boolean => {
  const s = (statusLast || '').toLowerCase();
  for (const status of Array.from(selected)) {
    switch (status) {
      case 'Approved':           if (s.includes('approv')) return true; break;
      case 'Counter':            if (s.includes('counter')) return true; break;
      case 'New Application':    if (s.includes('new application') || s.includes('new app')) return true; break;
      case 'Pending Approval':   if (s.includes('pending approval') || s === 'pending') return true; break;
      case 'Reconsider':         if (s.includes('reconsider')) return true; break;
      case 'Accepted':           if (s.includes('accept')) return true; break;
      case 'Denial':             if (s.includes('denial') || s.includes('declined')) return true; break;
      case 'Documents Received': if (s.includes('document')) return true; break;
      case 'Duplicate':          if (s.includes('duplicate')) return true; break;
      case 'Funding Pending':    if (s.includes('funding') || s.includes('funded')) return true; break;
    }
  }
  return false;
};

export default function AssignTab({ calls, setCalls, users, goals, setGoals }: AssignTabProps) {

  // ── ASSIGN STATE ─────────────────────────────────────────────────
  const [filterState, setFilterState] = useState('');
  const [step2View, setStep2View] = useState<'dealers' | 'calls'>('dealers');

  // Dealer view selection
  const [selectedDealers, setSelectedDealers] = useState<Set<string>>(new Set());
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerPage, setDealerPage] = useState(1);

  // Calls view selection
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [callsSearch, setCallsSearch] = useState('');
  const [callsPage, setCallsPage] = useState(1);

  const [assignToId, setAssignToId] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // ── STATUS FILTER POPUP ──────────────────────────────────────────
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(DEFAULT_STATUSES));
  const [pendingAssignCalls, setPendingAssignCalls] = useState<Call[]>([]);
  const [pendingAssignRepId, setPendingAssignRepId] = useState('');
  const [pendingAssignRepName, setPendingAssignRepName] = useState('');

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

  // Dealers in selected state (or all states)
  const dealersInView = useMemo(() => {
    const base = filterState
      ? unassignedCalls.filter(c => c.state === filterState)
      : unassignedCalls;
    const dealerMap: { [name: string]: { callCount: number; cifNumber: string } } = {};
    base.forEach(c => {
      if (!dealerMap[c.dealerName]) dealerMap[c.dealerName] = { callCount: 0, cifNumber: c.dealerCifNumber };
      dealerMap[c.dealerName].callCount++;
    });
    return Object.entries(dealerMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [unassignedCalls, filterState]);

  const filteredDealers = useMemo(() => {
    const q = dealerSearch.toLowerCase().trim();
    if (!q) return dealersInView;
    return dealersInView.filter(d => d.name.toLowerCase().includes(q));
  }, [dealersInView, dealerSearch]);

  const totalDealerPages = Math.max(1, Math.ceil(filteredDealers.length / DEALERS_PER_PAGE));
  const paginatedDealers = filteredDealers.slice((dealerPage - 1) * DEALERS_PER_PAGE, dealerPage * DEALERS_PER_PAGE);

  // Calls in selected state (or all states)
  const callsInView = useMemo(() => {
    const base = filterState
      ? unassignedCalls.filter(c => c.state === filterState)
      : unassignedCalls;
    const q = callsSearch.toLowerCase().trim();
    if (!q) return base;
    return base.filter(c =>
      c.applicationId.toLowerCase().includes(q) ||
      c.dealerName.toLowerCase().includes(q) ||
      (c.customerName || '').toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    );
  }, [unassignedCalls, filterState, callsSearch]);

  const totalCallsPages = Math.max(1, Math.ceil(callsInView.length / CALLS_PER_PAGE));
  const paginatedCallsView = callsInView.slice((callsPage - 1) * CALLS_PER_PAGE, callsPage * CALLS_PER_PAGE);

  const totalCallsInDealerSelection = useMemo(() => {
    if (selectedDealers.size === 0) return 0;
    return unassignedCalls.filter(c =>
      selectedDealers.has(c.dealerName) &&
      (filterState ? c.state === filterState : true)
    ).length;
  }, [selectedDealers, unassignedCalls, filterState]);

  const getRepCalls = (repId: string) => calls.filter(c => c.assignedTo === repId);

  const allDealersSelected = dealersInView.length > 0 && dealersInView.every(d => selectedDealers.has(d.name));
  const allCallsPageSelected = paginatedCallsView.length > 0 && paginatedCallsView.every(c => selectedCalls.has(c.id));

  // ── ASSIGN ───────────────────────────────────────────────────────
  const handleAssign = () => {
    if (!assignToId) return;
    const rep = users.find(u => u.id === assignToId);
    if (!rep) return;

    let callsToAssign: Call[] = [];

    if (step2View === 'dealers') {
      if (selectedDealers.size === 0) return;
      callsToAssign = unassignedCalls.filter(c =>
        selectedDealers.has(c.dealerName) &&
        (filterState ? c.state === filterState : true)
      );
    } else {
      if (selectedCalls.size === 0) return;
      callsToAssign = unassignedCalls.filter(c => selectedCalls.has(c.id));
    }

    if (!callsToAssign.length) return;

    setPendingAssignCalls(callsToAssign);
    setPendingAssignRepId(rep.id);
    setPendingAssignRepName(rep.name);
    setShowStatusFilter(true);
  };

  const handleConfirmAssign = async () => {
    const filteredCalls = pendingAssignCalls.filter(c => statusMatchesFilter(c.statusLast, selectedStatuses));
    const callIds = filteredCalls.map(c => c.id);

    if (!callIds.length) {
      const actualStatuses = Array.from(
        new Set(pendingAssignCalls.map(c => c.statusLast || 'Unknown'))
      ).join(', ');
      setError(`No calls match the selected statuses. The calls in your selection have these statuses: ${actualStatuses}. Please select the matching statuses above.`);
      return;
    }

    // Update local state optimistically
    setCalls(prev => prev.map(c => callIds.includes(c.id)
      ? { ...c, assignedTo: pendingAssignRepId, assignedToName: pendingAssignRepName }
      : c
    ));

    const count = callIds.length;
    setSelectedDealers(new Set());
    setSelectedCalls(new Set());
    setAssignToId('');
    setShowStatusFilter(false);
    setPendingAssignCalls([]);

    // Write to Supabase in batches of 200 to avoid URL length limits
    try {
      const BATCH_SIZE = 200;
      for (let i = 0; i < callIds.length; i += BATCH_SIZE) {
        const batch = callIds.slice(i, i + BATCH_SIZE);
        const { error: updateError } = await supabase.from('calls').update({
          assigned_to: pendingAssignRepId,
          assigned_to_name: pendingAssignRepName,
          updated_at: new Date().toISOString(),
        }).in('id', batch);

        if (updateError) {
          console.error('Supabase assign error:', updateError);
          setError(`Assignment failed: ${updateError.message}`);
          setTimeout(() => setError(''), 6000);
          return;
        }
      }

      setSuccess(`${count} call${count !== 1 ? 's' : ''} assigned to ${pendingAssignRepName}`);
      setTimeout(() => setSuccess(''), 4000);

    } catch (err: any) {
      console.error('Assignment exception:', err);
      setError(`Assignment failed: ${err.message}`);
      setTimeout(() => setError(''), 6000);
    }
  };

  const toggleDealer = (dealerName: string) => {
    setSelectedDealers(prev => {
      const n = new Set(prev);
      if (n.has(dealerName)) n.delete(dealerName); else n.add(dealerName);
      return n;
    });
  };

  const toggleSelectAllDealers = () => {
    if (allDealersSelected) {
      setSelectedDealers(new Set());
    } else {
      setSelectedDealers(new Set(dealersInView.map(d => d.name)));
    }
  };

  const toggleCall = (id: string) => {
    setSelectedCalls(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAllCallsPage = () => {
    if (allCallsPageSelected) {
      setSelectedCalls(prev => {
        const n = new Set(prev);
        paginatedCallsView.forEach(c => n.delete(c.id));
        return n;
      });
    } else {
      setSelectedCalls(prev => {
        const n = new Set(prev);
        paginatedCallsView.forEach(c => n.add(c.id));
        return n;
      });
    }
  };

  const handleStateChange = (state: string) => {
    setFilterState(state);
    setSelectedDealers(new Set());
    setSelectedCalls(new Set());
    setDealerSearch('');
    setCallsSearch('');
    setDealerPage(1);
    setCallsPage(1);
  };

  const handleStep2ViewChange = (view: 'dealers' | 'calls') => {
    setStep2View(view);
    setSelectedDealers(new Set());
    setSelectedCalls(new Set());
    setDealerSearch('');
    setCallsSearch('');
    setDealerPage(1);
    setCallsPage(1);
  };

  const assignButtonLabel = () => {
    if (step2View === 'dealers') {
      if (selectedDealers.size > 0 && assignToId)
        return `Assign ${totalCallsInDealerSelection} call${totalCallsInDealerSelection !== 1 ? 's' : ''} →`;
    } else {
      if (selectedCalls.size > 0 && assignToId)
        return `Assign ${selectedCalls.size} call${selectedCalls.size !== 1 ? 's' : ''} →`;
    }
    return 'Assign';
  };

  const assignDisabled = !assignToId ||
    (step2View === 'dealers' ? selectedDealers.size === 0 : selectedCalls.size === 0);

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

  const maxDealerCount = Math.max(...dealersInView.map(d => d.callCount), 1);

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

        {/* Step 1: State selector */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Step 1 — Select a state</p>
          <div className="flex items-center gap-2 flex-wrap">

            {/* All States button */}
            <button
              onClick={() => handleStateChange('')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                filterState === ''
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-blue-600 hover:text-blue-300'
              }`}>
              <span>All States</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterState === '' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-400'}`}>
                {unassignedCalls.length}
              </span>
            </button>

            {/* Individual state buttons */}
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
          </div>
        </div>

        {/* Step 2: Dealers or Calls */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Step 2 — {filterState ? `${filterState}` : 'All States'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {step2View === 'dealers'
                  ? `${dealersInView.length} dealer${dealersInView.length !== 1 ? 's' : ''} · ${filterState ? unassignedCalls.filter(c => c.state === filterState).length : unassignedCalls.length} total calls`
                  : `${callsInView.length} call${callsInView.length !== 1 ? 's' : ''}`
                }
                {step2View === 'dealers' && selectedDealers.size > 0 && (
                  <span className="ml-2 text-blue-400 font-medium">· {selectedDealers.size} dealer{selectedDealers.size !== 1 ? 's' : ''} selected ({totalCallsInDealerSelection} calls)</span>
                )}
                {step2View === 'calls' && selectedCalls.size > 0 && (
                  <span className="ml-2 text-blue-400 font-medium">· {selectedCalls.size} call{selectedCalls.size !== 1 ? 's' : ''} selected</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Dealers / Calls toggle */}
              <div className="flex bg-gray-700 rounded-lg p-0.5 border border-gray-600">
                <button
                  onClick={() => handleStep2ViewChange('dealers')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    step2View === 'dealers'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}>
                  Dealers
                </button>
                <button
                  onClick={() => handleStep2ViewChange('calls')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    step2View === 'calls'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}>
                  Calls
                </button>
              </div>

              {/* Rep dropdown + Assign button */}
              <select
                value={assignToId}
                onChange={e => setAssignToId(e.target.value)}
                className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Assign to rep…</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button
                onClick={handleAssign}
                disabled={assignDisabled}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition whitespace-nowrap">
                {assignButtonLabel()}
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-4 py-2.5 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                placeholder={step2View === 'dealers' ? 'Search dealers…' : 'Search App ID, dealer, customer…'}
                value={step2View === 'dealers' ? dealerSearch : callsSearch}
                onChange={e => {
                  if (step2View === 'dealers') { setDealerSearch(e.target.value); setDealerPage(1); }
                  else { setCallsSearch(e.target.value); setCallsPage(1); }
                }}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* ── DEALERS VIEW ── */}
          {step2View === 'dealers' && (
            <>
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
                <div className="px-2 text-right">
                  {selectedDealers.size > 0 && (
                    <button onClick={() => setSelectedDealers(new Set())}
                      className="text-blue-400 hover:text-blue-300 text-xs transition">Clear all</button>
                  )}
                </div>
              </div>

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
                        {!filterState && <p className="text-xs text-gray-500">All States</p>}
                        {filterState && <p className="text-xs text-gray-500">{filterState}</p>}
                      </div>
                      <div className="px-2 text-center">
                        <span className={`text-sm font-bold ${isSelected ? 'text-blue-300' : 'text-gray-300'}`}>{dealer.callCount}</span>
                        <p className="text-[10px] text-gray-600">call{dealer.callCount !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="px-2">
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isSelected ? 'bg-blue-500' : 'bg-gray-500'}`}
                            style={{ width: `${Math.round((dealer.callCount / maxDealerCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalDealerPages > 1 && (
                <div className="px-4 py-2.5 border-t border-gray-700 flex items-center justify-between bg-gray-750">
                  <p className="text-xs text-gray-500">
                    Showing {Math.min((dealerPage - 1) * DEALERS_PER_PAGE + 1, filteredDealers.length)}–{Math.min(dealerPage * DEALERS_PER_PAGE, filteredDealers.length)} of {filteredDealers.length} dealers
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDealerPage(p => Math.max(1, p - 1))} disabled={dealerPage === 1}
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
                        <button key={page} onClick={() => setDealerPage(page)}
                          className={`w-7 h-7 rounded text-xs transition ${dealerPage === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}>
                          {page}
                        </button>
                      );
                    })}
                    <button onClick={() => setDealerPage(p => Math.min(totalDealerPages, p + 1))} disabled={dealerPage >= totalDealerPages}
                      className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
                      <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── CALLS VIEW ── */}
          {step2View === 'calls' && (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[28px_110px_1fr_110px_38px_75px_105px] gap-0 px-3 py-2 bg-gray-750 border-b border-gray-700 items-center">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allCallsPageSelected}
                    onChange={toggleSelectAllCallsPage}
                    className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                  />
                </div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">App ID</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">Dealer</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">Customer</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">St</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">Amount</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">Status Last</div>
              </div>

              <div className="divide-y divide-gray-700">
                {paginatedCallsView.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">No calls found.</div>
                ) : paginatedCallsView.map(call => {
                  const isSelected = selectedCalls.has(call.id);
                  return (
                    <div
                      key={call.id}
                      className={`grid grid-cols-[28px_110px_1fr_110px_38px_75px_105px] gap-0 px-3 py-2 cursor-pointer transition-colors items-center ${isSelected ? 'bg-blue-900 bg-opacity-10' : 'hover:bg-gray-750'}`}
                      onClick={() => toggleCall(call.id)}>
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={e => { e.stopPropagation(); toggleCall(call.id); }}
                          className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                        />
                      </div>
                      <div className="px-2 text-xs text-blue-400 font-medium truncate">{call.applicationId}</div>
                      <div className="px-2 text-xs text-gray-200 truncate">{call.dealerName}</div>
                      <div className="px-2 text-xs text-gray-400 truncate">{call.customerName || '—'}</div>
                      <div className="px-2">
                        <span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600">{call.state}</span>
                      </div>
                      <div className="px-2 text-xs font-medium text-gray-100">
                        ${parseAmount(call.buyerFinal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                      <div className="px-2">
                        <span className={`px-1.5 py-0 rounded-full text-[10px] border ${getStatusLastStyle(call.statusLast)}`}>
                          {call.statusLast}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Calls pagination */}
              <div className="px-4 py-2.5 border-t border-gray-700 flex items-center justify-between bg-gray-750">
                <p className="text-xs text-gray-500">
                  Showing {callsInView.length === 0 ? 0 : Math.min((callsPage - 1) * CALLS_PER_PAGE + 1, callsInView.length)}–{Math.min(callsPage * CALLS_PER_PAGE, callsInView.length)} of {callsInView.length} calls
                  {selectedCalls.size > 0 && <span className="ml-2 text-blue-400">{selectedCalls.size} selected</span>}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCallsPage(p => Math.max(1, p - 1))} disabled={callsPage === 1}
                    className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
                    <ChevronLeft className="w-4 h-4 text-gray-400" />
                  </button>
                  {Array.from({ length: Math.min(5, totalCallsPages) }, (_, i) => {
                    let page: number;
                    if (totalCallsPages <= 5) page = i + 1;
                    else if (callsPage <= 3) page = i + 1;
                    else if (callsPage >= totalCallsPages - 2) page = totalCallsPages - 4 + i;
                    else page = callsPage - 2 + i;
                    return (
                      <button key={page} onClick={() => setCallsPage(page)}
                        className={`w-7 h-7 rounded text-xs transition ${callsPage === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}>
                        {page}
                      </button>
                    );
                  })}
                  {totalCallsPages > 5 && callsPage < totalCallsPages - 2 && (
                    <>
                      <span className="text-xs text-gray-600 px-1">…</span>
                      <button onClick={() => setCallsPage(totalCallsPages)}
                        className="w-7 h-7 rounded text-xs hover:bg-gray-700 text-gray-400 transition">
                        {totalCallsPages}
                      </button>
                    </>
                  )}
                  <button onClick={() => setCallsPage(p => Math.min(totalCallsPages, p + 1))} disabled={callsPage >= totalCallsPages}
                    className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 transition">
                    <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

{/* ── STATUS FILTER POPUP ─────────────────────────────────── */}
{showStatusFilter && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 px-4"
          onClick={() => setShowStatusFilter(false)}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h3 className="text-base font-semibold text-gray-100">Filter by status before assigning</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {pendingAssignRepName}
                  {step2View === 'dealers'
                    ? ` · ${selectedDealers.size} dealer${selectedDealers.size !== 1 ? 's' : ''} selected`
                    : ` · ${pendingAssignCalls.length} call${pendingAssignCalls.length !== 1 ? 's' : ''} selected`}
                  {filterState ? ` · ${filterState}` : ' · All States'}
                </p>
              </div>
              <button onClick={() => setShowStatusFilter(false)} className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Inline error */}
              {error && (
                <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg px-4 py-3">
                  <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                </div>
              )}
              {/* Status chips */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Select which statuses to include</p>
                  <button
                    onClick={() => {
                      if (selectedStatuses.size === STATUS_FILTER_OPTIONS.length) {
                        setSelectedStatuses(new Set(DEFAULT_STATUSES));
                      } else {
                        setSelectedStatuses(new Set(STATUS_FILTER_OPTIONS.map(s => s.label)));
                      }
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition">
                    {selectedStatuses.size === STATUS_FILTER_OPTIONS.length ? 'Reset to defaults' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTER_OPTIONS.map(({ label, onCls, offCls }) => {
                    const isOn = selectedStatuses.has(label);
                    return (
                      <button
                        key={label}
                        onClick={() => {
                          setSelectedStatuses(prev => {
                            const n = new Set(prev);
                            if (n.has(label)) n.delete(label); else n.add(label);
                            return n;
                          });
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition ${isOn ? onCls : offCls}`}>
                        {isOn
                          ? <Check className="w-3 h-3 flex-shrink-0" />
                          : <Plus className="w-3 h-3 flex-shrink-0" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Summary */}
              {(() => {
                const matching = pendingAssignCalls.filter(c => statusMatchesFilter(c.statusLast, selectedStatuses)).length;
                const skipped = pendingAssignCalls.length - matching;
                return (
                  <div className="bg-gray-750 border border-gray-700 rounded-lg px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Total calls in selection</span>
                      <span className="text-sm font-medium text-gray-200">{pendingAssignCalls.length}</span>
                    </div>
                    <div className="h-px bg-gray-700" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Calls matching selected statuses</span>
                      <span className="text-sm font-bold text-green-400">{matching}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Calls skipped (stay unassigned)</span>
                      <span className="text-sm text-gray-500">{skipped}</span>
                    </div>
                  </div>
                );
              })()}

              <p className="text-xs text-gray-600">Skipped calls stay in the unassigned pool and can be assigned later.</p>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-700">
            <button onClick={() => { setShowStatusFilter(false); setError(''); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">
                Cancel
              </button>
              <button
                onClick={handleConfirmAssign}
                disabled={selectedStatuses.size === 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition">
                {(() => {
                  const matching = pendingAssignCalls.filter(c => statusMatchesFilter(c.statusLast, selectedStatuses)).length;
                  return `Assign ${matching} call${matching !== 1 ? 's' : ''} to ${pendingAssignRepName} →`;
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button onClick={() => { setViewTab('calls'); setViewSearchQuery(''); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition border-b-2 ${viewTab === 'calls' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
                Calls ({viewRepCalls.length})
              </button>
              <button onClick={() => { setViewTab('dealers'); setViewSearchQuery(''); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition border-b-2 ${viewTab === 'dealers' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
                Dealers ({viewRepDealers.length})
              </button>
            </div>
            <div className="px-4 py-3 border-b border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input type="text"
                  placeholder={viewTab === 'calls' ? 'Search App ID, dealer, customer…' : 'Search dealer name…'}
                  value={viewSearchQuery} onChange={e => setViewSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus />
              </div>
            </div>
            {viewTab === 'calls' && (
              <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '115px' }} /><col style={{ width: '120px' }} />
                    <col style={{ width: '120px' }} /><col style={{ width: '38px' }} />
                    <col style={{ width: '70px' }} /><col style={{ width: '62px' }} />
                    <col style={{ width: '105px' }} /><col style={{ width: '88px' }} />
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
                        <td className="px-2 py-2"><span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600">{call.state}</span></td>
                        <td className="px-2 py-2 text-xs font-medium text-gray-100">${parseAmount(call.buyerFinal).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                        <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{call.submittedDate}</td>
                        <td className="px-2 py-2"><span className={`px-1.5 py-0 rounded-full text-[10px] border truncate ${getStatusLastStyle(call.statusLast)}`}>{call.statusLast}</span></td>
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
                      <col style={{ width: '200px' }} /><col style={{ width: '50px' }} />
                      <col style={{ width: '180px' }} /><col style={{ width: '115px' }} />
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
                          <td className="px-3 py-2.5"><span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600">{dealer.state}</span></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-300 w-5 flex-shrink-0">{dealer.callCount}</span>
                              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((dealer.callCount / dealer.maxCount) * 100)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5"><span className={`px-1.5 py-0 rounded-full text-[10px] border ${getStatusLastStyle(dealer.topStatus)}`}>{dealer.topStatus || '—'}</span></td>
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
                <button key={mode}
                  onClick={() => { setUnassignMode(mode); setSelectedUnassignDealer(''); setSelectedUnassignState(''); setSelectedUnassignCalls(new Set()); setUnassignSearch(''); }}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition border-b-2 capitalize ${unassignMode === mode ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
                  By {mode}
                </button>
              ))}
            </div>
            <div className="p-5">
              {unassignMode === 'dealer' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">Select a dealer to remove all their calls from {unassignRep.name}.</p>
                  <select value={selectedUnassignDealer} onChange={e => setSelectedUnassignDealer(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select a dealer…</option>
                    {unassignDealers.map(d => { const cnt = unassignRepCalls.filter(c => c.dealerName === d).length; return <option key={d} value={d}>{d} ({cnt} call{cnt !== 1 ? 's' : ''})</option>; })}
                  </select>
                  {selectedUnassignDealer && (
                    <div className="bg-gray-750 border border-gray-600 rounded-lg px-4 py-3">
                      <p className="text-sm text-gray-300">This will unassign <span className="font-medium text-white">{unassignRepCalls.filter(c => c.dealerName === selectedUnassignDealer).length} calls</span> from <span className="font-medium text-white">{selectedUnassignDealer}</span>.</p>
                    </div>
                  )}
                </div>
              )}
              {unassignMode === 'state' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">Select a state to remove all calls in that state from {unassignRep.name}.</p>
                  <select value={selectedUnassignState} onChange={e => setSelectedUnassignState(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select a state…</option>
                    {unassignStates.map(s => { const cnt = unassignRepCalls.filter(c => c.state === s).length; return <option key={s} value={s}>{s} ({cnt} call{cnt !== 1 ? 's' : ''})</option>; })}
                  </select>
                  {selectedUnassignState && (
                    <div className="bg-gray-750 border border-gray-600 rounded-lg px-4 py-3">
                      <p className="text-sm text-gray-300">This will unassign <span className="font-medium text-white">{unassignRepCalls.filter(c => c.state === selectedUnassignState).length} calls</span> in state <span className="font-medium text-white">{selectedUnassignState}</span>.</p>
                    </div>
                  )}
                </div>
              )}
              {unassignMode === 'individual' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">Select specific calls to unassign from {unassignRep.name}.</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input type="text" placeholder="Search App ID or dealer…" value={unassignSearch} onChange={e => setUnassignSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
                  </div>
                  <div className="border border-gray-600 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    {filteredUnassignIndividual.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-gray-500">No calls found</p>
                    ) : filteredUnassignIndividual.map(call => (
                      <div key={call.id}
                        className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-700 last:border-0 cursor-pointer hover:bg-gray-750 transition-colors ${selectedUnassignCalls.has(call.id) ? 'bg-red-900 bg-opacity-10' : ''}`}
                        onClick={() => { setSelectedUnassignCalls(prev => { const n = new Set(prev); if (n.has(call.id)) n.delete(call.id); else n.add(call.id); return n; }); }}>
                        <input type="checkbox" checked={selectedUnassignCalls.has(call.id)} readOnly className="w-3.5 h-3.5 accent-red-500 flex-shrink-0 pointer-events-none" />
                        <span className="text-xs text-blue-400 font-medium w-28 flex-shrink-0">{call.applicationId}</span>
                        <span className="text-xs text-gray-200 flex-1 truncate">{call.dealerName}</span>
                        <span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600 flex-shrink-0">{call.state}</span>
                      </div>
                    ))}
                  </div>
                  {selectedUnassignCalls.size > 0 && <p className="text-xs text-gray-400">{selectedUnassignCalls.size} call{selectedUnassignCalls.size !== 1 ? 's' : ''} selected</p>}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setUnassignRep(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">Cancel</button>
              <button onClick={handleUnassign} disabled={unassigning || getUnassignCallIds().length === 0}
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
              <p className="text-sm text-gray-300">Daily deal goal for <span className="font-medium text-white">{goalRep.name}</span></p>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Deals per day</label>
                <input type="number" min="0" value={goalValue} onChange={e => setGoalValue(e.target.value)}
                  placeholder="0" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); }}
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-lg text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center font-medium" />
              </div>
              {goals.daily[goalRep.id] > 0 && <p className="text-xs text-gray-500 text-center">Current goal: {goals.daily[goalRep.id]}/day</p>}
            </div>
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-700">
              <button onClick={() => setGoalRep(null)} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">Cancel</button>
              <button onClick={handleSaveGoal} disabled={savingGoal}
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