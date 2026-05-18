import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronRight, ChevronDown, MessageSquare, Trash2, Plus } from 'lucide-react';

interface DailyDeal {
  id: string;
  appId: string;
  dealerName: string;
  customerName: string;
  amount: string;
  state: string;
  fuStatus: string;
  addedBy: string;
  addedByName: string;
  dealDate: string;
  createdAt: string;
}

interface DailyDealNote {
  id: string;
  dealId: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'rep';
}

interface DailyDealsTabProps {
  currentUser: User;
}

const FU_STATUSES = ['Deal', 'Confirmed Deal', 'Pending', 'No Answer', 'No Deal'];

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getFuStatusColor = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('confirmed')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  if (s.includes('deal')) return 'bg-green-900 text-green-300 border-green-700';
  if (s.includes('pending')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('no answer')) return 'bg-orange-900 text-orange-300 border-orange-700';
  if (s.includes('no deal')) return 'bg-red-900 text-red-300 border-red-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

export default function DailyDealsTab({ currentUser }: DailyDealsTabProps) {
  const today = getTodayString();

  const [todayDeals, setTodayDeals] = useState<DailyDeal[]>([]);
  const [dealNotes, setDealNotes] = useState<{ [dealId: string]: DailyDealNote[] }>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newNoteText, setNewNoteText] = useState<{ [dealId: string]: string }>({});

  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [datesWithDeals, setDatesWithDeals] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateDeals, setSelectedDateDeals] = useState<DailyDeal[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    appId: '', dealerName: '', customerName: '',
    amount: '', state: '', fuStatus: 'Deal',
  });
  const [formError, setFormError] = useState('');

  useEffect(() => { fetchTodayDeals(); }, []);
  useEffect(() => { fetchDatesWithDeals(calendarYear, calendarMonth); }, [calendarYear, calendarMonth]);

  const fetchTodayDeals = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('daily_deals').select('*')
        .eq('deal_date', today)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      if (data) {
        const formatted = data.map((d: any) => ({
          id: d.id, appId: d.app_id, dealerName: d.dealer_name,
          customerName: d.customer_name, amount: d.amount,
          state: d.state, fuStatus: d.fu_status,
          addedBy: d.added_by, addedByName: d.added_by_name,
          dealDate: d.deal_date, createdAt: d.created_at,
        }));
        setTodayDeals(formatted);
        fetchNotesForDeals(formatted.map(d => d.id));
      }
    } catch (err: any) {
      setError('Failed to load deals: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotesForDeals = async (dealIds: string[]) => {
    if (dealIds.length === 0) return;
    const { data } = await supabase
      .from('daily_deal_notes').select('*')
      .in('deal_id', dealIds)
      .order('created_at', { ascending: true });
    if (data) {
      const grouped: { [dealId: string]: DailyDealNote[] } = {};
      data.forEach((n: any) => {
        if (!grouped[n.deal_id]) grouped[n.deal_id] = [];
        grouped[n.deal_id].push({
          id: n.id, dealId: n.deal_id, noteText: n.note_text,
          createdBy: n.created_by, createdByName: n.created_by_name,
          createdAt: n.created_at,
        });
      });
      setDealNotes(grouped);
    }
  };

  const fetchDatesWithDeals = async (year: number, month: number) => {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { data } = await supabase
      .from('daily_deals').select('deal_date')
      .gte('deal_date', startDate).lte('deal_date', endDate);
    if (data) setDatesWithDeals(new Set(data.map((d: any) => d.deal_date)));
  };

  const fetchDealsByDate = async (dateStr: string) => {
    const { data } = await supabase
      .from('daily_deals').select('*')
      .eq('deal_date', dateStr)
      .order('created_at', { ascending: false });
    if (data) {
      setSelectedDateDeals(data.map((d: any) => ({
        id: d.id, appId: d.app_id, dealerName: d.dealer_name,
        customerName: d.customer_name, amount: d.amount,
        state: d.state, fuStatus: d.fu_status,
        addedBy: d.added_by, addedByName: d.added_by_name,
        dealDate: d.deal_date, createdAt: d.created_at,
      })));
    }
  };

  const handleAddDeal = async () => {
    if (!form.appId || !form.dealerName || !form.customerName || !form.amount || !form.state) {
      setFormError('All fields are required');
      return;
    }
    try {
      setFormError('');
      const { data, error: insertError } = await supabase
        .from('daily_deals').insert({
          app_id: form.appId.trim(),
          dealer_name: form.dealerName.trim(),
          customer_name: form.customerName.trim(),
          amount: form.amount.trim(),
          state: form.state.trim().toUpperCase(),
          fu_status: form.fuStatus,
          added_by: currentUser.id,
          added_by_name: currentUser.name,
          deal_date: today,
        }).select().single();
      if (insertError) throw insertError;
      setSuccess('Deal added!');
      setTimeout(() => setSuccess(''), 3000);
      setForm({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });
      await fetchTodayDeals();
      await fetchDatesWithDeals(calendarYear, calendarMonth);
    } catch (err: any) {
      setFormError('Failed to add deal: ' + err.message);
    }
  };

  const handleDeleteDeal = async (deal: DailyDeal) => {
    const canDelete = currentUser.role === 'admin' || currentUser.role === 'manager' || deal.addedBy === currentUser.id;
    if (!canDelete) { setError("You can only delete your own entries."); return; }
    if (!confirm('Delete this deal entry?')) return;
    const { error: deleteError } = await supabase.from('daily_deals').delete().eq('id', deal.id);
    if (deleteError) { setError('Failed to delete: ' + deleteError.message); return; }
    await fetchTodayDeals();
    await fetchDatesWithDeals(calendarYear, calendarMonth);
  };

  const handleAddNote = async (dealId: string) => {
    const text = newNoteText[dealId]?.trim();
    if (!text) return;
    const { error: noteError } = await supabase.from('daily_deal_notes').insert({
      deal_id: dealId, note_text: text,
      created_by: currentUser.id, created_by_name: currentUser.name,
    });
    if (noteError) return;
    setNewNoteText(prev => ({ ...prev, [dealId]: '' }));
    await fetchNotesForDeals(todayDeals.map(d => d.id));
  };

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedRows(next);
  };

  const handleCalendarDayClick = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStr === today) return;
    if (dateStr > today) return;
    if (!datesWithDeals.has(dateStr)) return;
    if (selectedDate === dateStr) { setSelectedDate(null); setSelectedDateDeals([]); return; }
    setSelectedDate(dateStr);
    fetchDealsByDate(dateStr);
  };

  // Calendar generation
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const todayDealCount = todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').length;
  const todayTotalAmount = todayDeals.reduce((sum, d) => {
    return sum + (parseFloat(d.amount.replace(/[^0-9.-]+/g, '')) || 0);
  }, 0);
  const addedBySet = new Set(todayDeals.map(d => d.addedByName));

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Daily Deals</h2>
          <p className="text-gray-400 mt-1">Log same-day deals before the CSV upload</p>
        </div>
        <div className="text-sm text-gray-400 bg-gray-800 px-3 py-2 rounded-lg border border-gray-700">
          {formatDateLabel(today)}
        </div>
      </div>

      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded">{error}</div>}
      {success && <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded">{success}</div>}

      {/* TOP ROW: Calendar + Summary/Selected Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Calendar */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => {
                if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); }
                else setCalendarMonth(m => m - 1);
              }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition"
            >‹</button>
            <span className="text-sm font-medium text-gray-200">{monthNames[calendarMonth]} {calendarYear}</span>
            <button
              onClick={() => {
                if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); }
                else setCalendarMonth(m => m + 1);
              }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition"
            >›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="text-center text-xs text-gray-500 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              if (!day) return <div key={i} />;
              const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === today;
              const isFuture = dateStr > today;
              const hasDeals = datesWithDeals.has(dateStr);
              const isSelected = selectedDate === dateStr;

              let className = 'relative text-center text-xs py-1.5 rounded cursor-pointer transition ';
              if (isToday) className += 'bg-blue-600 text-white font-medium';
              else if (isFuture) className += 'text-gray-600 cursor-default';
              else if (isSelected) className += 'bg-blue-900 text-blue-300 border border-blue-600';
              else if (hasDeals) className += 'bg-green-900 text-green-300 hover:bg-green-800 cursor-pointer';
              else className += 'text-gray-400 hover:bg-gray-700';

              return (
                <div key={i} className={className} onClick={() => handleCalendarDayClick(day)}>
                  {day}
                  {hasDeals && !isToday && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-400 block" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-700 flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="text-xs text-gray-400">Has entries</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-400">Today</span>
            </div>
          </div>
        </div>

        {/* Right side: summary cards + selected date preview */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Deals Today</p>
              <p className="text-2xl font-bold text-green-400">{todayDealCount}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Total Amount</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(todayTotalAmount)}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Added By</p>
              <p className="text-2xl font-bold text-gray-100">{addedBySet.size} rep{addedBySet.size !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Selected past date view */}
          {selectedDate && (
            <div className="bg-gray-800 rounded-lg border border-green-700 overflow-hidden flex-1">
              <div className="flex items-center justify-between px-4 py-3 bg-green-900 bg-opacity-40 border-b border-green-700">
                <span className="text-sm font-medium text-green-300">
                  {formatDateLabel(selectedDate)} — {selectedDateDeals.length} deal{selectedDateDeals.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => { setSelectedDate(null); setSelectedDateDeals([]); }} className="text-gray-400 hover:text-gray-200 text-xs">✕ close</button>
              </div>
              <div className="overflow-x-auto max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-700">
                    <tr>
                      {['App ID','Dealer','Customer','Amount','State','Status','By'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {selectedDateDeals.map(deal => (
                      <tr key={deal.id} className="hover:bg-gray-750">
                        <td className="px-3 py-2 text-blue-400">{deal.appId}</td>
                        <td className="px-3 py-2 text-gray-200 max-w-24 overflow-hidden text-ellipsis whitespace-nowrap">{deal.dealerName}</td>
                        <td className="px-3 py-2 text-gray-200 max-w-24 overflow-hidden text-ellipsis whitespace-nowrap">{deal.customerName}</td>
                        <td className="px-3 py-2 text-gray-200">{deal.amount}</td>
                        <td className="px-3 py-2 text-gray-200">{deal.state}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${getFuStatusColor(deal.fuStatus)}`}>{deal.fuStatus}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-400">{deal.addedByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!selectedDate && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex items-center justify-center flex-1">
              <p className="text-sm text-gray-500 text-center">
                Click a highlighted date on the calendar<br />to view that day's deal entries
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Deal Form */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
        <h3 className="text-base font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Log a Deal
        </h3>

        {formError && <div className="bg-red-900 border border-red-700 text-red-200 px-3 py-2 rounded text-sm mb-4">{formError}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">App ID *</label>
            <input type="text" value={form.appId} onChange={e => setForm({ ...form, appId: e.target.value })}
              placeholder="e.g. DTBFE001"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Dealer Name *</label>
            <input type="text" value={form.dealerName} onChange={e => setForm({ ...form, dealerName: e.target.value })}
              placeholder="e.g. High Quality Auto"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Customer Name *</label>
            <input type="text" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
              placeholder="e.g. Juan Rodriguez"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Amount *</label>
            <input type="text" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g. $15,000"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">State *</label>
            <input type="text" value={form.state}
              onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
              placeholder="e.g. IL" maxLength={2}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">FU Status *</label>
            <select value={form.fuStatus} onChange={e => setForm({ ...form, fuStatus: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleAddDeal}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">
              Add Deal
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Counts toward today's daily goal only. Notes can be added after by expanding each row.
        </p>
      </div>

      {/* Today's Deals Table */}
      <div>
        <h3 className="text-base font-semibold text-gray-100 mb-3">
          Today's Deals — {formatDateLabel(today)}
          <span className="ml-2 text-sm text-gray-400 font-normal">({todayDeals.length} entries)</span>
        </h3>

        {loading ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-400">Loading...</div>
        ) : todayDeals.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-400">
            <p className="text-lg font-medium">No deals logged yet today.</p>
            <p className="text-sm mt-1">Use the form above to log your first deal.</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">App ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Dealer</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Customer</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">State</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Notes</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">By</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {todayDeals.map(deal => {
                  const isExpanded = expandedRows.has(deal.id);
                  const notes = dealNotes[deal.id] || [];
                  const canDelete = currentUser.role === 'admin' || currentUser.role === 'manager' || deal.addedBy === currentUser.id;

                  return (
                    <>
                      <tr key={deal.id} className="hover:bg-gray-750 cursor-pointer" onClick={() => toggleRow(deal.id)}>
                        <td className="px-4 py-3 text-center">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                            : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </td>
                        <td className="px-4 py-3 text-sm text-blue-400 font-medium">{deal.appId}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{deal.dealerName}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{deal.customerName}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{deal.amount}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{deal.state}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <span className={`px-2 py-1 rounded-full text-xs border ${getFuStatusColor(deal.fuStatus)}`}>
                            {deal.fuStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {notes.length > 0 && (
                            <div className="flex items-center gap-1">
                              <MessageSquare className="w-4 h-4 text-blue-400" />
                              <span className="px-2 py-0.5 bg-blue-900 text-blue-200 rounded-full text-xs font-bold">{notes.length}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">{deal.addedByName}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {canDelete && (
                            <button onClick={() => handleDeleteDeal(deal)}
                              className="text-red-400 hover:text-red-300 transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${deal.id}-notes`}>
                          <td colSpan={10} className="px-4 py-4 bg-gray-750">
                            <div className="space-y-3">
                              <h4 className="text-sm font-semibold text-gray-300">Notes ({notes.length})</h4>
                              {notes.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">No notes yet. Add one below.</p>
                              ) : (
                                <div className="space-y-2">
                                  {notes.map(note => (
                                    <div key={note.id} className="bg-gray-700 p-3 rounded-lg">
                                      <p className="text-sm text-gray-200">{note.noteText}</p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {note.createdByName} · {new Date(note.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Add a note..."
                                  value={newNoteText[deal.id] || ''}
                                  onChange={e => setNewNoteText(prev => ({ ...prev, [deal.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleAddNote(deal.id); }}
                                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button onClick={() => handleAddNote(deal.id)}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
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
        )}
      </div>
    </div>
  );
}