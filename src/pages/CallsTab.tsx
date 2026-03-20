import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronRight, ArrowUpDown, MessageSquare, Eye, EyeOff, ChevronLeft, ChevronRight as ChevronRightIcon, Target } from 'lucide-react';

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

interface CallNote {
  id: string;
  callId: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

interface CallsTabProps {
  currentUserId: string;
  currentUserRole: 'admin' | 'rep';
  calls: Call[];
  setCalls: React.Dispatch<React.SetStateAction<Call[]>>;
  notes: CallNote[];
  setNotes: React.Dispatch<React.SetStateAction<CallNote[]>>;
  dailyGoal: number;
}

type SortField = 'applicationId' | 'dealerName' | 'state' | 'submittedDate' | 'fuStatus' | 'buyerFinal' | 'statusLast' | null;
type SortOrder = 'asc' | 'desc' | null;

export default function CallsTab({ currentUserId, currentUserRole, calls, setCalls, notes, setNotes, dailyGoal }: CallsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFuStatus, setFilterFuStatus] = useState<string>('');
  const [filterState, setFilterState] = useState<string>('');
  const [filterStatusLast, setFilterStatusLast] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newNoteText, setNewNoteText] = useState<{ [callId: string]: string }>({});
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Rule 1: Auto-revert "Accepted" deals after 7 days
  useEffect(() => {
    const checkAndRevertDeals = () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      setCalls((prevCalls) =>
        prevCalls.map((call) => {
          // Only revert if:
          // 1. Still "Accepted"
          // 2. Still "Deal" (not manually changed by rep)
          // 3. dealDate is older than 7 days
          if (
            call.statusLast === 'Accepted' &&
            call.fuStatus === 'Deal' &&
            call.dealDate &&
            call.dealDate < sevenDaysAgo
          ) {
            return {
              ...call,
              fuStatus: 'Pending',
              dealDate: undefined,
            };
          }
          return call;
        })
      );
    };

    // Check every minute
    const interval = setInterval(checkAndRevertDeals, 60000);
    checkAndRevertDeals(); // Run immediately on mount

    return () => clearInterval(interval);
  }, [setCalls]);

  // Rule 3: Auto-upgrade to "Confirmed Deal"
  useEffect(() => {
    setCalls((prevCalls) =>
      prevCalls.map((call) => {
        // If FU Status is "Deal" and Status Last becomes funded/document received/funding pending
        const confirmedStatuses = ['Document Received', 'Funded', 'Funding Pending'];
        if (
          call.fuStatus === 'Deal' &&
          confirmedStatuses.includes(call.statusLast)
        ) {
          return {
            ...call,
            fuStatus: 'Confirmed Deal',
          };
        }
        return call;
      })
    );
  }, [calls, setCalls]);

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else if (sortOrder === 'desc') {
        setSortField(null);
        setSortOrder(null);
      }
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Get color for Status Last badge (Rule 2)
  const getStatusLastColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'approved':
      case 'approval':
        return 'bg-green-600 text-white';
      case 'counter':
        return 'bg-yellow-500 text-gray-900';
      case 'denial':
      case 'declined':
        return 'bg-red-600 text-white';
      case 'accepted':
        return 'bg-blue-600 text-white';
      case 'pending approval':
        return 'bg-orange-500 text-white';
      case 'document received':
        return 'bg-purple-600 text-white';
      case 'funded':
      case 'funding pending':
        return 'bg-emerald-600 text-white';
      default:
        return 'bg-gray-600 text-gray-200';
    }
  };

  // Get unique status last values
  const uniqueStatusLast = Array.from(new Set(calls.map((c) => c.statusLast).filter(Boolean))).sort();

  // Toggle status last filter
  const toggleStatusLastFilter = (status: string) => {
    const newFilter = new Set(filterStatusLast);
    if (newFilter.has(status)) {
      newFilter.delete(status);
    } else {
      newFilter.add(status);
    }
    setFilterStatusLast(newFilter);
  };

  const filteredCalls = calls.filter((call) => {
    if (currentUserRole === 'rep' && call.assignedTo !== currentUserId) {
      return false;
    }

    const matchesSearch =
      !searchQuery ||
      call.applicationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.dealerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.state.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFuStatus = !filterFuStatus || call.fuStatus === filterFuStatus;
    const matchesState = !filterState || call.state === filterState;
    const matchesStatusLast = filterStatusLast.size === 0 || filterStatusLast.has(call.statusLast);

    // Date range filter
    const callDate = new Date(call.submittedDate);
    const matchesDateFrom = !dateFrom || callDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || callDate <= new Date(dateTo);

    const isCompleted = call.fuStatus === 'No Deal' || call.fuStatus === 'Closed' || call.fuStatus === 'Duplicates';
    const isExplicitlyFiltering = filterFuStatus === 'No Deal' || filterFuStatus === 'Closed' || filterFuStatus === 'Duplicates';

    if (!showCompleted && isCompleted && !isExplicitlyFiltering) {
      return false;
    }

    return matchesSearch && matchesFuStatus && matchesState && matchesStatusLast && matchesDateFrom && matchesDateTo;
  });

  const sortedCalls = [...filteredCalls].sort((a, b) => {
    if (!sortField || !sortOrder) return 0;

    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    if (sortField === 'submittedDate') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }

    if (sortField === 'buyerFinal') {
      aVal = parseFloat(aVal.replace(/[^0-9.-]+/g, '')) || 0;
      bVal = parseFloat(bVal.replace(/[^0-9.-]+/g, '')) || 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(sortedCalls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCalls = sortedCalls.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterFuStatus, filterState, filterStatusLast, dateFrom, dateTo, showCompleted]);

  // Get unique states for filter
  const uniqueStates = Array.from(new Set(calls.map((c) => c.state))).sort();

  const dealsToday = filteredCalls.filter((c) => c.fuStatus === 'Deal' && isToday(c.updatedAt)).length;
  const goalProgress = dailyGoal > 0 ? Math.min((dealsToday / dailyGoal) * 100, 100) : 0;

  const kpis = {
    total: filteredCalls.length,
    deal: dealsToday,
    pending: filteredCalls.filter((c) => c.fuStatus === 'Pending').length,
    noAnswer: filteredCalls.filter((c) => c.fuStatus === 'No Answer').length,
    dailyGoal: dailyGoal,
    goalProgress: goalProgress,
  };

  const completedCount = calls.filter((c) => {
    const isCompleted = c.fuStatus === 'No Deal' || c.fuStatus === 'Closed' || c.fuStatus === 'Duplicates';
    if (currentUserRole === 'rep' && c.assignedTo !== currentUserId) {
      return false;
    }
    return isCompleted;
  }).length;

  const handleStatusChange = (callId: string, newStatus: Call['fuStatus']) => {
    setCalls((prevCalls) =>
      prevCalls.map((call) => {
        if (call.id === callId) {
          // If changing to "Deal", set dealDate
          const dealDate = newStatus === 'Deal' ? new Date() : call.dealDate;
          return { ...call, fuStatus: newStatus, updatedAt: new Date(), dealDate };
        }
        return call;
      })
    );
  };

  const toggleRowExpansion = (callId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(callId)) {
      newExpanded.delete(callId);
    } else {
      newExpanded.add(callId);
    }
    setExpandedRows(newExpanded);
  };

  const handleAddNote = (callId: string) => {
    const noteText = newNoteText[callId]?.trim();
    if (!noteText) return;

    const newNote: CallNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callId,
      noteText,
      createdBy: currentUserId,
      createdByName: currentUserRole === 'admin' ? 'Admin User' : 'Rep User',
      createdAt: new Date(),
    };

    setNotes((prevNotes) => [...prevNotes, newNote]);
    setNewNoteText((prev) => ({ ...prev, [callId]: '' }));
  };

  const getCallNotes = (callId: string) => {
    return notes.filter((note) => note.callId === callId);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Calls</h2>
        <p className="text-gray-400 mt-1">
          {currentUserRole === 'admin' ? 'View and manage all calls' : 'View and manage your assigned calls'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Total Calls</p>
          <p className="text-3xl font-bold text-blue-400 mt-2">{kpis.total}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Deals (Today)</p>
          <p className="text-3xl font-bold text-green-400 mt-2">{kpis.deal}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-400">Daily Goal</p>
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-400">{kpis.deal} / {kpis.dailyGoal}</p>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all"
              style={{ width: `${kpis.goalProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{kpis.goalProgress.toFixed(0)}% complete</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">Pending</p>
          <p className="text-3xl font-bold text-yellow-400 mt-2">{kpis.pending}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <p className="text-sm text-gray-400">No Answer</p>
          <p className="text-3xl font-bold text-orange-400 mt-2">{kpis.noAnswer}</p>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
        <div className="flex gap-4 flex-wrap items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by App ID, Dealer, or State..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400"
              />
            </div>
          </div>

          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
          >
            <option value="">All States</option>
            {uniqueStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>

          <select
            value={filterFuStatus}
            onChange={(e) => setFilterFuStatus(e.target.value)}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
          >
            <option value="">All Statuses</option>
            <option value="Deal">Deal</option>
            <option value="Confirmed Deal">Confirmed Deal</option>
            <option value="No Deal">No Deal</option>
            <option value="Pending">Pending</option>
            <option value="No Answer">No Answer</option>
            <option value="Closed">Closed</option>
            <option value="Duplicates">Duplicates</option>
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
              placeholder="From"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
              placeholder="To"
            />
          </div>

          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-gray-100 transition"
          >
            {showCompleted ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="text-sm">
              {showCompleted ? 'Hiding' : `Hidden (${completedCount})`}
            </span>
          </button>
        </div>
      </div>

      {/* Status Last Multi-Select Filter */}
      <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-semibold text-gray-300">Application Status:</p>
          {filterStatusLast.size > 0 && (
            <button
              onClick={() => setFilterStatusLast(new Set())}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {uniqueStatusLast.map((status) => {
            const isSelected = filterStatusLast.has(status);
            return (
              <button
                key={status}
                onClick={() => toggleStatusLastFilter(status)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  isSelected
                    ? getStatusLastColor(status)
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        {/* Pagination Info */}
        <div className="px-6 py-3 border-b border-gray-700 flex items-center justify-between bg-gray-750">
          <p className="text-sm text-gray-400">
            Showing {startIndex + 1} - {Math.min(endIndex, sortedCalls.length)} of {sortedCalls.length} calls
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded text-sm transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded text-sm transition"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 w-12"></th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('applicationId')}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    App ID
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('dealerName')}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    Dealer Name
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('state')}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    State
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('buyerFinal')}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    Amount
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('submittedDate')}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    Date
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('statusLast')}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    Status Last
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('fuStatus')}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
                  >
                    FU Status
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {paginatedCalls.map((call) => {
                const callNotes = getCallNotes(call.id);
                const isExpanded = expandedRows.has(call.id);

                return (
                  <>
                    <tr
                      key={call.id}
                      className="hover:bg-gray-750 cursor-pointer"
                      onClick={() => toggleRowExpansion(call.id)}
                    >
                      <td className="px-4 py-4">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </td>
                      <td
                        className="px-4 py-4 text-sm font-medium text-blue-400 underline cursor-pointer"
                        title="Click to copy"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(call.applicationId);
                        }}
                      >
                        {call.applicationId}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-200">
                        {call.dealerName}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300">
                        {call.state}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300 font-medium">
                        ${parseFloat(call.buyerFinal.replace(/[^0-9.-]+/g, '') || '0').toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300">
                        {call.submittedDate}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusLastColor(call.statusLast)}`}>
                          {call.statusLast}
                        </span>
                      </td>
                      <td
                        className="px-4 py-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={call.fuStatus || ''}
                          onChange={(e) =>
                            handleStatusChange(call.id, e.target.value as Call['fuStatus'])
                          }
                          className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100"
                        >
                          <option value="">Select...</option>
                          <option value="Deal">Deal</option>
                          <option value="Confirmed Deal">Confirmed Deal</option>
                          <option value="No Deal">No Deal</option>
                          <option value="Pending">Pending</option>
                          <option value="No Answer">No Answer</option>
                          <option value="Closed">Closed</option>
                          <option value="Duplicates">Duplicates</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        {callNotes.length > 0 && (
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-blue-400" />
                            <span className="px-2 py-1 bg-blue-900 text-blue-200 rounded-full text-xs font-bold">
                              {callNotes.length}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${call.id}-expanded`}>
                        <td colSpan={9} className="px-4 py-4 bg-gray-750">
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-300 mb-2">
                                Notes ({callNotes.length})
                              </h4>
                              {callNotes.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">
                                  No notes yet. Add one below.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {callNotes.map((note) => (
                                    <div
                                      key={note.id}
                                      className="bg-gray-700 p-3 rounded-lg"
                                    >
                                      <p className="text-sm text-gray-200">
                                        {note.noteText}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-2">
                                        {note.createdByName} •{' '}
                                        {note.createdAt.toLocaleString()}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Add a note..."
                                value={newNoteText[call.id] || ''}
                                onChange={(e) =>
                                  setNewNoteText((prev) => ({
                                    ...prev,
                                    [call.id]: e.target.value,
                                  }))
                                }
                                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleAddNote(call.id);
                                  }
                                }}
                              />
                              <button
                                onClick={() => handleAddNote(call.id)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                              >
                                Save Note
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination */}
        <div className="px-6 py-3 border-t border-gray-700 flex items-center justify-between bg-gray-750">
          <p className="text-sm text-gray-400">
            Showing {startIndex + 1} - {Math.min(endIndex, sortedCalls.length)} of {sortedCalls.length} calls
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded text-sm transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded text-sm transition"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}