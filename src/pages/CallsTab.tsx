import { useState } from 'react';
import { Search, Eye, Phone, TrendingUp, AlertCircle, CheckCircle, ArrowUpDown } from 'lucide-react';
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
  fuStatus?: 'Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates';
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
  const [selectedCallForNotes, setSelectedCallForNotes] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<{ [key: string]: string }>({});
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);

  // Filter and sort calls
  let filteredCalls = calls.filter((call) => {
    if (currentUserRole === 'rep' && call.assignedTo !== currentUserId) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (!call.dealerName.toLowerCase().includes(search) && !call.applicationId.toLowerCase().includes(search)) return false;
    }
    if (filterState && call.state !== filterState) return false;
    if (filterFuStatus && call.fuStatus !== filterFuStatus) return false;
    if (filterFiType && call.fiType !== filterFiType) return false;
    return true;
  });

  // Apply sorting
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

      // String comparison
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
  }

  const kpis = {
    total: filteredCalls.length,
    deal: filteredCalls.filter((c) => c.fuStatus === 'Deal').length,
    pending: filteredCalls.filter((c) => c.fuStatus === 'Pending').length,
    noAnswer: filteredCalls.filter((c) => c.fuStatus === 'No Answer').length,
  };

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
      <div>
        <h2 className="text-2xl font-bold text-gray-100">My Calls</h2>
        <p className="text-gray-400 mt-1">Follow up on assigned applications</p>
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
                <SortableHeader field="applicationId">App ID</SortableHeader>
                <SortableHeader field="dealerName">Dealer Name</SortableHeader>
                <SortableHeader field="state">State</SortableHeader>
                <SortableHeader field="buyerFinal">Amount</SortableHeader>
                <SortableHeader field="statusLast">Status</SortableHeader>
                <SortableHeader field="fiType">FI Type</SortableHeader>
                <SortableHeader field="fuStatus">FU Status</SortableHeader>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredCalls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-750">
                  <td className="px-4 py-4 text-sm font-medium text-gray-100">{call.applicationId}</td>
                  <td className="px-4 py-4 text-sm text-gray-200">{call.dealerName}</td>
                  <td className="px-4 py-4 text-sm text-gray-300">{call.state}</td>
                  <td className="px-4 py-4 text-sm text-gray-200">${call.buyerFinal.toLocaleString()}</td>
                  <td className="px-4 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${call.statusLast === 'Approved' ? 'bg-green-900 text-green-200' : call.statusLast === 'Pending' ? 'bg-yellow-900 text-yellow-200' : 'bg-red-900 text-red-200'}`}>{call.statusLast}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-300">{call.fiType || '-'}</td>
                  <td className="px-4 py-4">
                    <select value={call.fuStatus || ''} onChange={(e) => handleFuStatusChange(call.id, e.target.value)} className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm">
                      <option value="">Select...</option>
                      <option value="Deal">Deal</option>
                      <option value="No Deal">No Deal</option>
                      <option value="Pending">Pending</option>
                      <option value="No Answer">No Answer</option>
                      <option value="Closed">Closed</option>
                      <option value="Duplicates">Duplicates</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <input type="text" placeholder="Add note..." value={noteInputs[call.id] || ''} onChange={(e) => setNoteInputs({ ...noteInputs, [call.id]: e.target.value })} className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm placeholder-gray-400" />
                      <button onClick={() => handleSaveNote(call.id)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition">Save</button>
                      <button onClick={() => setSelectedCallForNotes(call.id)} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm transition flex items-center gap-1"><Eye className="w-4 h-4" />View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCalls.length === 0 && (<div className="text-center py-12 text-gray-400">No calls found matching your filters.</div>)}
      </div>

      {selectedCallForNotes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-100">Notes for {calls.find((c) => c.id === selectedCallForNotes)?.applicationId}</h3>
              <button onClick={() => setSelectedCallForNotes(null)} className="text-gray-400 hover:text-gray-200">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              {getNotesForCall(selectedCallForNotes).length === 0 ? (
                <p className="text-gray-400 text-center py-8">No notes yet for this call.</p>
              ) : (
                <div className="space-y-4">
                  {getNotesForCall(selectedCallForNotes).map((note) => (
                    <div key={note.id} className="bg-gray-700 p-4 rounded-lg">
                      <p className="text-gray-200">{note.noteText}</p>
                      <div className="mt-2 text-sm text-gray-400"><span>{note.createdByName}</span><span className="mx-2">•</span><span>{note.createdAt.toLocaleDateString()} at {note.createdAt.toLocaleTimeString()}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}