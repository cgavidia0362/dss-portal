import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { StickyNote, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

interface CombinedNote {
  id: string;
  source: 'calls' | 'daily_deals';
  appId: string;
  dealerName: string;
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

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const NOTES_PER_PAGE = 10;

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
  const [filterFuStatus, setFilterFuStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [insights, setInsights] = useState<{
    overallSummary: string;
    repSummaries: { repName: string; feedback: string }[];
  } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  useEffect(() => { fetchNotes(); }, [dateFrom, dateTo, selectedRepId]);

  useEffect(() => { setCurrentPage(1); }, [dateFrom, dateTo, selectedRepId, filterSource, filterFuStatus]);

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

      const appIds = [...new Set((callNotes || []).map((n: { application_id: string }) => n.application_id).filter(Boolean))];
      const callStatusMap: Record<string, string> = {};
      if (appIds.length > 0) {
        const { data: callsData } = await supabase
          .from('calls')
          .select('application_id, fu_status')
          .in('application_id', appIds);
        (callsData || []).forEach((c: { application_id: string; fu_status?: string }) => {
          if (c.application_id) callStatusMap[c.application_id] = c.fu_status || '';
        });
      }

      // Daily deal notes (joined with parent deal)
      let dealQuery = supabase
        .from('daily_deal_notes')
        .select(`id, note_text, created_by, created_by_name, created_at, daily_deals (app_id, dealer_name, fu_status)`)
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
          fuStatus: callStatusMap[n.application_id] || undefined,
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
          fuStatus: n.daily_deals?.fu_status || undefined,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setNotes(combined);
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateInsights = async () => {
    setInsightsLoading(true);
    setInsightsError('');
    setInsights(null);

    try {
      // Filter out short/generic notes that don't carry conversation substance
      const genericPhrases = [
        'no answer', 'left vm', 'left voicemail', 'voicemail left',
        'pending', 'no response', 'follow up', 'followup', 'callback',
        'call back', 'no ans', 'vm left', 'still pending', 'ringing',
        'busy', 'no pickup', 'didnt answer', "didn't answer", 'try again',
      ];

      const substantiveNotes = notes.filter(n => {
        const text = n.noteText.trim().toLowerCase();
        if (text.length < 20) return false;
        if (genericPhrases.some(p => text === p || (text.length < 35 && text.includes(p)))) return false;
        return true;
      });

      if (substantiveNotes.length === 0) {
        setInsightsError('No substantive notes found in this date range to analyze.');
        setInsightsLoading(false);
        return;
      }

      // Group by rep
      const byRep: { [name: string]: string[] } = {};
      substantiveNotes.forEach(n => {
        const name = n.createdByName || 'Unknown';
        if (!byRep[name]) byRep[name] = [];
        byRep[name].push(`[${n.dealerName || 'Unknown Dealer'} — App ${n.appId || 'N/A'}] ${n.noteText}`);
      });

      const repSections = Object.entries(byRep)
        .map(([name, notesArr]) => `### Rep: ${name}\n${notesArr.map(t => `- ${t}`).join('\n')}`)
        .join('\n\n');

      const systemPrompt = `You are analyzing dealer/customer call notes for a subprime auto finance company called Pronto Finance. Reps call dealers to discuss the company's program and try to win deals.

The company's current selling points (the "program") include: lower fees, lower rates, higher balances, easier GPS install process, TurboPass and faster funding, guaranteed backend.

The IDEAL conversation a rep should be having with a dealer covers:
1. Identifying who they spoke with at the dealership
2. Gauging the dealer's reaction to the updated program (lower fees/rates, higher balances, easier GPS, TurboPass/faster funding, guaranteed backend)
3. Asking who we're losing deals to (which bank/finance company) and how they're beating us
4. Pitching: "click everything under 30k that isn't a BK or repo" to earn more business
5. Asking if the dealer uses Dealer Center, and if so getting an email address to send approvals to (since approvals go out in 6-7 minutes and Dealer Center can cause delays)
6. Getting a commitment from the dealer to click all subprime apps under 30k that aren't a BK or repo

Analyze the notes provided and return a JSON object with this EXACT structure (no markdown, no code fences, just raw JSON):

{
  "overallSummary": "A few paragraphs covering: (1) Who we're losing deals to (which banks/finance companies are mentioned) and how they're beating us, (2) General feedback themes - both positive and negative - about our program from dealers, (3) Any other notable patterns across all conversations.",
  "repSummaries": [
    { "repName": "Name", "feedback": "Coaching feedback for this specific rep on how well their conversations covered the 6 points above. Be specific - mention what they did well and what they're missing. Keep it constructive and actionable, 2-4 sentences." }
  ]
}

Only include reps who have at least one substantive note. If a competitor bank/finance company is named anywhere, call it out specifically in the overall summary.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            { role: 'user', content: `Here are the call notes grouped by rep for the period ${formatDateLabel(dateFrom, dateTo)}:\n\n${repSections}` }
          ],
        })
      });

      const data = await response.json();
      const textBlock = data.content?.find((c: any) => c.type === 'text');
      if (!textBlock?.text) throw new Error('No response from AI');

      const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      setInsights(parsed);
    } catch (err: any) {
      console.error('Insights error:', err);
      setInsightsError('Failed to generate insights. Please try again.');
    } finally {
      setInsightsLoading(false);
    }
  };

  const filteredNotes = notes.filter(n => {
    if (filterSource && n.source !== filterSource) return false;
    if (filterFuStatus && n.fuStatus !== filterFuStatus) return false;
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

          {/* FU status filter */}
          <select
            value={filterFuStatus}
            onChange={e => setFilterFuStatus(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="No Deal">No Deal Only</option>
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

          {/* AI Insights */}
          {isAdminOrManager && (
            <button
              onClick={generateInsights}
              disabled={insightsLoading || notes.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-purple-900 bg-opacity-40 hover:bg-opacity-60 border border-purple-700 rounded-lg text-sm text-purple-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {insightsLoading ? 'Analyzing…' : 'AI Insights'}
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

      {/* AI INSIGHTS PANEL */}
      {insightsError && (
        <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg px-4 py-3">
          <p className="text-sm text-red-300">{insightsError}</p>
        </div>
      )}

      {insights && (
        <div className="space-y-3">
          <div className="bg-purple-900 bg-opacity-10 border border-purple-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-300">Overall Summary — {formatDateLabel(dateFrom, dateTo)}</h3>
            </div>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{insights.overallSummary}</p>
          </div>

          {insights.repSummaries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-300 px-1">Rep Coaching Feedback</h3>
              {insights.repSummaries.map((rep, idx) => (
                <div key={idx} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-400 mb-1.5">{rep.repName}</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{rep.feedback}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    note.source === 'calls'
                      ? 'bg-blue-900 bg-opacity-40 text-blue-300 border-blue-800'
                      : 'bg-green-900 bg-opacity-40 text-green-300 border-green-800'
                  }`}>
                    {note.source === 'calls' ? 'Calls' : 'Daily Deals'}
                  </span>
                  {note.fuStatus && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      note.fuStatus === 'No Deal'
                        ? 'bg-red-900 bg-opacity-40 text-red-300 border-red-800'
                        : 'bg-gray-700 text-gray-400 border-gray-600'
                    }`}>
                      {note.fuStatus}
                    </span>
                  )}
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