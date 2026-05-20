import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { StickyNote, Sparkles } from 'lucide-react';

interface CombinedNote {
  id: string;
  source: 'calls' | 'daily_deals';
  appId: string;
  dealerName: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
}

interface NotesTabProps {
  currentUser: User;
  users: User[];
}

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (from: string, to: string) => {
  const todayStr = getTodayString();
  if (from === to) {
    if (from === todayStr) return 'Today';
    const [y, m, d] = from.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  const fDate = new Date(from + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tDate = new Date(to + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fDate} — ${tDate}`;
};

export default function NotesTab({ currentUser, users }: NotesTabProps) {
  const today = getTodayString();
  const isAdminOrManager = currentUser.role === 'admin' || currentUser.role === 'manager';

  const [notes, setNotes] = useState<CombinedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState('');
  const [filterSource, setFilterSource] = useState('');

  useEffect(() => { fetchNotes(); }, [dateFrom, dateTo, selectedRepId]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const fromTs = `${dateFrom}T00:00:00`;
      const toTs = `${dateTo}T23:59:59.999`;

      // Call notes
      let callQuery = supabase
        .from('call_notes').select('*')
        .gte('created_at', fromTs)
        .lte('created_at', toTs)
        .order('created_at', { ascending: false });

      if (!isAdminOrManager) {
        callQuery = callQuery.eq('created_by', currentUser.id);
      } else if (selectedRepId) {
        callQuery = callQuery.eq('created_by', selectedRepId);
      }

      const { data: callNotes } = await callQuery;

      // Daily deal notes (joined with parent deal)
      let dealQuery = supabase
        .from('daily_deal_notes')
        .select(`id, note_text, created_by, created_by_name, created_at, daily_deals (app_id, dealer_name)`)
        .gte('created_at', fromTs)
        .lte('created_at', toTs)
        .order('created_at', { ascending: false });

      if (!isAdminOrManager) {
        dealQuery = dealQuery.eq('created_by', currentUser.id);
      } else if (selectedRepId) {
        dealQuery = dealQuery.eq('created_by', selectedRepId);
      }

      const { data: dealNotes } = await dealQuery;

      const combined: CombinedNote[] = [
        ...(callNotes || []).map((n: any) => ({
          id: n.id,
          source: 'calls' as const,
          appId: n.application_id,
          dealerName: n.dealer_name,
          noteText: n.note_text,
          createdBy: n.created_by,
          createdByName: n.created_by_name,
          createdAt: n.created_at,
        })),
        ...(dealNotes || []).map((n: any) => ({
          id: n.id,
          source: 'daily_deals' as const,
          appId: n.daily_deals?.app_id || '',
          dealerName: n.daily_deals?.dealer_name || '',
          noteText: n.note_text,
          createdBy: n.created_by,
          createdByName: n.created_by_name,
          createdAt: n.created_at,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setNotes(combined);
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredNotes = filterSource
    ? notes.filter(n => n.source === filterSource)
    : notes;

  const repOptions = users.filter(u => u.role === 'rep' || u.role === 'buying_assistant');
  const callsCount = notes.filter(n => n.source === 'calls').length;
  const dealCount = notes.filter(n => n.source === 'daily_deals').length;
  const activeReps = new Set(notes.map(n => n.createdByName)).size;

  return (
    <div className="space-y-5">

      {/* HEADER */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Notes</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {isAdminOrManager ? 'All rep notes — calls & daily deals' : 'Your notes — calls & daily deals'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Rep filter — admin/manager only */}
          {isAdminOrManager && (
            <select
              value={selectedRepId}
              onChange={e => setSelectedRepId(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Reps</option>
              {repOptions.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}

          {/* Source filter */}
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Sources</option>
            <option value="calls">Calls</option>
            <option value="daily_deals">Daily Deals</option>
          </select>

          {/* Date picker — subtle */}
          <div className="flex items-center border border-gray-700 rounded-lg overflow-hidden bg-gray-800">
            <div className="px-2.5 py-2 border-r border-gray-700">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={e => {
                setDateFrom(e.target.value);
                if (!isAdminOrManager) setDateTo(e.target.value);
              }}
              className="px-2 py-2 bg-gray-800 text-xs text-gray-300 focus:outline-none w-[120px]"
            />
            {isAdminOrManager && (
              <>
                <span className="px-1 text-xs text-gray-500">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-2 py-2 bg-gray-800 text-xs text-gray-300 focus:outline-none w-[120px]"
                />
              </>
            )}
          </div>

          {/* AI Insights — coming soon */}
          {isAdminOrManager && (
            <button
              disabled
              title="Coming soon"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-500 cursor-not-allowed opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              AI Insights
              <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">soon</span>
            </button>
          )}
        </div>
      </div>

      {/* SUMMARY BAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-200">{formatDateLabel(dateFrom, dateTo)}</span>
          <span className="text-sm text-gray-400">
            {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
          </span>
          {isAdminOrManager && activeReps > 0 && (
            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-400 rounded border border-gray-600">
              {activeReps} rep{activeReps !== 1 ? 's' : ''} active
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {callsCount > 0 && (
            <span className="text-xs px-2.5 py-1 bg-blue-900 bg-opacity-40 text-blue-300 rounded-full border border-blue-800">
              {callsCount} from Calls
            </span>
          )}
          {dealCount > 0 && (
            <span className="text-xs px-2.5 py-1 bg-green-900 bg-opacity-40 text-green-300 rounded-full border border-green-800">
              {dealCount} from Daily Deals
            </span>
          )}
        </div>
      </div>

      {/* NOTES LIST */}
      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
      ) : filteredNotes.length === 0 ? (
        <div className="py-14 text-center">
          <StickyNote className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-base font-medium text-gray-400">No notes found</p>
          <p className="text-sm text-gray-500 mt-1">
            {dateFrom === today
              ? 'No notes recorded today yet.'
              : 'No notes for the selected date range.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNotes.map(note => (
            <div
              key={`${note.source}-${note.id}`}
              className="bg-gray-800 border border-gray-700 rounded-lg px-5 py-4 hover:border-gray-600 transition"
            >
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-blue-400">{note.appId || '—'}</span>
                  <span className="text-sm text-gray-200">{note.dealerName || '—'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    note.source === 'calls'
                      ? 'bg-blue-900 bg-opacity-40 text-blue-300 border-blue-800'
                      : 'bg-green-900 bg-opacity-40 text-green-300 border-green-800'
                  }`}>
                    {note.source === 'calls' ? 'Calls' : 'Daily Deals'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {isAdminOrManager && (
                    <span className="text-gray-400 font-medium">{note.createdByName}</span>
                  )}
                  <span>
                    {new Date(note.createdAt).toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit', hour12: true,
                    })}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-200 leading-relaxed">{note.noteText}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}