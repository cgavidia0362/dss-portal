import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { StickyNote, Sparkles, ChevronLeft, ChevronRight, Save, Bookmark, Trash2, X } from 'lucide-react';

interface CombinedNote {
  id: string;
  source: 'calls' | 'daily_deals';
  appId: string;
  dealerName: string;
  customerName: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  fuStatus?: string;
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

interface LossInsights {
  lossSummary: string;
  whoLosingTo: {
    competitor: string;
    mentionCount: number;
    howTheyBeatUs: string;
  }[];
  overallSummary: string;
  noteCountAnalyzed: number;
  dateRangeLabel: string;
}

interface SavedInsight {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  dateRangeLabel: string;
  selectedRepId: string | null;
  filterSource: string | null;
  noteCount: number;
  insights: LossInsights;
  createdByName: string;
  createdAt: string;
}

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const NOTES_PER_PAGE = 10;
const NO_DEAL_STATUS = 'No Deal';

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
  const [currentPage, setCurrentPage] = useState(1);
  const [insights, setInsights] = useState<LossInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [savedInsights, setSavedInsights] = useState<SavedInsight[]>([]);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [viewingSavedId, setViewingSavedId] = useState<string | null>(null);
  const skipClearOnFilterRef = useRef(false);

  useEffect(() => { fetchNotes(); }, [dateFrom, dateTo, selectedRepId]);

  useEffect(() => { setCurrentPage(1); }, [dateFrom, dateTo, selectedRepId, filterSource]);

  useEffect(() => {
    if (skipClearOnFilterRef.current) {
      skipClearOnFilterRef.current = false;
      return;
    }
    setInsights(null);
    setInsightsError('');
    setViewingSavedId(null);
    setSaveMessage('');
  }, [dateFrom, dateTo, selectedRepId, filterSource]);

  useEffect(() => {
    if (isAdminOrManager) fetchSavedInsights();
  }, [isAdminOrManager]);

  const fetchSavedInsights = async () => {
    const { data, error } = await supabase
      .from('notes_insight_saves')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching saved insights:', error);
      return;
    }
    setSavedInsights((data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      dateFrom: row.date_from,
      dateTo: row.date_to,
      dateRangeLabel: row.date_range_label || '',
      selectedRepId: row.selected_rep_id,
      filterSource: row.filter_source,
      noteCount: row.note_count || 0,
      insights: row.insights,
      createdByName: row.created_by_name || '',
      createdAt: row.created_at,
    })));
  };

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const fromTs = `${dateFrom}T00:00:00`;
      const toTs = `${dateTo}T23:59:59.999`;

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

      const appIds = [...new Set((callNotes || []).map((n: { application_id: string }) => n.application_id).filter(Boolean))];
      const callMetaMap: Record<string, { fuStatus: string; customerName: string }> = {};
      if (appIds.length > 0) {
        const { data: callsData } = await supabase
          .from('calls')
          .select('application_id, fu_status, customer_full_name')
          .in('application_id', appIds);
        (callsData || []).forEach((c: { application_id: string; fu_status?: string; customer_full_name?: string }) => {
          if (c.application_id) {
            callMetaMap[c.application_id] = {
              fuStatus: c.fu_status || '',
              customerName: c.customer_full_name || '',
            };
          }
        });
      }

      let dealQuery = supabase
        .from('daily_deal_notes')
        .select(`id, note_text, created_by, created_by_name, created_at, daily_deals (app_id, dealer_name, customer_name, fu_status)`)
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
          customerName: callMetaMap[n.application_id]?.customerName || '',
          noteText: n.note_text,
          createdBy: n.created_by,
          createdByName: n.created_by_name,
          createdAt: n.created_at,
          fuStatus: callMetaMap[n.application_id]?.fuStatus || undefined,
        })),
        ...(dealNotes || []).map((n: any) => ({
          id: n.id,
          source: 'daily_deals' as const,
          appId: n.daily_deals?.app_id || '',
          dealerName: n.daily_deals?.dealer_name || '',
          customerName: n.daily_deals?.customer_name || '',
          noteText: n.note_text,
          createdBy: n.created_by,
          createdByName: n.created_by_name,
          createdAt: n.created_at,
          fuStatus: n.daily_deals?.fu_status || undefined,
        })),
      ]
        .filter(n => n.fuStatus === NO_DEAL_STATUS)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setNotes(combined);
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateInsights = async () => {
    if (!isAdminOrManager) return;
    setInsightsLoading(true);
    setInsightsError('');
    setInsights(null);

    try {
      const notesForAi = filteredNotes.filter(n => n.noteText.trim().length > 0);
      if (notesForAi.length === 0) {
        setInsightsError('No No Deal notes found in this date range to analyze.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('notes-insights', {
        body: {
          dateRangeLabel: formatDateLabel(dateFrom, dateTo),
          notes: notesForAi.map(n => ({
            appId: n.appId,
            dealerName: n.dealerName,
            customerName: n.customerName,
            noteText: n.noteText,
            createdByName: n.createdByName,
            createdAt: n.createdAt,
            source: n.source,
          })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.lossSummary) throw new Error('Unexpected AI response');

      setInsights(data as LossInsights);
      setViewingSavedId(null);
      setSaveMessage('');
    } catch (err: any) {
      console.error('Insights error:', err);
      setInsightsError(err?.message || 'Failed to generate insights. Please try again.');
    } finally {
      setInsightsLoading(false);
    }
  };

  const openSaveModal = () => {
    if (!insights) return;
    const defaultName = `No Deal insights — ${formatDateLabel(dateFrom, dateTo)}`;
    setSaveName(defaultName);
    setShowSaveModal(true);
  };

  const handleSaveInsights = async () => {
    if (!insights || !saveName.trim()) return;
    setSaveLoading(true);
    setSaveMessage('');
    try {
      const { error } = await supabase.from('notes_insight_saves').insert({
        name: saveName.trim(),
        date_from: dateFrom,
        date_to: dateTo,
        date_range_label: insights.dateRangeLabel || formatDateLabel(dateFrom, dateTo),
        selected_rep_id: selectedRepId || null,
        filter_source: filterSource || null,
        note_count: insights.noteCountAnalyzed || filteredNotes.length,
        insights,
        created_by: currentUser.id,
        created_by_name: currentUser.name,
      });
      if (error) throw error;
      setShowSaveModal(false);
      setSaveMessage('Saved.');
      setTimeout(() => setSaveMessage(''), 3000);
      await fetchSavedInsights();
    } catch (err: any) {
      console.error('Save insights error:', err);
      setShowSaveModal(false);
      setInsightsError(err?.message || 'Failed to save insights.');
    } finally {
      setSaveLoading(false);
    }
  };

  const loadSavedInsight = (saved: SavedInsight) => {
    skipClearOnFilterRef.current = true;
    setDateFrom(saved.dateFrom);
    setDateTo(saved.dateTo);
    setSelectedRepId(saved.selectedRepId || '');
    setFilterSource(saved.filterSource || '');
    setInsights(saved.insights);
    setViewingSavedId(saved.id);
    setInsightsError('');
    setShowSavedPanel(false);
    setSaveMessage('');
  };

  const handleDeleteSaved = async (id: string) => {
    if (!confirm('Delete this saved insight?')) return;
    const { error } = await supabase.from('notes_insight_saves').delete().eq('id', id);
    if (error) {
      setInsightsError(error.message);
      return;
    }
    if (viewingSavedId === id) setViewingSavedId(null);
    await fetchSavedInsights();
  };

  const filteredNotes = notes.filter(n => {
    if (filterSource && n.source !== filterSource) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredNotes.length / NOTES_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedNotes = filteredNotes.slice(
    (safePage - 1) * NOTES_PER_PAGE,
    safePage * NOTES_PER_PAGE,
  );
  const rangeStart = filteredNotes.length === 0 ? 0 : (safePage - 1) * NOTES_PER_PAGE + 1;
  const rangeEnd = Math.min(safePage * NOTES_PER_PAGE, filteredNotes.length);

  const repOptions = users.filter(u => u.role === 'rep' || u.role === 'buying_assistant');
  const callsCount = filteredNotes.filter(n => n.source === 'calls').length;
  const dealCount = filteredNotes.filter(n => n.source === 'daily_deals').length;
  const activeReps = new Set(filteredNotes.map(n => n.createdByName)).size;

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Notes</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {isAdminOrManager
              ? 'No Deal notes only — calls & daily deals'
              : 'Your No Deal notes — calls & daily deals'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Sources</option>
            <option value="calls">Calls</option>
            <option value="daily_deals">Daily Deals</option>
          </select>

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

          {isAdminOrManager && (
            <>
              <button
                onClick={() => setShowSavedPanel(v => !v)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-sm text-gray-300 transition"
              >
                <Bookmark className="w-4 h-4" />
                Saved ({savedInsights.length})
              </button>
              <button
                onClick={generateInsights}
                disabled={insightsLoading || filteredNotes.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-900 bg-opacity-40 hover:bg-opacity-60 border border-purple-700 rounded-lg text-sm text-purple-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                {insightsLoading ? 'Analyzing…' : 'AI Insights'}
              </button>
            </>
          )}
        </div>
      </div>

      {isAdminOrManager && showSavedPanel && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-200">Saved insights</h3>
            <button onClick={() => setShowSavedPanel(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          {savedInsights.length === 0 ? (
            <p className="text-sm text-gray-500">No saved insights yet. Run AI Insights, then click Save.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {savedInsights.map(saved => (
                <div
                  key={saved.id}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                    viewingSavedId === saved.id
                      ? 'border-purple-700 bg-purple-900/20'
                      : 'border-gray-700 bg-gray-900/30'
                  }`}
                >
                  <button
                    onClick={() => loadSavedInsight(saved)}
                    className="text-left flex-1 min-w-0"
                  >
                    <p className="text-sm font-medium text-gray-100 truncate">{saved.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {saved.dateRangeLabel || `${saved.dateFrom} — ${saved.dateTo}`}
                      {' · '}
                      {saved.insights?.whoLosingTo?.length || 0} lender{(saved.insights?.whoLosingTo?.length || 0) !== 1 ? 's' : ''}
                      {' · '}
                      saved by {saved.createdByName || 'Unknown'}
                      {' · '}
                      {new Date(saved.createdAt).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    onClick={() => handleDeleteSaved(saved.id)}
                    className="text-gray-600 hover:text-red-400 transition flex-shrink-0 mt-0.5"
                    title="Delete saved insight"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-200">{formatDateLabel(dateFrom, dateTo)}</span>
          <span className="text-sm text-gray-400">
            {filteredNotes.length} No Deal note{filteredNotes.length !== 1 ? 's' : ''}
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

      {insightsError && (
        <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg px-4 py-3">
          <p className="text-sm text-red-300">{insightsError}</p>
        </div>
      )}

      {saveMessage && (
        <div className="bg-green-900 bg-opacity-30 border border-green-800 rounded-lg px-4 py-3">
          <p className="text-sm text-green-300">{saveMessage}</p>
        </div>
      )}

      {insights && (
        <div className="space-y-3">
          <div className="bg-purple-900 bg-opacity-10 border border-purple-800 rounded-lg p-5">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-purple-300">
                  Loss Analysis — {insights.dateRangeLabel || formatDateLabel(dateFrom, dateTo)}
                </h3>
                {viewingSavedId && (
                  <span className="text-xs px-2 py-0.5 rounded border border-purple-700 text-purple-300 bg-purple-900/40">
                    Saved view
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  Analyzed {insights.noteCountAnalyzed} note{insights.noteCountAnalyzed !== 1 ? 's' : ''}
                  {insights.whoLosingTo?.length > 0 && (
                    <> · {insights.whoLosingTo.length} lender{insights.whoLosingTo.length !== 1 ? 's' : ''}</>
                  )}
                </span>
                {!viewingSavedId && (
                  <button
                    onClick={openSaveModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/50 hover:bg-purple-900/70 border border-purple-700 rounded-lg text-xs text-purple-200 transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{insights.overallSummary}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-red-300 mb-2">Why are we losing — and how are they beating us?</h3>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{insights.lossSummary}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-amber-300 mb-3">
              Who are we losing to?
              {insights.whoLosingTo.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {insights.whoLosingTo.length} lender{insights.whoLosingTo.length !== 1 ? 's' : ''} named in notes
                </span>
              )}
            </h3>
            {insights.whoLosingTo.length === 0 ? (
              <p className="text-sm text-gray-400">No specific banks or finance companies were named in these notes.</p>
            ) : (
              <div className="space-y-3">
                {insights.whoLosingTo.map((row, idx) => (
                  <div key={`${row.competitor}-${idx}`} className="border border-gray-700 rounded-lg p-4 bg-gray-900/40">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-blue-300">{row.competitor}</p>
                      <span className="text-xs text-gray-500">
                        mentioned ~{row.mentionCount}×
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{row.howTheyBeatUs}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowSaveModal(false)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl w-full max-w-md p-5 shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-100 mb-1">Save insights</h3>
            <p className="text-sm text-gray-400 mb-4">
              Name this analysis so you can reopen it later. Visible to managers and admins.
            </p>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Name</label>
            <input
              autoFocus
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveInsights(); }}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 mb-5 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="e.g. July No Deal — Midwest"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveInsights}
                disabled={saveLoading || !saveName.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {saveLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
      ) : filteredNotes.length === 0 ? (
        <div className="py-14 text-center">
          <StickyNote className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-base font-medium text-gray-400">No No Deal notes found</p>
          <p className="text-sm text-gray-500 mt-1">
            {dateFrom === today
              ? 'No No Deal notes recorded today yet.'
              : 'No No Deal notes for the selected date range.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.length > NOTES_PER_PAGE && (
            <div className="flex items-center justify-between px-1 flex-wrap gap-2">
              <span className="text-xs text-gray-500">
                Showing {rangeStart}–{rangeEnd} of {filteredNotes.length} notes
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-400" />
                </button>
                <span className="text-xs text-gray-400 px-2">Page {safePage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {paginatedNotes.map(note => (
              <div
                key={`${note.source}-${note.id}`}
                className="bg-gray-800 border border-gray-700 rounded-lg px-5 py-4 hover:border-gray-600 transition"
              >
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-semibold text-blue-400">{note.appId || '—'}</span>
                    <span className="text-sm text-gray-200">{note.dealerName || '—'}</span>
                    {note.customerName && (
                      <span className="text-sm text-gray-400">{note.customerName}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      note.source === 'calls'
                        ? 'bg-blue-900 bg-opacity-40 text-blue-300 border-blue-800'
                        : 'bg-green-900 bg-opacity-40 text-green-300 border-green-800'
                    }`}>
                      {note.source === 'calls' ? 'Calls' : 'Daily Deals'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-red-900 bg-opacity-40 text-red-300 border-red-800">
                      No Deal
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

          {filteredNotes.length > NOTES_PER_PAGE && (
            <div className="flex items-center justify-center gap-1 pt-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
              <span className="text-xs text-gray-400 px-2">Page {safePage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
