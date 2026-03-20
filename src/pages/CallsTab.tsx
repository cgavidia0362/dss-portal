import { useState } from 'react';
import { Search, Phone, TrendingUp, AlertCircle, CheckCircle, ArrowUpDown, ChevronDown, ChevronRight, MessageSquare, EyeOff, Eye } from 'lucide-react';
import { mockCalls, mockNotes } from '../lib/mockData';

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
}

type SortField = 'applicationId' | 'dealerName' | 'state' | 'buyerFinal' | 'statusLast' | 'fiType' | 'fuStatus' | 'submittedDate';
type SortOrder = 'asc' | 'desc' | null;

export default function CallsTab({ currentUserId, currentUserRole }: CallsTabProps) {
  const [calls, setCalls] = useState<Call[]>(mockCalls);
  const [notes, setNotes] = useState<CallNote[]>(mockNotes);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterFuStatus, setFilterFuStatus] = useState('');
  const [filterFiType, setFilterFiType] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [noteInputs, setNoteInputs] = useState<{ [key: string]: string }>({});
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  let filteredCalls = calls.filter((call) => {
    if (currentUserRole === 'rep' && call.assignedTo !== currentUserId) return false;
    
    // Hide completed calls unless toggle is on OR user is actively filtering for them
    const isCompleted = call.fuStatus === 'No Deal' || call.fuStatus === 'Closed' || call.fuStatus === 'Duplicates';
    const isExplicitlyFiltering = filterFuStatus === 'No Deal' || filterFuStatus === 'Closed' || filterFuStatus === 'Duplicates';
    
    if (!showCompleted && isCompleted && !isExplicitlyFiltering) {
      return false;
    }
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (!call.dealerName.toLowerCase().includes(search) && !call.applicationId.toLowerCase().includes(search)) return false;
    }
    if (filterState && call.state !== filterState) return false;
    if (filterFuStatus && call.fuStatus !== filterFuStatus) return false;
    if (filterFiType && call.fiType !== filterFiType) return false;
    return true;
  });

  if (sortField && sortOrder) {
    filteredCalls = [...filteredCalls].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'buyerFinal') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      if (sortField === 'submittedDate') {
        return sortOrder === 'asc' 
          ? new Date(aVal).getTime() - new Date(bVal).getTime()
          : new Date(bVal).getTime() - new Date(aVal).getTime();
      }

      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
  }

// Helper function to check if date is today
const isToday = (date: Date): boolean => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const kpis = {
  total: filteredCalls.length,
  deal: filteredCalls.filter((c) => c.fuStatus === 'Deal' && isToday(c.updatedAt)).length,
  pending: filteredCalls.filter((c) => c.fuStatus === 'Pending').length,
  noAnswer: filteredCalls.filter((c) => c.fuStatus === 'No Answer').length,
};

  // Count hidden completed calls
  const completedCount = calls.filter((call) => {
    const isAssigned = currentUserRole === 'admin' || call.assignedTo === currentUserId;
    return isAssigned && (call.fuStatus === 'No Deal' || call.fuStatus === 'Closed' || call.fuStatus === 'Duplicates');
  }).length;

  const uniqueStates = Array.from(new Set(calls.map((c) => c.state))).sort();

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

  const toggleRow = (callId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(callId)) {
      newExpanded.delete(callId);
    } else {
      newExpanded.add(callId);
    }
    setExpandedRows(newExpanded);
  };

  const handleFuStatusChange = (callId: string, newStatus: string) => {
    setCalls((prevCalls) =>
      prevCalls.map((call) =>
        call.id === callId ? { ...call, fuStatus: newStatus as Call['fuStatus'], updatedAt: new Date() } : call
      )
    );
  };

  const handleSaveNote = (callId: string) => {
    const noteText = noteInputs[callId];
    if (!noteText || !noteText.trim()) return;
    const newNote: CallNote = {
      id: `n${Date.now()}`,
      callId,
      noteText: noteText.trim(),
      createdBy: currentUserId,
      createdByName: currentUserRole === 'admin' ? 'Admin User' : 'Sales Rep',
      createdAt: new Date(),
    };
    setNotes((prev) => [...prev, newNote]);
    setNoteInputs((prev) => ({ ...prev, [callId]: '' }));
  };

  const getNotesForCall = (callId: string) => {
    return notes.filter((note) => note.callId === callId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
      <button onClick={() => handleSort(field)} className="flex items-center gap-2 hover:text-gray-100">
        {children}
        <ArrowUpDown className={`w-4 h-4 ${sortField === field ? 'text-blue-400' : 'text-gray-500'}`} />
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">My Calls</h2>
          <p className="text-gray-400 mt-1">Follow up on assigned applications</p>
        </div>
        
        {/* Toggle Completed Calls Button */}
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            showCompleted
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {showCompleted ? (
            <>
              <Eye className="w-4 h-4" />
              Hide Completed ({completedCount})
            </>
          ) : (
            <>
              <EyeOff className="w-4 h-4" />
              Show Completed ({completedCount})
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Calls</p>
              <p className="text-2xl font-bold text-gray-100 mt-1">{kpis.total}</p>
            </div>
            <Phone className="w-8 h-8 text-blue-400" />
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Deals</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{kpis.deal}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Pending</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">{kpis.pending}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-yellow-400" />
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">No Answer</p>
              <p className="text-2xl font-bold text-gray-400 mt-1">{kpis.noAnswer}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input type="text" placeholder="Search by dealer or app ID..." className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <select className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100" value={filterState} onChange={(e) => setFilterState(e.target.value)}>
            <option value="">All States</option>
            {uniqueStates.map((state) => (<option key={state} value={state}>{state}</option>))}
          </select>
          <select value={filterFiType} onChange={(e) => setFilterFiType(e.target.value)} className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100">
            <option value="">All FI Types</option>
            <option value="Independent">Independent</option>
            <option value="Franchise">Franchise</option>
          </select>
          <select value={filterFuStatus} onChange={(e) => setFilterFuStatus(e.target.value)} className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100">
            <option value="">All FU Status</option>
            <option value="Deal">Deal</option>
            <option value="Confirmed Deal">Confirmed Deal</option>
            <option value="No Deal">No Deal</option>
            <option value="Pending">Pending</option>
            <option value="No Answer">No Answer</option>
            <option value="Closed">Closed</option>
            <option value="Duplicates">Duplicates</option>
          </select>
          <button onClick={() => { setSearchTerm(''); setFilterState(''); setFilterFuStatus(''); setFilterFiType(''); setSortField(null); setSortOrder(null); }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition">Clear All</button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-4 py-3 w-10"></th>
                <SortableHeader field="applicationId">App ID</SortableHeader>
                <SortableHeader field="dealerName">Dealer Name</SortableHeader>
                <SortableHeader field="state">State</SortableHeader>
                <SortableHeader field="submittedDate">Date</SortableHeader>
                <SortableHeader field="buyerFinal">Amount</SortableHeader>
                <SortableHeader field="statusLast">Status</SortableHeader>
                <SortableHeader field="fiType">FI Type</SortableHeader>
                <SortableHeader field="fuStatus">FU Status</SortableHeader>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredCalls.map((call) => {
                const callNotes = getNotesForCall(call.id);
                const isExpanded = expandedRows.has(call.id);
                return (
                  <>
                    <tr key={call.id} className="hover:bg-gray-750 cursor-pointer" onClick={() => toggleRow(call.id)}>
                      <td className="px-4 py-4">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(call.applicationId);
                          }}
                          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                          title="Click to copy"
                        >
                          {call.applicationId}
                        </button>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-200">{call.dealerName}</td>
                      <td className="px-4 py-4 text-sm text-gray-300">{call.state}</td>
                      <td className="px-4 py-4 text-sm text-gray-300">{call.submittedDate}</td>
                      <td className="px-4 py-4 text-sm text-gray-200">${call.buyerFinal.toLocaleString()}</td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${call.statusLast === 'Approved' ? 'bg-green-900 text-green-200' : call.statusLast === 'Pending' ? 'bg-yellow-900 text-yellow-200' : 'bg-red-900 text-red-200'}`}>{call.statusLast}</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300">{call.fiType || '-'}</td>
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <select value={call.fuStatus || ''} onChange={(e) => handleFuStatusChange(call.id, e.target.value)} className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm">
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
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-blue-400" />
                          <span className="px-2 py-1 bg-blue-900 text-blue-200 rounded-full text-xs font-medium">{callNotes.length}</span>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="px-4 py-4 bg-gray-750">
                          <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-gray-300 mb-3">Notes for {call.applicationId}</h4>
                            
                            <div className="flex gap-2 mb-4" onClick={(e) => e.stopPropagation()}>
                              <input type="text" placeholder="Add a new note..." value={noteInputs[call.id] || ''} onChange={(e) => setNoteInputs({ ...noteInputs, [call.id]: e.target.value })} className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm placeholder-gray-400" />
                              <button onClick={() => handleSaveNote(call.id)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition">Save Note</button>
                            </div>

                            {callNotes.length === 0 ? (
                              <p className="text-gray-400 text-sm italic">No notes yet for this call.</p>
                            ) : (
                              <div className="space-y-3">
                                {callNotes.map((note) => (
                                  <div key={note.id} className="bg-gray-700 p-3 rounded-lg border border-gray-600">
                                    <p className="text-gray-200 text-sm">{note.noteText}</p>
                                    <div className="mt-2 text-xs text-gray-400">
                                      <span className="font-medium">{note.createdByName}</span>
                                      <span className="mx-2">•</span>
                                      <span>{note.createdAt.toLocaleDateString()} at {note.createdAt.toLocaleTimeString()}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
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
        {filteredCalls.length === 0 && (<div className="text-center py-12 text-gray-400">No calls found matching your filters.</div>)}
      </div>
    </div>
  );
}