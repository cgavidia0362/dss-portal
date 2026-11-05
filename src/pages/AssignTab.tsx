import { useState, useMemo, useEffect } from 'react';
import { Search, UserMinus, Target, List, ChevronLeft, ChevronRight as ChevronRightIcon, Check, Plus, BellOff, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { statusMatchesFilter } from '../lib/statusLastFilter';
import { distributeDealersToReps, uniqueDealerCount } from '../lib/distributeDealers';
import { findDealerAlert, mapDealerAlertRow, type DealerAlert } from '../lib/dealerAlerts';

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
  dealBy?: string;
  dealByName?: string;
  fuStatus?: 'Deal' | 'Confirmed Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates' | 'Follow Up';
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
  allowedTabs: string[];
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
  currentUserId?: string;
  currentUserName?: string;
  calls: Call[];
  setCalls: React.Dispatch<React.SetStateAction<Call[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  goals: Goals;
  setGoals: React.Dispatch<React.SetStateAction<Goals>>;
  dealerAlerts?: DealerAlert[];
  setDealerAlerts?: React.Dispatch<React.SetStateAction<DealerAlert[]>>;
}

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const getStatusLastStyle = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('approved') || s === 'approval') return 'bg-emerald-50 text-emerald-900 border-emerald-300';
  if (s === 'pending approval' || s.includes('pending approval')) return 'bg-violet-50 text-violet-900 border-violet-300';
  if (s.includes('counter')) return 'bg-amber-50 text-amber-900 border-amber-300';
  if (s.includes('denial') || s.includes('declined')) return 'bg-rose-50 text-rose-900 border-rose-300';
  if (s.includes('accepted')) return 'bg-sky-50 text-sky-900 border-sky-300';
  if (s.includes('funded') || s.includes('funding')) return 'bg-emerald-50 text-emerald-900 border-emerald-300';
  if (s.includes('duplicate')) return 'bg-orange-50 text-orange-900 border-orange-300';
  if (s.includes('new application')) return 'bg-cyan-50 text-cyan-900 border-cyan-300';
  if (s.includes('reconsider')) return 'bg-slate-100 text-slate-800 border-slate-300';
  if (s.includes('follow up')) return 'bg-amber-50 text-amber-900 border-amber-300';
  return 'bg-dss-canvas text-dss-ink border-dss-border';
};

const DEALERS_PER_PAGE = 25;
const CALLS_PER_PAGE = 25;
const STATUS_FILTER_OPTIONS = [
  { label: 'Approved',           onCls: 'bg-emerald-50 bg-opacity-40 border-green-600 text-dss-success',    offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Counter',            onCls: 'bg-amber-50 border-amber-200 text-amber-800',    offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'New Application',    onCls: 'bg-cyan-50 border-cyan-200 text-cyan-800',       offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Pending Approval',   onCls: 'bg-dss-accent-soft bg-opacity-40 border-purple-600 text-dss-accent', offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Reconsider',         onCls: 'bg-dss-canvas border-dss-border text-dss-ink/80',                     offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Accepted',           onCls: 'bg-dss-accent-soft bg-opacity-40 border-dss-navy-soft text-dss-accent',       offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Denial',             onCls: 'bg-rose-50 bg-opacity-40 border-rose-200 text-dss-danger',          offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Documents Received', onCls: 'bg-indigo-50 border-indigo-200 text-indigo-800', offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Duplicate',          onCls: 'bg-orange-50 border-orange-200 text-orange-800', offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Funding Pending',    onCls: 'bg-emerald-50 border-emerald-200 text-emerald-800', offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
  { label: 'Follow Up',          onCls: 'bg-amber-50 border-amber-200 text-amber-800',    offCls: 'bg-dss-surface border-dss-border text-dss-muted' },
];

const DEFAULT_STATUSES = new Set(['Approved', 'Counter', 'New Application', 'Pending Approval', 'Reconsider', 'Follow Up']);

export default function AssignTab({
  currentUserRole, currentUserId, currentUserName, calls, setCalls, users, setUsers, goals, setGoals,
  dealerAlerts = [], setDealerAlerts,
}: AssignTabProps) {

  // ── ASSIGN STATE ─────────────────────────────────────────────────
  const [filterState, setFilterState] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
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
  const [assignMode, setAssignMode] = useState<'one' | 'distribute'>('one');
  const [selectedDistributeRepIds, setSelectedDistributeRepIds] = useState<string[]>([]);
  const [assignFunnelStep, setAssignFunnelStep] = useState<'reps' | 'status'>('status');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // ── STATUS FILTER POPUP ──────────────────────────────────────────
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(DEFAULT_STATUSES));
  const [pendingAssignCalls, setPendingAssignCalls] = useState<Call[]>([]);
  const [pendingAssignMode, setPendingAssignMode] = useState<'one' | 'distribute'>('one');
  const [pendingAssignReps, setPendingAssignReps] = useState<{ id: string; name: string }[]>([]);

  // ── VIEW CALLS POPUP ─────────────────────────────────────────────
  const [viewCallsRep, setViewCallsRep] = useState<User | null>(null);
  const [viewSearchQuery, setViewSearchQuery] = useState('');
  const [viewTab, setViewTab] = useState<'calls' | 'dealers'>('calls');

  // ── UNASSIGN MODAL ───────────────────────────────────────────────
  const [unassignRep, setUnassignRep] = useState<User | null>(null);
  const [unassignMode, setUnassignMode] = useState<'dealer' | 'state' | 'individual'>('dealer');
  const [selectedUnassignDealers, setSelectedUnassignDealers] = useState<Set<string>>(new Set());
  const [selectedUnassignStates, setSelectedUnassignStates] = useState<Set<string>>(new Set());
  const [selectedUnassignCalls, setSelectedUnassignCalls] = useState<Set<string>>(new Set());
  const [unassignSearch, setUnassignSearch] = useState('');
  const [unassigning, setUnassigning] = useState(false);

  // ── SET GOAL MODAL ───────────────────────────────────────────────
  const [goalRep, setGoalRep] = useState<User | null>(null);
  const [goalValue, setGoalValue] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  const [dncQuery, setDncQuery] = useState('');
  const [dncReason, setDncReason] = useState('');
  const [dncSaving, setDncSaving] = useState(false);
  const canManageDnc = currentUserRole === 'admin' || currentUserRole === 'manager';

  // ── COMPUTED ─────────────────────────────────────────────────────
  const reps = users.filter(u => u.role === 'rep');
  const unassignedCalls = useMemo(() => calls.filter(c => !c.assignedTo), [calls]);

  const uniqueStates = useMemo(() =>
    Array.from(new Set(unassignedCalls.map(c => c.state))).sort(),
    [unassignedCalls]
  );

  const stateScopedUnassigned = useMemo(() =>
    filterState ? unassignedCalls.filter(c => c.state === filterState) : unassignedCalls,
    [unassignedCalls, filterState]
  );

  const statusFilteredUnassigned = useMemo(() => {
    if (filterStatuses.size === 0) return stateScopedUnassigned;
    return stateScopedUnassigned.filter(c => statusMatchesFilter(c.statusLast, filterStatuses));
  }, [stateScopedUnassigned, filterStatuses]);

  const statusCountsByLabel = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUS_FILTER_OPTIONS.forEach(({ label }) => { counts[label] = 0; });
    stateScopedUnassigned.forEach(call => {
      STATUS_FILTER_OPTIONS.forEach(({ label }) => {
        if (statusMatchesFilter(call.statusLast, new Set([label]))) {
          counts[label]++;
        }
      });
    });
    return counts;
  }, [stateScopedUnassigned]);

  // Dealers in selected state (or all states), scoped by status chips
  const dealersInView = useMemo(() => {
    const dealerMap: { [name: string]: { callCount: number; cifNumber: string } } = {};
    statusFilteredUnassigned.forEach(c => {
      if (!dealerMap[c.dealerName]) dealerMap[c.dealerName] = { callCount: 0, cifNumber: c.dealerCifNumber };
      dealerMap[c.dealerName].callCount++;
    });
    return Object.entries(dealerMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [statusFilteredUnassigned]);

  const filteredDealers = useMemo(() => {
    const q = dealerSearch.toLowerCase().trim();
    if (!q) return dealersInView;
    return dealersInView.filter(d => d.name.toLowerCase().includes(q));
  }, [dealersInView, dealerSearch]);

  const totalDealerPages = Math.max(1, Math.ceil(filteredDealers.length / DEALERS_PER_PAGE));
  const paginatedDealers = filteredDealers.slice((dealerPage - 1) * DEALERS_PER_PAGE, dealerPage * DEALERS_PER_PAGE);

  const callsInView = useMemo(() => {
    const q = callsSearch.toLowerCase().trim();
    if (!q) return statusFilteredUnassigned;
    return statusFilteredUnassigned.filter(c =>
      c.applicationId.toLowerCase().includes(q) ||
      c.dealerName.toLowerCase().includes(q) ||
      (c.customerName || '').toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    );
  }, [statusFilteredUnassigned, callsSearch]);

  const totalCallsPages = Math.max(1, Math.ceil(callsInView.length / CALLS_PER_PAGE));
  const paginatedCallsView = callsInView.slice((callsPage - 1) * CALLS_PER_PAGE, callsPage * CALLS_PER_PAGE);

  const totalCallsInDealerSelection = useMemo(() => {
    if (selectedDealers.size === 0) return 0;
    return statusFilteredUnassigned.filter(c => selectedDealers.has(c.dealerName)).length;
  }, [selectedDealers, statusFilteredUnassigned]);

  const selectedPoolCalls = useMemo(() => {
    if (step2View === 'dealers') {
      if (selectedDealers.size === 0) return [];
      return statusFilteredUnassigned.filter(c => selectedDealers.has(c.dealerName));
    }
    if (selectedCalls.size === 0) return [];
    return statusFilteredUnassigned.filter(c => selectedCalls.has(c.id));
  }, [step2View, selectedDealers, selectedCalls, statusFilteredUnassigned]);

  const selectedDealerUnitCount = useMemo(
    () => uniqueDealerCount(selectedPoolCalls),
    [selectedPoolCalls],
  );

  const selectedDistributeReps = useMemo(
    () => selectedDistributeRepIds
      .map(id => reps.find(r => r.id === id))
      .filter((r): r is User => Boolean(r)),
    [selectedDistributeRepIds, reps],
  );

  const pendingMatchingCalls = useMemo(
    () => pendingAssignCalls.filter(c => statusMatchesFilter(c.statusLast, selectedStatuses)),
    [pendingAssignCalls, selectedStatuses],
  );

  const pendingDistribution = useMemo(
    () => distributeDealersToReps(pendingMatchingCalls, pendingAssignReps),
    [pendingMatchingCalls, pendingAssignReps],
  );

  const getRepCalls = (repId: string) => calls.filter(c => c.assignedTo === repId);

  const allDealersSelected = dealersInView.length > 0 && dealersInView.every(d => selectedDealers.has(d.name));
  const allCallsPageSelected = paginatedCallsView.length > 0 && paginatedCallsView.every(c => selectedCalls.has(c.id));

  // ── ASSIGN ───────────────────────────────────────────────────────
  const closeAssignModal = () => {
    setShowStatusFilter(false);
    setAssignFunnelStep('status');
    setError('');
  };

  const openAssignModal = (mode: 'one' | 'distribute', selectedReps: { id: string; name: string }[], step: 'reps' | 'status') => {
    if (!selectedPoolCalls.length) return;
    setSelectedStatuses(
      filterStatuses.size > 0 ? new Set(filterStatuses) : new Set(DEFAULT_STATUSES)
    );
    setPendingAssignCalls(selectedPoolCalls);
    setPendingAssignMode(mode);
    setPendingAssignReps(selectedReps);
    setAssignFunnelStep(step);
    setError('');
    setShowStatusFilter(true);
  };

  const handleAssign = () => {
    if (!hasSelection) return;
    if (assignMode === 'one') {
      if (!assignToId) return;
      const rep = users.find(u => u.id === assignToId);
      if (!rep) return;
      openAssignModal('one', [{ id: rep.id, name: rep.name }], 'status');
      return;
    }
    setSelectedDistributeRepIds([]);
    openAssignModal('distribute', [], 'reps');
  };

  const handleContinueDistributeFunnel = () => {
    if (selectedDistributeReps.length < 2) {
      setError('Select at least 2 reps to distribute.');
      return;
    }
    setPendingAssignReps(selectedDistributeReps.map(r => ({ id: r.id, name: r.name })));
    setError('');
    setAssignFunnelStep('status');
  };

  const toggleDistributeRep = (repId: string) => {
    setSelectedDistributeRepIds(prev =>
      prev.includes(repId) ? prev.filter(id => id !== repId) : [...prev, repId]
    );
  };

  const isValidUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const handleConfirmAssign = async () => {
    const filteredCalls = pendingAssignCalls.filter(c => statusMatchesFilter(c.statusLast, selectedStatuses));
    const validCalls = filteredCalls.filter(c => isValidUUID(c.id));
    const skippedInvalid = filteredCalls.length - validCalls.length;
    const pendingReps = pendingAssignReps.filter(r => isValidUUID(r.id));

    if (!pendingReps.length) {
      setError('No valid reps selected.');
      return;
    }

    const distribution = distributeDealersToReps(validCalls, pendingReps);
    const callIds = validCalls.map(c => c.id);

    const mismatchedIds = calls
      .filter(c =>
        pendingReps.some(rep => c.assignedTo === rep.id) &&
        !statusMatchesFilter(c.statusLast, selectedStatuses)
      )
      .map(c => c.id)
      .filter(isValidUUID);

    if (!callIds.length && !mismatchedIds.length) {
      const actualStatuses = Array.from(
        new Set(pendingAssignCalls.map(c => c.statusLast || 'Unknown'))
      ).join(', ');
      setError(`No calls match the selected statuses. The calls in your selection have these statuses: ${actualStatuses}. Please select the matching statuses above.`);
      return;
    }

    const needCreditIds = validCalls
      .filter(c => (c.fuStatus === 'Deal' || c.fuStatus === 'Confirmed Deal') && !c.dealBy)
      .map(c => c.id);

    setCalls(prev => prev.map(c => {
      if (mismatchedIds.includes(c.id)) {
        return { ...c, assignedTo: undefined, assignedToName: undefined };
      }
      const assignee = distribution.assignmentByCallId[c.id];
      if (!assignee) return c;
      const needsDealCredit = needCreditIds.includes(c.id);
      return {
        ...c,
        assignedTo: assignee.repId,
        assignedToName: assignee.repName,
        ...(needsDealCredit ? { dealBy: assignee.repId, dealByName: assignee.repName } : {}),
      };
    }));

    const count = callIds.length;
    const allowedStatusList = Array.from(selectedStatuses);
    const assignModeUsed = pendingAssignMode;
    const dealerCount = distribution.dealerCount;
    const assignRepName = pendingReps[0]?.name || '';
    const repCount = pendingReps.length;
    setSelectedDealers(new Set());
    setSelectedCalls(new Set());
    setAssignToId('');
    setSelectedDistributeRepIds([]);
    setAssignFunnelStep('status');
    setShowStatusFilter(false);
    setPendingAssignCalls([]);
    setPendingAssignReps([]);

    try {
      for (const rep of pendingReps) {
        const { error: profileError } = await supabase.from('profiles').update({
          allowed_statuses: allowedStatusList,
        }).eq('id', rep.id);

        if (profileError) {
          console.error('Supabase allowed_statuses update error:', profileError);
          setError(`Status filter could not be saved (${profileError.message}). Calls will still be assigned — apply the latest database migration for filters to persist.`);
          setTimeout(() => setError(''), 8000);
        } else {
          setUsers(prev => prev.map(u =>
            u.id === rep.id ? { ...u, allowedStatuses: allowedStatusList } : u
          ));
        }
      }

      const BATCH_SIZE = 200;

      if (mismatchedIds.length > 0) {
        for (let i = 0; i < mismatchedIds.length; i += BATCH_SIZE) {
          const batch = mismatchedIds.slice(i, i + BATCH_SIZE);
          const { error: unassignError } = await supabase.from('calls').update({
            assigned_to: null,
            assigned_to_name: null,
            updated_at: new Date().toISOString(),
          }).in('id', batch);
          if (unassignError) {
            console.error('Supabase unassign mismatch error:', unassignError);
          }
        }
      }

      for (const share of distribution.shares) {
        if (share.callIds.length === 0) continue;
        for (let i = 0; i < share.callIds.length; i += BATCH_SIZE) {
          const batch = share.callIds.slice(i, i + BATCH_SIZE);
          const { error: updateError } = await supabase.from('calls').update({
            assigned_to: share.repId,
            assigned_to_name: share.repName,
            updated_at: new Date().toISOString(),
          }).in('id', batch);

          if (updateError) {
            console.error('Supabase assign error:', updateError);
            setCalls(prev => prev.map(c => callIds.includes(c.id)
              ? { ...c, assignedTo: undefined, assignedToName: undefined }
              : c
            ));
            setError(`Assignment failed: ${updateError.message}`);
            setTimeout(() => setError(''), 6000);
            return;
          }

          const batchCreditIds = needCreditIds.filter(id => batch.includes(id));
          if (batchCreditIds.length > 0) {
            await supabase.from('calls').update({
              deal_by: share.repId,
              deal_by_name: share.repName,
            }).in('id', batchCreditIds);
          }
        }
      }

      const parts: string[] = [];
      if (count > 0) {
        if (assignModeUsed === 'distribute') {
          parts.push(
            `${count} call${count !== 1 ? 's' : ''} (${dealerCount} dealer${dealerCount !== 1 ? 's' : ''}) distributed across ${repCount} rep${repCount !== 1 ? 's' : ''}`
          );
        } else {
          parts.push(`${count} call${count !== 1 ? 's' : ''} assigned to ${assignRepName}`);
        }
      }
      if (mismatchedIds.length > 0) {
        parts.push(`${mismatchedIds.length} existing call${mismatchedIds.length !== 1 ? 's' : ''} returned to unassigned (status not in filter)`);
      }
      if (skippedInvalid > 0) {
        parts.push(`${skippedInvalid} skipped (temporary IDs — re-upload those calls to fix)`);
      }
      const msg = parts.join('. ');
      setSuccess(msg || (assignModeUsed === 'distribute'
        ? `Updated status filters for ${repCount} reps`
        : `Updated status filter for ${assignRepName}`));
      setTimeout(() => setSuccess(''), 6000);

    } catch (err: unknown) {
      console.error('Assignment exception:', err);
      setCalls(prev => prev.map(c => callIds.includes(c.id)
        ? { ...c, assignedTo: undefined, assignedToName: undefined }
        : c
      ));
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Assignment failed: ${message}`);
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

  const toggleFilterStatus = (label: string) => {
    setFilterStatuses(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  useEffect(() => {
    setDealerPage(1);
    setCallsPage(1);
    setSelectedCalls(prev => {
      const visible = new Set(statusFilteredUnassigned.map(c => c.id));
      const pruned = new Set([...prev].filter(id => visible.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [filterStatuses, statusFilteredUnassigned]);

  const handleStateChange = (state: string) => {
    setFilterState(state);
    setFilterStatuses(new Set());
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

  const hasSelection = selectedPoolCalls.length > 0;

  const assignButtonLabel = () => {
    if (assignMode === 'distribute') {
      if (!hasSelection) return 'Select dealers first';
      return `Distribute ${selectedDealerUnitCount} dealer${selectedDealerUnitCount !== 1 ? 's' : ''} →`;
    }
    if (step2View === 'dealers') {
      if (selectedDealers.size > 0 && assignToId)
        return `Assign ${totalCallsInDealerSelection} call${totalCallsInDealerSelection !== 1 ? 's' : ''} →`;
    } else {
      if (selectedCalls.size > 0 && assignToId)
        return `Assign ${selectedCalls.size} call${selectedCalls.size !== 1 ? 's' : ''} →`;
    }
    return 'Assign';
  };

  const assignDisabled = assignMode === 'distribute'
    ? !hasSelection
    : !assignToId || !hasSelection;

  const assignButtonClass =
    'px-4 py-1.5 bg-dss-navy-soft hover:bg-dss-navy disabled:bg-dss-canvas disabled:text-dss-muted disabled:cursor-not-allowed text-white rounded-dss-sm text-sm font-medium transition whitespace-nowrap';

  // ── UNASSIGN ─────────────────────────────────────────────────────
  const openUnassign = (rep: User) => {
    setUnassignRep(rep);
    setUnassignMode('dealer');
    setSelectedUnassignDealers(new Set());
    setSelectedUnassignStates(new Set());
    setSelectedUnassignCalls(new Set());
    setUnassignSearch('');
  };

  const getUnassignCallIds = (): string[] => {
    if (!unassignRep) return [];
    const repCalls = getRepCalls(unassignRep.id);
    if (unassignMode === 'dealer') {
      if (selectedUnassignDealers.size === 0) return [];
      return repCalls.filter(c => selectedUnassignDealers.has(c.dealerName)).map(c => c.id);
    }
    if (unassignMode === 'state') {
      if (selectedUnassignStates.size === 0) return [];
      return repCalls.filter(c => selectedUnassignStates.has(c.state)).map(c => c.id);
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
  const avatarColors = ['bg-dss-accent-soft text-dss-accent', 'bg-emerald-50 text-dss-success', 'bg-dss-accent-soft text-dss-accent', 'bg-amber-50 text-amber-800', 'bg-cyan-50 text-cyan-800', 'bg-pink-50 text-pink-700'];
  const getAvatarColor = (idx: number) => avatarColors[idx % avatarColors.length];

  const maxDealerCount = Math.max(...dealersInView.map(d => d.callCount), 1);

  const uniqueDealerOptions = useMemo(() => {
    const map = new Map<string, { name: string; cifNumber: string }>();
    calls.forEach(c => {
      const name = (c.dealerName || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      const cifNumber = c.dealerCifNumber || '';
      if (!existing) map.set(key, { name, cifNumber });
      else if (!existing.cifNumber && cifNumber) existing.cifNumber = cifNumber;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [calls]);

  const dncSuggestions = useMemo(() => {
    const q = dncQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return uniqueDealerOptions
      .filter(d => d.name.toLowerCase().includes(q) && !findDealerAlert({ dealerName: d.name, dealerCifNumber: d.cifNumber }, dealerAlerts))
      .slice(0, 8);
  }, [dncQuery, uniqueDealerOptions, dealerAlerts]);

  const addDoNotCallDealer = async (dealer: { name: string; cifNumber?: string }) => {
    if (!canManageDnc || !currentUserId) return;
    if (findDealerAlert({ dealerName: dealer.name, dealerCifNumber: dealer.cifNumber }, dealerAlerts)) {
      setError(`${dealer.name} is already flagged.`);
      return;
    }
    setDncSaving(true);
    setError('');
    const { data, error: err } = await supabase.from('dealer_alerts').insert({
      dealer_name: dealer.name,
      dealer_cif_number: dealer.cifNumber?.trim() || null,
      reason: dncReason.trim() || null,
      created_by: currentUserId,
      created_by_name: currentUserName || null,
    }).select().single();
    setDncSaving(false);
    if (err || !data) {
      setError(`Could not flag dealer: ${err?.message || 'Unknown error'}`);
      return;
    }
    setDealerAlerts?.(prev => [...prev, mapDealerAlertRow(data)].sort((a, b) => a.dealerName.localeCompare(b.dealerName)));
    setDncQuery('');
    setDncReason('');
    setSuccess(`${dealer.name} marked as do not call on updates.`);
  };

  const removeDoNotCallDealer = async (id: string) => {
    if (!canManageDnc) return;
    const { error: err } = await supabase.from('dealer_alerts').delete().eq('id', id);
    if (err) {
      setError(`Could not remove flag: ${err.message}`);
      return;
    }
    setDealerAlerts?.(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold text-dss-ink">Assign</h2>
        <p className="text-sm text-dss-muted mt-0.5">Manage call assignments and rep workloads</p>
      </div>

      {success && <div className="bg-emerald-50 border border-emerald-200 text-dss-success px-4 py-3 rounded-dss-sm text-sm">{success}</div>}
      {error && <div className="bg-rose-50 border border-rose-200 text-dss-danger px-4 py-3 rounded-dss-sm text-sm">{error}</div>}

      {canManageDnc && (
        <div className="bg-dss-surface rounded-dss-sm border border-rose-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 flex items-center gap-2">
            <BellOff className="w-4 h-4 text-rose-700" />
            <div>
              <h3 className="text-sm font-semibold text-dss-ink">Do not call on updates</h3>
              <p className="text-xs text-dss-muted">Flag a dealer once. Every app for that store will warn the assigned rep.</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-dss-muted absolute left-2.5 top-2.5" />
                <input
                  value={dncQuery}
                  onChange={e => setDncQuery(e.target.value)}
                  placeholder="Search dealer name…"
                  className="w-full pl-8 pr-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30"
                />
                {dncSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-dss-surface border border-dss-border rounded-dss-sm shadow-sm max-h-48 overflow-y-auto">
                    {dncSuggestions.map(d => (
                      <button
                        key={d.name}
                        type="button"
                        onClick={() => setDncQuery(d.name)}
                        className="w-full text-left px-3 py-2 text-sm text-dss-ink hover:bg-dss-canvas"
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                value={dncReason}
                onChange={e => setDncReason(e.target.value)}
                placeholder="Optional reason (email / portal only)"
                className="w-full px-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30"
              />
              <button
                type="button"
                disabled={dncSaving || !dncQuery.trim()}
                onClick={() => {
                  const match = uniqueDealerOptions.find(d => d.name.toLowerCase() === dncQuery.trim().toLowerCase())
                    || { name: dncQuery.trim(), cifNumber: '' };
                  void addDoNotCallDealer(match);
                }}
                className="px-3 py-2 rounded-dss-sm bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {dealerAlerts.length === 0 ? (
              <p className="text-sm text-dss-muted">No dealers flagged yet.</p>
            ) : (
              <div className="divide-y divide-dss-border border border-dss-border rounded-dss-sm">
                {dealerAlerts.map(alert => (
                  <div key={alert.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-dss-ink truncate">{alert.dealerName}</p>
                      <p className="text-xs text-dss-muted truncate">
                        {alert.reason || 'Do not call on updates'}
                        {alert.createdByName ? ` · ${alert.createdByName}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeDoNotCallDealer(alert.id)}
                      className="p-1 rounded text-dss-muted hover:text-dss-danger hover:bg-rose-50"
                      title="Remove flag"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ASSIGNMENT SUMMARY ──────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-dss-ink mb-3">Assignment summary</h3>
        {reps.length === 0 ? (
          <div className="bg-dss-surface rounded-dss-sm border border-dss-border p-6 text-center text-sm text-dss-muted">No reps found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reps.map((rep, idx) => {
              const repCalls = getRepCalls(rep.id);
              const dailyGoal = goals.daily[rep.id] || 0;
              return (
                <div key={rep.id} className="bg-dss-surface rounded-dss-sm border border-dss-border p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${getAvatarColor(idx)}`}>
                      {initials(rep.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-dss-ink truncate">{rep.name}</p>
                      <p className="text-xs text-dss-muted">
                        {repCalls.length} call{repCalls.length !== 1 ? 's' : ''} assigned
                        {dailyGoal > 0 && <span className="ml-2 text-dss-muted">· Goal: {dailyGoal}/day</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setViewCallsRep(rep); setViewSearchQuery(''); setViewTab('calls'); }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-dss-accent-soft bg-opacity-40 hover:bg-opacity-60 border border-dss-accent/30 text-dss-accent rounded-dss-sm text-xs transition">
                      <List className="w-3 h-3 flex-shrink-0" />
                      <span>View calls</span>
                    </button>
                    <button
                      onClick={() => openUnassign(rep)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-rose-50 bg-opacity-30 hover:bg-opacity-50 border border-rose-200 text-dss-danger rounded-dss-sm text-xs transition">
                      <UserMinus className="w-3 h-3 flex-shrink-0" />
                      <span>Unassign</span>
                    </button>
                    <button
                      onClick={() => openGoal(rep)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-dss-sm text-xs transition">
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
        <h3 className="text-sm font-semibold text-dss-ink mb-3">
          Assign calls
          <span className="ml-2 text-dss-muted font-normal">({unassignedCalls.length} unassigned)</span>
        </h3>

        {/* Step 1: State selector */}
        <div className="bg-dss-surface rounded-dss-sm border border-dss-border p-4 mb-3">
          <p className="text-xs text-dss-muted uppercase tracking-wider mb-3">Step 1 — Select a state</p>
          <div className="flex items-center gap-2 flex-wrap">

            {/* All States button */}
            <button
              onClick={() => handleStateChange('')}
              className={`flex items-center gap-2 px-4 py-2 rounded-dss-sm border text-sm font-medium transition ${
                filterState === ''
                  ? 'bg-dss-navy-soft border-dss-navy-soft text-white'
                  : 'bg-dss-canvas border-dss-border text-dss-ink/80 hover:border-dss-navy-soft hover:text-dss-accent'
              }`}>
              <span>All States</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterState === '' ? 'bg-dss-navy-soft text-white' : 'bg-dss-canvas text-dss-muted'}`}>
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
                  className={`flex items-center gap-2 px-4 py-2 rounded-dss-sm border text-sm font-medium transition ${
                    filterState === state
                      ? 'bg-dss-navy-soft border-dss-navy-soft text-white'
                      : 'bg-dss-canvas border-dss-border text-dss-ink/80 hover:border-dss-navy-soft hover:text-dss-accent'
                  }`}>
                  <span>{state}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterState === state ? 'bg-dss-navy-soft text-white' : 'bg-dss-canvas text-dss-muted'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Dealers or Calls */}
        <div className="bg-dss-surface rounded-dss-sm border border-dss-border overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-dss-border">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-dss-muted uppercase tracking-wider">
                  Step 2 — {filterState ? `${filterState}` : 'All States'}
                </p>
                <p className="text-xs text-dss-muted mt-0.5">
                  {step2View === 'dealers'
                    ? `${dealersInView.length} dealer${dealersInView.length !== 1 ? 's' : ''} · ${statusFilteredUnassigned.length} call${statusFilteredUnassigned.length !== 1 ? 's' : ''}`
                    : `${callsInView.length} call${callsInView.length !== 1 ? 's' : ''}`
                  }
                  {filterStatuses.size > 0 && (
                    <span className="ml-2 text-indigo-700">
                      · Showing {statusFilteredUnassigned.length} of {stateScopedUnassigned.length}
                    </span>
                  )}
                  {step2View === 'dealers' && selectedDealers.size > 0 && (
                    <span className="ml-2 text-dss-accent font-medium">· {selectedDealers.size} dealer{selectedDealers.size !== 1 ? 's' : ''} selected ({totalCallsInDealerSelection} calls)</span>
                  )}
                  {step2View === 'calls' && selectedCalls.size > 0 && (
                    <span className="ml-2 text-dss-accent font-medium">· {selectedCalls.size} call{selectedCalls.size !== 1 ? 's' : ''} selected</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Dealers / Calls toggle */}
                <div className="flex bg-dss-canvas rounded-dss-sm p-0.5 border border-dss-border">
                  <button
                    onClick={() => handleStep2ViewChange('dealers')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                      step2View === 'dealers'
                        ? 'bg-dss-navy-soft text-white'
                        : 'text-dss-muted hover:text-dss-ink'
                    }`}>
                    Dealers
                  </button>
                  <button
                    onClick={() => handleStep2ViewChange('calls')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                      step2View === 'calls'
                        ? 'bg-dss-navy-soft text-white'
                        : 'text-dss-muted hover:text-dss-ink'
                    }`}>
                    Calls
                  </button>
                </div>

                <div className="flex bg-dss-canvas rounded-dss-sm p-0.5 border border-dss-border">
                  <button
                    type="button"
                    onClick={() => setAssignMode('one')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                      assignMode === 'one'
                        ? 'bg-dss-navy-soft text-white'
                        : 'text-dss-muted hover:text-dss-ink'
                    }`}>
                    One rep
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignMode('distribute')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                      assignMode === 'distribute'
                        ? 'bg-dss-navy-soft text-white'
                        : 'text-dss-muted hover:text-dss-ink'
                    }`}>
                    Evenly distribute
                  </button>
                </div>

                {assignMode === 'one' && (
                  <>
                    <select
                      value={assignToId}
                      onChange={e => setAssignToId(e.target.value)}
                      className="px-3 py-1.5 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30">
                      <option value="">Assign to rep…</option>
                      {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={assignDisabled}
                      className={assignButtonClass}>
                      {assignButtonLabel()}
                    </button>
                  </>
                )}
                {assignMode === 'distribute' && (
                  <button
                    onClick={handleAssign}
                    disabled={assignDisabled}
                    title={assignDisabled ? assignButtonLabel() : undefined}
                    className={assignButtonClass}>
                    {assignButtonLabel()}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Status Last filter chips */}
          <div className="px-4 py-2.5 border-b border-dss-border bg-dss-canvas">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-dss-muted uppercase tracking-wider whitespace-nowrap w-20 flex-shrink-0">Status Last</span>
              <div className="w-px h-4 bg-dss-canvas flex-shrink-0" />
              <button
                type="button"
                onClick={() => setFilterStatuses(new Set())}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition ${
                  filterStatuses.size === 0
                    ? 'bg-dss-accent-soft text-dss-accent border-dss-accent/30'
                    : 'bg-dss-surface border-dss-border text-dss-muted hover:border-dss-border hover:text-dss-ink/80'
                }`}>
                {filterStatuses.size === 0 && <Check className="w-3 h-3 flex-shrink-0" />}
                All ({stateScopedUnassigned.length})
              </button>
              {STATUS_FILTER_OPTIONS.map(({ label, onCls, offCls }) => {
                const isOn = filterStatuses.has(label);
                const count = statusCountsByLabel[label] ?? 0;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleFilterStatus(label)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition ${
                      isOn ? onCls : offCls
                    } ${count === 0 && !isOn ? 'opacity-50' : ''}`}>
                    {isOn && <Check className="w-3 h-3 flex-shrink-0" />}
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search bar */}
          <div className="px-4 py-2.5 border-b border-dss-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dss-muted" />
              <input
                type="text"
                placeholder={step2View === 'dealers' ? 'Search dealers…' : 'Search App ID, dealer, customer…'}
                value={step2View === 'dealers' ? dealerSearch : callsSearch}
                onChange={e => {
                  if (step2View === 'dealers') { setDealerSearch(e.target.value); setDealerPage(1); }
                  else { setCallsSearch(e.target.value); setCallsPage(1); }
                }}
                className="w-full pl-8 pr-3 py-1.5 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink placeholder-dss-muted/70 focus:outline-none focus:ring-1 focus:ring-dss-accent/30"
              />
            </div>
          </div>

          {/* ── DEALERS VIEW ── */}
          {step2View === 'dealers' && (
            <>
              <div className="grid grid-cols-[28px_1fr_60px_80px] gap-0 px-4 py-2 bg-dss-canvas border-b border-dss-border items-center">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allDealersSelected}
                    onChange={toggleSelectAllDealers}
                    title="Select all dealers"
                    className="w-3.5 h-3.5 accent-dss-navy-soft cursor-pointer"
                  />
                </div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2">Dealer</div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2 text-center">Calls</div>
                <div className="px-2 text-right">
                  {selectedDealers.size > 0 && (
                    <button onClick={() => setSelectedDealers(new Set())}
                      className="text-dss-accent hover:text-dss-accent text-xs transition">Clear all</button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-gray-700">
                {paginatedDealers.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-dss-muted">No dealers match your search.</div>
                ) : paginatedDealers.map(dealer => {
                  const isSelected = selectedDealers.has(dealer.name);
                  return (
                    <div
                      key={dealer.name}
                      className={`grid grid-cols-[28px_1fr_60px_80px] gap-0 px-4 py-3 cursor-pointer transition-colors items-center ${isSelected ? 'bg-dss-accent-soft bg-opacity-15' : 'hover:bg-dss-canvas'}`}
                      onClick={() => toggleDealer(dealer.name)}>
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={e => { e.stopPropagation(); toggleDealer(dealer.name); }}
                          className="w-3.5 h-3.5 accent-dss-navy-soft cursor-pointer"
                        />
                      </div>
                      <div className="px-2">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-dss-accent' : 'text-dss-ink'}`}>
                          {dealer.name}
                        </p>
                        {findDealerAlert({ dealerName: dealer.name, dealerCifNumber: dealer.cifNumber }, dealerAlerts) && (
                          <span
                            title={findDealerAlert({ dealerName: dealer.name, dealerCifNumber: dealer.cifNumber }, dealerAlerts)?.reason || 'Do not call on updates'}
                            className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0 rounded text-[10px] font-medium bg-rose-50 text-rose-800 border border-rose-200"
                          >
                            Do not call
                          </span>
                        )}
                        {!filterState && <p className="text-xs text-dss-muted">All States</p>}
                        {filterState && <p className="text-xs text-dss-muted">{filterState}</p>}
                      </div>
                      <div className="px-2 text-center">
                        <span className={`text-sm font-bold ${isSelected ? 'text-dss-accent' : 'text-dss-ink/80'}`}>{dealer.callCount}</span>
                        <p className="text-[10px] text-dss-muted">call{dealer.callCount !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="px-2">
                        <div className="h-1.5 bg-dss-canvas rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isSelected ? 'bg-dss-navy-soft' : 'bg-dss-muted'}`}
                            style={{ width: `${Math.round((dealer.callCount / maxDealerCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalDealerPages > 1 && (
                <div className="px-4 py-2.5 border-t border-dss-border flex items-center justify-between bg-dss-canvas">
                  <p className="text-xs text-dss-muted">
                    Showing {Math.min((dealerPage - 1) * DEALERS_PER_PAGE + 1, filteredDealers.length)}–{Math.min(dealerPage * DEALERS_PER_PAGE, filteredDealers.length)} of {filteredDealers.length} dealers
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDealerPage(p => Math.max(1, p - 1))} disabled={dealerPage === 1}
                      className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
                      <ChevronLeft className="w-4 h-4 text-dss-muted" />
                    </button>
                    {Array.from({ length: Math.min(5, totalDealerPages) }, (_, i) => {
                      let page: number;
                      if (totalDealerPages <= 5) page = i + 1;
                      else if (dealerPage <= 3) page = i + 1;
                      else if (dealerPage >= totalDealerPages - 2) page = totalDealerPages - 4 + i;
                      else page = dealerPage - 2 + i;
                      return (
                        <button key={page} onClick={() => setDealerPage(page)}
                          className={`w-7 h-7 rounded text-xs transition ${dealerPage === page ? 'bg-dss-navy-soft text-white' : 'hover:bg-dss-canvas text-dss-muted'}`}>
                          {page}
                        </button>
                      );
                    })}
                    <button onClick={() => setDealerPage(p => Math.min(totalDealerPages, p + 1))} disabled={dealerPage >= totalDealerPages}
                      className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
                      <ChevronRightIcon className="w-4 h-4 text-dss-muted" />
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
              <div className="grid grid-cols-[28px_110px_1fr_110px_38px_75px_105px] gap-0 px-3 py-2 bg-dss-canvas border-b border-dss-border items-center">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allCallsPageSelected}
                    onChange={toggleSelectAllCallsPage}
                    className="w-3.5 h-3.5 accent-dss-navy-soft cursor-pointer"
                  />
                </div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2">App ID</div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2">Dealer</div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2">Customer</div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2">St</div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2">Amount</div>
                <div className="text-xs font-medium text-dss-muted uppercase tracking-wider px-2">Status Last</div>
              </div>

              <div className="divide-y divide-gray-700">
                {paginatedCallsView.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-dss-muted">
                    {filterStatuses.size > 0 ? 'No calls match selected statuses.' : 'No calls found.'}
                  </div>
                ) : paginatedCallsView.map(call => {
                  const isSelected = selectedCalls.has(call.id);
                  return (
                    <div
                      key={call.id}
                      className={`grid grid-cols-[28px_110px_1fr_110px_38px_75px_105px] gap-0 px-3 py-2 cursor-pointer transition-colors items-center ${isSelected ? 'bg-dss-accent-soft bg-opacity-10' : 'hover:bg-dss-canvas'}`}
                      onClick={() => toggleCall(call.id)}>
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={e => { e.stopPropagation(); toggleCall(call.id); }}
                          className="w-3.5 h-3.5 accent-dss-navy-soft cursor-pointer"
                        />
                      </div>
                      <div className="px-2 text-xs text-dss-accent font-medium truncate">{call.applicationId}</div>
                      <div className="px-2 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs text-dss-ink truncate">{call.dealerName}</span>
                          {findDealerAlert(call, dealerAlerts) && (
                            <span className="flex-shrink-0 inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
                              Do not call
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="px-2 text-xs text-dss-muted truncate">{call.customerName || '—'}</div>
                      <div className="px-2">
                        <span className="px-1.5 py-0 bg-dss-canvas text-dss-ink/80 text-[10px] rounded border border-dss-border">{call.state}</span>
                      </div>
                      <div className="px-2 text-xs font-medium text-dss-ink">
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
              <div className="px-4 py-2.5 border-t border-dss-border flex items-center justify-between bg-dss-canvas">
                <p className="text-xs text-dss-muted">
                  Showing {callsInView.length === 0 ? 0 : Math.min((callsPage - 1) * CALLS_PER_PAGE + 1, callsInView.length)}–{Math.min(callsPage * CALLS_PER_PAGE, callsInView.length)} of {callsInView.length} calls
                  {selectedCalls.size > 0 && <span className="ml-2 text-dss-accent">{selectedCalls.size} selected</span>}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCallsPage(p => Math.max(1, p - 1))} disabled={callsPage === 1}
                    className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
                    <ChevronLeft className="w-4 h-4 text-dss-muted" />
                  </button>
                  {Array.from({ length: Math.min(5, totalCallsPages) }, (_, i) => {
                    let page: number;
                    if (totalCallsPages <= 5) page = i + 1;
                    else if (callsPage <= 3) page = i + 1;
                    else if (callsPage >= totalCallsPages - 2) page = totalCallsPages - 4 + i;
                    else page = callsPage - 2 + i;
                    return (
                      <button key={page} onClick={() => setCallsPage(page)}
                        className={`w-7 h-7 rounded text-xs transition ${callsPage === page ? 'bg-dss-navy-soft text-white' : 'hover:bg-dss-canvas text-dss-muted'}`}>
                        {page}
                      </button>
                    );
                  })}
                  {totalCallsPages > 5 && callsPage < totalCallsPages - 2 && (
                    <>
                      <span className="text-xs text-dss-muted px-1">…</span>
                      <button onClick={() => setCallsPage(totalCallsPages)}
                        className="w-7 h-7 rounded text-xs hover:bg-dss-canvas text-dss-muted transition">
                        {totalCallsPages}
                      </button>
                    </>
                  )}
                  <button onClick={() => setCallsPage(p => Math.min(totalCallsPages, p + 1))} disabled={callsPage >= totalCallsPages}
                    className="p-1.5 rounded hover:bg-dss-canvas disabled:opacity-30 transition">
                    <ChevronRightIcon className="w-4 h-4 text-dss-muted" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

{/* ── ASSIGN FUNNEL POPUP ─────────────────────────────────── */}
{showStatusFilter && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 px-4"
          onClick={closeAssignModal}>
          <div className={`bg-dss-surface rounded-dss border border-dss-border w-full overflow-hidden ${pendingAssignMode === 'distribute' ? 'max-w-xl' : 'max-w-lg'}`}
            onClick={e => e.stopPropagation()}>

            {pendingAssignMode === 'distribute' && assignFunnelStep === 'reps' ? (
              <>
                <div className="flex items-start justify-between px-6 py-4 border-b border-dss-border">
                  <div>
                    <p className="text-xs text-dss-muted uppercase tracking-wider">Step 1 of 2</p>
                    <h3 className="text-base font-semibold text-dss-ink mt-0.5">Choose reps</h3>
                    <p className="text-xs text-dss-muted mt-1">
                      {uniqueDealerCount(pendingAssignCalls)} dealer{uniqueDealerCount(pendingAssignCalls) !== 1 ? 's' : ''}
                      {` · ${pendingAssignCalls.length} call${pendingAssignCalls.length !== 1 ? 's' : ''}`}
                      {filterState ? ` · ${filterState}` : ' · All States'}
                    </p>
                  </div>
                  <button onClick={closeAssignModal} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
                </div>

                <div className="p-5 space-y-4">
                  {error && (
                    <div className="bg-rose-50 bg-opacity-30 border border-rose-200 rounded-dss-sm px-4 py-3">
                      <p className="text-xs text-dss-danger leading-relaxed">{error}</p>
                    </div>
                  )}
                  <p className="text-xs text-dss-muted">Click every rep who should get a share. Each dealer stays with one rep.</p>
                  {reps.length === 0 ? (
                    <p className="text-sm text-dss-muted">No reps available.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {reps.map(rep => {
                        const isOn = selectedDistributeRepIds.includes(rep.id);
                        return (
                          <button
                            key={rep.id}
                            type="button"
                            onClick={() => toggleDistributeRep(rep.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-sm font-medium transition ${
                              isOn
                                ? 'bg-dss-navy-soft text-white border-dss-navy-soft'
                                : 'bg-dss-surface border-dss-border text-dss-ink hover:border-dss-navy-soft'
                            }`}>
                            {isOn && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                            {rep.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedDistributeReps.length > 0 && (
                    <p className="text-xs text-dss-accent font-medium">
                      {selectedDistributeReps.length} rep{selectedDistributeReps.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 px-6 py-4 border-t border-dss-border">
                  <button onClick={closeAssignModal}
                    className="px-4 py-2 bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80 rounded-dss-sm text-sm transition">
                    Cancel
                  </button>
                  <button
                    onClick={handleContinueDistributeFunnel}
                    disabled={selectedDistributeReps.length < 2}
                    className="flex-1 px-4 py-2 bg-dss-navy-soft hover:bg-dss-navy disabled:bg-dss-canvas disabled:text-dss-muted disabled:cursor-not-allowed text-white rounded-dss-sm text-sm font-medium transition">
                    {selectedDistributeReps.length < 2
                      ? 'Select at least 2 reps'
                      : `Continue with ${selectedDistributeReps.length} reps →`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between px-6 py-4 border-b border-dss-border">
                  <div>
                    {pendingAssignMode === 'distribute' && (
                      <p className="text-xs text-dss-muted uppercase tracking-wider">Step 2 of 2</p>
                    )}
                    <h3 className="text-base font-semibold text-dss-ink mt-0.5">Filter by status before assigning</h3>
                    <p className="text-xs text-dss-muted mt-1">
                      {pendingAssignMode === 'distribute'
                        ? `${pendingAssignReps.length} rep${pendingAssignReps.length !== 1 ? 's' : ''}`
                        : (pendingAssignReps[0]?.name || '')}
                      {` · ${pendingAssignCalls.length} call${pendingAssignCalls.length !== 1 ? 's' : ''} selected`}
                      {filterState ? ` · ${filterState}` : ' · All States'}
                    </p>
                  </div>
                  <button onClick={closeAssignModal} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
                </div>

                <div className="p-5 space-y-4">
                  {error && (
                    <div className="bg-rose-50 bg-opacity-30 border border-rose-200 rounded-dss-sm px-4 py-3">
                      <p className="text-xs text-dss-danger leading-relaxed">{error}</p>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-dss-muted uppercase tracking-wider">Select which statuses to include</p>
                      <button
                        onClick={() => {
                          if (selectedStatuses.size === STATUS_FILTER_OPTIONS.length) {
                            setSelectedStatuses(new Set(DEFAULT_STATUSES));
                          } else {
                            setSelectedStatuses(new Set(STATUS_FILTER_OPTIONS.map(s => s.label)));
                          }
                        }}
                        className="text-xs text-dss-accent hover:text-dss-accent transition">
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

                  {(() => {
                    const matching = pendingMatchingCalls.length;
                    const skipped = pendingAssignCalls.length - matching;
                    return (
                      <div className="bg-dss-canvas border border-dss-border rounded-dss-sm px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-dss-muted">Total calls in selection</span>
                          <span className="text-sm font-medium text-dss-ink">{pendingAssignCalls.length}</span>
                        </div>
                        <div className="h-px bg-dss-canvas" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-dss-muted">Calls matching selected statuses</span>
                          <span className="text-sm font-bold text-dss-success">{matching}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-dss-muted">Calls skipped (stay unassigned)</span>
                          <span className="text-sm text-dss-muted">{skipped}</span>
                        </div>
                        {pendingAssignMode === 'distribute' && (
                          <>
                            <div className="h-px bg-dss-canvas" />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-dss-muted">Dealers in this split</span>
                              <span className="text-sm font-medium text-dss-ink">{pendingDistribution.dealerCount}</span>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {pendingDistribution.shares.map(share => (
                                <div key={share.repId} className="flex items-center justify-between">
                                  <span className="text-xs text-dss-ink">{share.repName}</span>
                                  <span className="text-xs text-dss-muted">
                                    {share.dealerCount} dealer{share.dealerCount !== 1 ? 's' : ''} · {share.callCount} call{share.callCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <p className="text-xs text-dss-muted">Skipped calls stay in the unassigned pool and can be assigned later.</p>
                </div>

                <div className="flex items-center gap-3 px-6 py-4 border-t border-dss-border">
                  {pendingAssignMode === 'distribute' ? (
                    <button
                      onClick={() => { setAssignFunnelStep('reps'); setError(''); }}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80 rounded-dss-sm text-sm transition">
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  ) : (
                    <button onClick={closeAssignModal}
                      className="px-4 py-2 bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80 rounded-dss-sm text-sm transition">
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleConfirmAssign}
                    disabled={selectedStatuses.size === 0}
                    className="flex-1 px-4 py-2 bg-dss-navy-soft hover:bg-dss-navy disabled:bg-dss-canvas disabled:text-dss-muted disabled:cursor-not-allowed text-white rounded-dss-sm text-sm font-medium transition">
                    {pendingAssignMode === 'distribute'
                      ? `Distribute ${pendingMatchingCalls.length} call${pendingMatchingCalls.length !== 1 ? 's' : ''} across ${pendingAssignReps.length} reps →`
                      : `Assign ${pendingMatchingCalls.length} call${pendingMatchingCalls.length !== 1 ? 's' : ''} to ${pendingAssignReps[0]?.name || 'rep'} →`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW CALLS POPUP ────────────────────────────────────── */}
      {viewCallsRep && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-10 z-50 px-4"
          onClick={() => setViewCallsRep(null)}>
          <div className="bg-dss-surface rounded-dss border border-dss-border w-full max-w-4xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-dss-border">
              <div>
                <h3 className="text-lg font-semibold text-dss-ink">{viewCallsRep.name}</h3>
                <p className="text-xs text-dss-muted mt-0.5">
                  {viewRepCalls.length} call{viewRepCalls.length !== 1 ? 's' : ''} · {viewRepDealers.length} dealer{viewRepDealers.length !== 1 ? 's' : ''} · press Escape to close
                </p>
              </div>
              <button onClick={() => setViewCallsRep(null)} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
            </div>
            <div className="flex border-b border-dss-border">
              <button onClick={() => { setViewTab('calls'); setViewSearchQuery(''); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition border-b-2 ${viewTab === 'calls' ? 'border-dss-accent text-dss-accent' : 'border-transparent text-dss-muted hover:text-dss-ink/80'}`}>
                Calls ({viewRepCalls.length})
              </button>
              <button onClick={() => { setViewTab('dealers'); setViewSearchQuery(''); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition border-b-2 ${viewTab === 'dealers' ? 'border-dss-accent text-dss-accent' : 'border-transparent text-dss-muted hover:text-dss-ink/80'}`}>
                Dealers ({viewRepDealers.length})
              </button>
            </div>
            <div className="px-4 py-3 border-b border-dss-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dss-muted" />
                <input type="text"
                  placeholder={viewTab === 'calls' ? 'Search App ID, dealer, customer…' : 'Search dealer name…'}
                  value={viewSearchQuery} onChange={e => setViewSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink placeholder-dss-muted/70 focus:outline-none focus:ring-1 focus:ring-dss-accent/30"
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
                  <thead className="bg-dss-canvas sticky top-0">
                    <tr className="border-b border-dss-border">
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">App ID</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Dealer</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Customer</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">St</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Amount</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Date</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Status Last</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">FU Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredViewCalls.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-dss-muted">No calls found</td></tr>
                    ) : filteredViewCalls.map(call => (
                      <tr key={call.id} className="hover:bg-dss-canvas transition-colors">
                        <td className="px-2 py-2 text-xs text-dss-accent font-medium truncate">{call.applicationId}</td>
                        <td className="px-2 py-2 text-xs text-dss-ink truncate">{call.dealerName}</td>
                        <td className="px-2 py-2 text-xs text-dss-muted truncate">{call.customerName || '—'}</td>
                        <td className="px-2 py-2"><span className="px-1.5 py-0 bg-dss-canvas text-dss-ink/80 text-[10px] rounded border border-dss-border">{call.state}</span></td>
                        <td className="px-2 py-2 text-xs font-medium text-dss-ink">${parseAmount(call.buyerFinal).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                        <td className="px-2 py-2 text-xs text-dss-muted whitespace-nowrap">{call.submittedDate}</td>
                        <td className="px-2 py-2"><span className={`px-1.5 py-0 rounded-full text-[10px] border truncate ${getStatusLastStyle(call.statusLast)}`}>{call.statusLast}</span></td>
                        <td className="px-2 py-2 text-xs text-dss-muted">{call.fuStatus || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {viewTab === 'dealers' && (
              <div className="overflow-y-auto max-h-[55vh]">
                {filteredViewDealers.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-dss-muted">No dealers found</div>
                ) : (
                  <table className="w-full" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '200px' }} /><col style={{ width: '50px' }} />
                      <col style={{ width: '180px' }} /><col style={{ width: '115px' }} />
                    </colgroup>
                    <thead className="bg-dss-canvas sticky top-0">
                      <tr className="border-b border-dss-border">
                        <th className="px-3 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Dealer</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">St</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Calls</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-dss-muted uppercase tracking-wider">Status Last</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {filteredViewDealers.map(dealer => (
                        <tr key={dealer.name} className="hover:bg-dss-canvas transition-colors">
                          <td className="px-3 py-2.5 text-sm font-medium text-dss-ink truncate">{dealer.name}</td>
                          <td className="px-3 py-2.5"><span className="px-1.5 py-0 bg-dss-canvas text-dss-ink/80 text-[10px] rounded border border-dss-border">{dealer.state}</span></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-dss-ink/80 w-5 flex-shrink-0">{dealer.callCount}</span>
                              <div className="flex-1 h-1.5 bg-dss-canvas rounded-full overflow-hidden">
                                <div className="h-full bg-dss-navy-soft rounded-full" style={{ width: `${Math.round((dealer.callCount / dealer.maxCount) * 100)}%` }} />
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
            <div className="px-6 py-3 border-t border-dss-border">
              <p className="text-xs text-dss-muted">Press Escape to close</p>
            </div>
          </div>
        </div>
      )}

      {/* ── UNASSIGN MODAL ──────────────────────────────────────── */}
      {unassignRep && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-10 z-50 px-4"
          onClick={() => setUnassignRep(null)}>
          <div className="bg-dss-surface rounded-dss border border-dss-border w-full max-w-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-dss-border">
              <div>
                <h3 className="text-lg font-semibold text-dss-ink">Unassign from {unassignRep.name}</h3>
                <p className="text-xs text-dss-muted mt-0.5">{unassignRepCalls.length} calls currently assigned</p>
              </div>
              <button onClick={() => setUnassignRep(null)} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
            </div>
            <div className="flex border-b border-dss-border">
            {(['dealer', 'state', 'individual'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setUnassignMode(mode); setSelectedUnassignDealers(new Set()); setSelectedUnassignStates(new Set()); setSelectedUnassignCalls(new Set()); setUnassignSearch(''); }}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition border-b-2 capitalize ${unassignMode === mode ? 'border-dss-accent text-dss-accent' : 'border-transparent text-dss-muted hover:text-dss-ink/80'}`}>
                  By {mode}
                </button>
              ))}
            </div>
            <div className="p-5">
            {unassignMode === 'dealer' && (
                <div className="space-y-3">
                  <p className="text-xs text-dss-muted">Select one or more dealers to remove all their calls from {unassignRep.name}.</p>
                  <div>
                    <div className="flex items-center justify-between px-3 py-2 bg-dss-canvas border border-dss-border border-b-0 rounded-t-lg">
                      <span className="text-xs text-dss-muted">
                        {selectedUnassignDealers.size > 0
                          ? `${selectedUnassignDealers.size} of ${unassignDealers.length} selected`
                          : `${unassignDealers.length} dealers`}
                      </span>
                      <button
                        onClick={() => {
                          if (selectedUnassignDealers.size === unassignDealers.length) {
                            setSelectedUnassignDealers(new Set());
                          } else {
                            setSelectedUnassignDealers(new Set(unassignDealers));
                          }
                        }}
                        className="text-xs text-dss-accent hover:text-dss-accent transition">
                        {selectedUnassignDealers.size === unassignDealers.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="border border-dss-border rounded-b-lg overflow-hidden max-h-52 overflow-y-auto">
                      {unassignDealers.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-dss-muted">No dealers found</p>
                      ) : unassignDealers.map(d => {
                        const cnt = unassignRepCalls.filter(c => c.dealerName === d).length;
                        const isSelected = selectedUnassignDealers.has(d);
                        const repState = unassignRepCalls.find(c => c.dealerName === d)?.state || '';
                        return (
                          <div
                            key={d}
                            className={`flex items-center gap-3 px-3 py-2.5 border-b border-dss-border last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-rose-50 bg-opacity-10' : 'hover:bg-dss-canvas'}`}
                            onClick={() => {
                              setSelectedUnassignDealers(prev => {
                                const n = new Set(prev);
                                if (n.has(d)) n.delete(d); else n.add(d);
                                return n;
                              });
                            }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="w-3.5 h-3.5 accent-red-500 flex-shrink-0 pointer-events-none"
                            />
                            <span className="text-xs text-dss-ink flex-1 truncate">{d}</span>
                            <span className="px-1.5 py-0 bg-dss-canvas text-dss-ink/80 text-[10px] rounded border border-dss-border flex-shrink-0">{repState}</span>
                            <span className="text-xs text-dss-muted flex-shrink-0">{cnt} call{cnt !== 1 ? 's' : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {selectedUnassignDealers.size > 0 && (
                    <div className="bg-dss-canvas border border-dss-border rounded-dss-sm px-4 py-3">
                      <p className="text-sm text-dss-ink/80">
                        This will unassign <span className="font-medium text-white">{getUnassignCallIds().length} calls</span> from <span className="font-medium text-white">{selectedUnassignDealers.size} dealer{selectedUnassignDealers.size !== 1 ? 's' : ''}</span>.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {unassignMode === 'state' && (
                <div className="space-y-3">
                  <p className="text-xs text-dss-muted">Select one or more states to remove all calls in those states from {unassignRep.name}.</p>
                  <div>
                    <div className="flex items-center justify-between px-3 py-2 bg-dss-canvas border border-dss-border border-b-0 rounded-t-lg">
                      <span className="text-xs text-dss-muted">
                        {selectedUnassignStates.size > 0
                          ? `${selectedUnassignStates.size} of ${unassignStates.length} selected`
                          : `${unassignStates.length} states`}
                      </span>
                      <button
                        onClick={() => {
                          if (selectedUnassignStates.size === unassignStates.length) {
                            setSelectedUnassignStates(new Set());
                          } else {
                            setSelectedUnassignStates(new Set(unassignStates));
                          }
                        }}
                        className="text-xs text-dss-accent hover:text-dss-accent transition">
                        {selectedUnassignStates.size === unassignStates.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="border border-dss-border rounded-b-lg overflow-hidden max-h-52 overflow-y-auto">
                      {unassignStates.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-dss-muted">No states found</p>
                      ) : unassignStates.map(s => {
                        const cnt = unassignRepCalls.filter(c => c.state === s).length;
                        const isSelected = selectedUnassignStates.has(s);
                        return (
                          <div
                            key={s}
                            className={`flex items-center gap-3 px-3 py-2.5 border-b border-dss-border last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-rose-50 bg-opacity-10' : 'hover:bg-dss-canvas'}`}
                            onClick={() => {
                              setSelectedUnassignStates(prev => {
                                const n = new Set(prev);
                                if (n.has(s)) n.delete(s); else n.add(s);
                                return n;
                              });
                            }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="w-3.5 h-3.5 accent-red-500 flex-shrink-0 pointer-events-none"
                            />
                            <span className="text-xs text-dss-ink flex-1">{s}</span>
                            <span className="px-1.5 py-0 bg-dss-canvas text-dss-ink/80 text-[10px] rounded border border-dss-border flex-shrink-0">{s}</span>
                            <span className="text-xs text-dss-muted flex-shrink-0">{cnt} call{cnt !== 1 ? 's' : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {selectedUnassignStates.size > 0 && (
                    <div className="bg-dss-canvas border border-dss-border rounded-dss-sm px-4 py-3">
                      <p className="text-sm text-dss-ink/80">
                        This will unassign <span className="font-medium text-white">{getUnassignCallIds().length} calls</span> from <span className="font-medium text-white">{selectedUnassignStates.size} state{selectedUnassignStates.size !== 1 ? 's' : ''}</span>.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {unassignMode === 'individual' && (
                <div className="space-y-3">
                  <p className="text-xs text-dss-muted">Select specific calls to unassign from {unassignRep.name}.</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dss-muted" />
                    <input type="text" placeholder="Search App ID or dealer…" value={unassignSearch} onChange={e => setUnassignSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink placeholder-dss-muted/70 focus:outline-none focus:ring-1 focus:ring-dss-accent/30" autoFocus />
                  </div>
                  <div className="border border-dss-border rounded-dss-sm overflow-hidden max-h-60 overflow-y-auto">
                    {filteredUnassignIndividual.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-dss-muted">No calls found</p>
                    ) : filteredUnassignIndividual.map(call => (
                      <div key={call.id}
                        className={`flex items-center gap-3 px-3 py-2.5 border-b border-dss-border last:border-0 cursor-pointer hover:bg-dss-canvas transition-colors ${selectedUnassignCalls.has(call.id) ? 'bg-rose-50 bg-opacity-10' : ''}`}
                        onClick={() => { setSelectedUnassignCalls(prev => { const n = new Set(prev); if (n.has(call.id)) n.delete(call.id); else n.add(call.id); return n; }); }}>
                        <input type="checkbox" checked={selectedUnassignCalls.has(call.id)} readOnly className="w-3.5 h-3.5 accent-red-500 flex-shrink-0 pointer-events-none" />
                        <span className="text-xs text-dss-accent font-medium w-28 flex-shrink-0">{call.applicationId}</span>
                        <span className="text-xs text-dss-ink flex-1 truncate">{call.dealerName}</span>
                        <span className="px-1.5 py-0 bg-dss-canvas text-dss-ink/80 text-[10px] rounded border border-dss-border flex-shrink-0">{call.state}</span>
                      </div>
                    ))}
                  </div>
                  {selectedUnassignCalls.size > 0 && <p className="text-xs text-dss-muted">{selectedUnassignCalls.size} call{selectedUnassignCalls.size !== 1 ? 's' : ''} selected</p>}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-dss-border">
              <button onClick={() => setUnassignRep(null)} className="px-4 py-2 bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80 rounded-dss-sm text-sm transition">Cancel</button>
              <button onClick={handleUnassign} disabled={unassigning || getUnassignCallIds().length === 0}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-dss-canvas disabled:cursor-not-allowed text-white rounded-dss-sm text-sm font-medium transition">
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
          <div className="bg-dss-surface rounded-dss border border-dss-border w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-dss-border">
              <h3 className="text-base font-semibold text-dss-ink">Set daily goal</h3>
              <button onClick={() => setGoalRep(null)} className="text-dss-muted hover:text-dss-ink text-2xl font-light">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-dss-ink/80">Daily deal goal for <span className="font-medium text-white">{goalRep.name}</span></p>
              <div>
                <label className="block text-xs text-dss-muted uppercase tracking-wider mb-1.5">Deals per day</label>
                <input type="number" min="0" value={goalValue} onChange={e => setGoalValue(e.target.value)}
                  placeholder="0" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); }}
                  className="w-full px-3 py-2.5 bg-dss-canvas border border-dss-border rounded-dss-sm text-lg text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30 text-center font-medium" />
              </div>
              {goals.daily[goalRep.id] > 0 && <p className="text-xs text-dss-muted text-center">Current goal: {goals.daily[goalRep.id]}/day</p>}
            </div>
            <div className="flex items-center gap-3 px-5 py-4 border-t border-dss-border">
              <button onClick={() => setGoalRep(null)} className="flex-1 px-4 py-2 bg-dss-canvas hover:bg-dss-accent-soft text-dss-ink/80 rounded-dss-sm text-sm transition">Cancel</button>
              <button onClick={handleSaveGoal} disabled={savingGoal}
                className="flex-1 px-4 py-2 bg-dss-navy-soft hover:bg-dss-navy disabled:bg-dss-canvas text-white rounded-dss-sm text-sm font-medium transition">
                {savingGoal ? 'Saving…' : 'Save goal'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}