import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { dealCreditDbFields } from '../lib/dealCredit';
import { findCallsByAppId } from '../lib/manualDealMatch';
import { findCallsByDealerCustomer } from '../lib/uploadDealMatch';
import { ChevronRight, ChevronDown, MessageSquare, Trash2, Users, Edit2, Check, X, Trophy, DollarSign, ClipboardList, PlusCircle, Target, Download } from 'lucide-react';
import DealerNameInput from '../components/DealerNameInput';
import NoteItem from '../components/NoteItem';
import { exportRowsToExcel } from '../lib/exportExcel';

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

interface Call {
  id: string;
  applicationId: string;
  dealerCifNumber: string;
  dealerName: string;
  state: string;
  buyerFinal: string;
  statusLast: string;
  submittedDate: string;
  createdAt?: Date;
  fuStatus?: string;
  assignedTo?: string;
  assignedToName?: string;
  dealDate?: Date;
  dealBy?: string;
  dealByName?: string;
  customerName?: string;
  isDuplicate?: boolean;
}

interface DailyDealSummary {
  id: string;
  addedBy: string;
  fuStatus: string;
  dealDate: string;
  amount: string;
  state: string;
}

interface User {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
}

interface Goals {
  daily: { [repId: string]: number };
  team: number;
  weekly: number;
  monthly: number;
}

interface DailyDealsTabProps {
  currentUser: User;
  goals: Goals;
  onRefresh: () => void;
  calls?: Call[];
  todayDailyDeals?: DailyDealSummary[];
  users?: User[];
}

interface CombinedEntry {
  id: string;
  source: 'manual' | 'call';
  appId: string;
  dealerName: string;
  customerName: string;
  amount: string;
  state: string;
  fuStatus: string;
  creditName: string;
  creditId?: string;
  sortTime: number;
}

const FU_STATUSES = ['Deal', 'Confirmed Deal', 'Pending', 'No Answer', 'No Deal', 'Follow Up'];

const STATUS_LAST_OPTIONS = [
  'Accepted', 'Approved', 'Approval', 'Counter', 'Denial', 'Declined',
  'Pending Approval', 'Document Received', 'Funded', 'Funding Pending',
  'New Application', 'Incomplete', 'Withdrawn', 'Cancelled',
];

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getFuStatusStyle = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('confirmed')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  if (s.includes('follow up')) return 'bg-amber-900 text-amber-300 border-amber-700';
  if (s.includes('deal')) return 'bg-green-900 text-green-300 border-green-700';
  if (s.includes('pending')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('no answer')) return 'bg-orange-900 text-orange-300 border-orange-700';
  if (s.includes('no deal')) return 'bg-red-900 text-red-300 border-red-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

const getStatusLastStyle = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('approved') || s === 'approval') return 'bg-green-900 text-green-300 border-green-700';
  if (s === 'pending approval' || s.includes('pending approval')) return 'bg-purple-900 text-purple-300 border-purple-700';
  if (s.includes('counter')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('denial') || s.includes('declined')) return 'bg-red-900 text-red-300 border-red-700';
  if (s.includes('accepted')) return 'bg-blue-900 text-blue-300 border-blue-700';
  if (s.includes('funded') || s.includes('funding')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  if (s.includes('new application')) return 'bg-cyan-900 text-cyan-300 border-cyan-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

const isSameLocalDate = (dateStr: string, targetDate: string): boolean => {
  const d = new Date(dateStr);
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return localDate === targetDate;
};

const toLocalDateString = (dateStr: string): string => {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DailyDealsTab({
  currentUser, goals, onRefresh,
  calls = [], users = [],
}: DailyDealsTabProps) {
  const today = getTodayString();

  const [todayDeals, setTodayDeals] = useState<DailyDeal[]>([]);
  const [dealNotes, setDealNotes] = useState<{ [dealId: string]: DailyDealNote[] }>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newNoteText, setNewNoteText] = useState<{ [dealId: string]: string }>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(true);
  const [selectedUser, setSelectedUser] = useState(currentUser.id);
  const [form, setForm] = useState({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingDeal, setEditingDeal] = useState<string | null>(null);
  const [editAppId, setEditAppId] = useState('');
  const [editDealerName, setEditDealerName] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editState, setEditState] = useState('');
  const [editFuStatus, setEditFuStatus] = useState('');
  const [editCreditId, setEditCreditId] = useState('');
  const [editCreditName, setEditCreditName] = useState('');

  const [callOverrides, setCallOverrides] = useState<{ [id: string]: { amount?: string; fuStatus?: string } }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Call[]>([]);
  const [linkedCall, setLinkedCall] = useState<Call | null>(null);
  const [appIdConflicts, setAppIdConflicts] = useState<Array<Call | { id: string; applicationId: string; dealerName: string; state: string; customerName?: string; buyerFinal?: string }>>([]);
  const [checkingAppId, setCheckingAppId] = useState(false);
  const [softMatches, setSoftMatches] = useState<Array<Call | { id: string; applicationId: string; dealerName: string; state: string; customerName?: string; buyerFinal?: string }>>([]);
  const [checkingSoftMatch, setCheckingSoftMatch] = useState(false);

  // Dealer popup state
  const [dealerPopup, setDealerPopup] = useState<string | null>(null);
  const [showAllPopupStatuses, setShowAllPopupStatuses] = useState(false);
  const [popupNotes, setPopupNotes] = useState<{ [callId: string]: any[] }>({});
  const [popupNewNoteText, setPopupNewNoteText] = useState<{ [callId: string]: string }>({});
  const [popupExpandedNotes, setPopupExpandedNotes] = useState<Set<string>>(new Set());
  const [popupEditingStatusLast, setPopupEditingStatusLast] = useState<string | null>(null);
  const [popupTempStatusLast, setPopupTempStatusLast] = useState('');
  const [popupEditingAmount, setPopupEditingAmount] = useState<string | null>(null);
  const [popupTempAmount, setPopupTempAmount] = useState('');
  const [popupFuOverrides, setPopupFuOverrides] = useState<{ [callId: string]: string }>({});
  const [popupStatusLastOverrides, setPopupStatusLastOverrides] = useState<{ [callId: string]: string }>({});
  const [popupAmountOverrides, setPopupAmountOverrides] = useState<{ [callId: string]: string }>({});

  const [showHistory, setShowHistory] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [datesWithDeals, setDatesWithDeals] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateDeals, setSelectedDateDeals] = useState<DailyDeal[]>([]);

  useEffect(() => { fetchTodayDeals(); fetchAllUsers(); }, []);
  useEffect(() => { if (showHistory) fetchDatesWithDeals(calendarYear, calendarMonth); }, [calendarYear, calendarMonth, showHistory]);

  useEffect(() => {
    const channel = supabase
      .channel('daily_deals_realtime_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_deals' }, () => {
        fetchTodayDeals();
        if (showHistory) fetchDatesWithDeals(calendarYear, calendarMonth);
        onRefresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [calendarYear, calendarMonth, showHistory]);

  // ── ESCAPE KEY ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dealerPopup) { closeDealerPopup(); return; }
        if (expandedRows.size > 0) { setExpandedRows(new Set()); return; }
        if (editingDeal) { setEditingDeal(null); return; }
        if (showHistory) { setShowHistory(false); setSelectedDate(null); setSelectedDateDeals([]); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dealerPopup, expandedRows, editingDeal, showHistory]);

  const fetchTodayDeals = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('daily_deals').select('*')
        .eq('deal_date', today)
        .order('created_at', { ascending: false });
      if (err) throw err;
      if (data) {
        const formatted = data.map((d: any) => ({
          id: d.id, appId: d.app_id, dealerName: d.dealer_name,
          customerName: d.customer_name, amount: d.amount,
          state: d.state, fuStatus: d.fu_status,
          addedBy: d.added_by, addedByName: d.added_by_name,
          dealDate: d.deal_date, createdAt: d.created_at,
        }));
        setTodayDeals(formatted);
        if (formatted.length > 0) fetchNotesForDeals(formatted.map((d: DailyDeal) => d.id));
      }
    } catch (e: any) {
      setError('Failed to load deals: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, name, role').eq('active', true).order('name');
    if (data) setAllUsers(data.map((r: any) => ({ id: r.id, name: r.name, role: r.role })));
  };

  const fetchNotesForDeals = async (dealIds: string[]) => {
    if (!dealIds.length) return;
    const { data } = await supabase.from('daily_deal_notes').select('*')
      .in('deal_id', dealIds).order('created_at', { ascending: true });
    if (data) {
      const grouped: { [id: string]: DailyDealNote[] } = {};
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
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const dates = new Set<string>();

    const { data: manualDates } = await supabase.from('daily_deals').select('deal_date')
      .gte('deal_date', start).lte('deal_date', end);
    (manualDates || []).forEach((d: { deal_date: string }) => dates.add(d.deal_date));

    const { data: callRows } = await supabase.from('calls')
      .select('deal_date')
      .in('fu_status', ['Deal', 'Confirmed Deal'])
      .not('deal_date', 'is', null)
      .gte('deal_date', `${start}T00:00:00`)
      .lte('deal_date', `${end}T23:59:59.999`);

    (callRows || []).forEach((c: { deal_date: string }) => {
      const localDate = toLocalDateString(c.deal_date);
      if (localDate >= start && localDate <= end) dates.add(localDate);
    });

    setDatesWithDeals(dates);
  };

  const fetchDealsByDate = async (dateStr: string) => {
    const { data: manualData } = await supabase.from('daily_deals').select('*')
      .eq('deal_date', dateStr).order('created_at', { ascending: false });

    const manualDeals: DailyDeal[] = (manualData || []).map((d: any) => ({
      id: d.id, appId: d.app_id, dealerName: d.dealer_name,
      customerName: d.customer_name, amount: d.amount,
      state: d.state, fuStatus: d.fu_status,
      addedBy: d.added_by, addedByName: d.added_by_name,
      dealDate: d.deal_date, createdAt: d.created_at,
    }));

    const manualAppIds = new Set(manualDeals.map(d => d.appId.trim().toLowerCase()).filter(Boolean));

    const { data: callData } = await supabase.from('calls')
      .select('id, application_id, dealer_name, customer_full_name, buyer_final, state, fu_status, deal_date, deal_by, deal_by_name, assigned_to_name')
      .in('fu_status', ['Deal', 'Confirmed Deal'])
      .not('deal_date', 'is', null)
      .gte('deal_date', `${dateStr}T00:00:00`)
      .lte('deal_date', `${dateStr}T23:59:59.999`);

    const callDeals: DailyDeal[] = (callData || [])
      .filter((c: any) => c.deal_date && isSameLocalDate(c.deal_date, dateStr))
      .filter((c: any) => !manualAppIds.has((c.application_id || '').trim().toLowerCase()))
      .map((c: any) => ({
        id: `call-${c.id}`,
        appId: c.application_id,
        dealerName: c.dealer_name,
        customerName: c.customer_full_name || '—',
        amount: c.buyer_final || '0',
        state: c.state,
        fuStatus: c.fu_status,
        addedBy: c.deal_by || '',
        addedByName: c.deal_by_name || c.assigned_to_name || 'Unknown',
        dealDate: dateStr,
        createdAt: c.deal_date,
      }));

    const combined = [...manualDeals, ...callDeals].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setSelectedDateDeals(combined);
  };

  // ── DEALER POPUP ─────────────────────────────────────────────────

  const openDealerPopup = async (dealerName: string) => {
    setDealerPopup(dealerName);
    setPopupNotes({});
    setPopupExpandedNotes(new Set());
    setPopupFuOverrides({});
    setPopupStatusLastOverrides({});
    setPopupAmountOverrides({});
    const dealerCalls = calls.filter(c => c.dealerName === dealerName);
    const callIds = dealerCalls.map(c => c.id);
    if (callIds.length > 0) {
      const { data } = await supabase.from('call_notes').select('*')
        .in('call_id', callIds).order('created_at', { ascending: true });
      if (data) {
        const grouped: { [id: string]: any[] } = {};
        data.forEach((n: any) => {
          if (!grouped[n.call_id]) grouped[n.call_id] = [];
          grouped[n.call_id].push(n);
        });
        setPopupNotes(grouped);
      }
    }
  };

  const closeDealerPopup = () => {
    setDealerPopup(null);
    setPopupNotes({});
    setPopupNewNoteText({});
    setPopupExpandedNotes(new Set());
    setPopupEditingStatusLast(null);
    setPopupEditingAmount(null);
    setPopupFuOverrides({});
    setPopupStatusLastOverrides({});
    setPopupAmountOverrides({});
    setShowAllPopupStatuses(false);
  };

  const handlePopupFuStatus = async (callId: string, newStatus: string) => {
    const existing = calls.find(c => c.id === callId);
    const creditUser = allUsers.find(u => u.id === selectedUser) || users.find(u => u.id === selectedUser) || currentUser;
    setPopupFuOverrides(prev => ({ ...prev, [callId]: newStatus }));
    await supabase.from('calls').update({
      ...dealCreditDbFields(newStatus, {
        dealBy: existing?.dealBy,
        dealByName: existing?.dealByName,
        dealDate: existing?.dealDate,
      }, { id: creditUser.id, name: creditUser.name }),
      updated_at: new Date().toISOString(),
    }).eq('id', callId);
    onRefresh();
  };

  const handlePopupSaveStatusLast = async (callId: string) => {
    setPopupStatusLastOverrides(prev => ({ ...prev, [callId]: popupTempStatusLast }));
    setPopupEditingStatusLast(null);
    await supabase.from('calls').update({
      status_last: popupTempStatusLast,
      updated_at: new Date().toISOString(),
    }).eq('id', callId);
  };

  const handlePopupSaveAmount = async (callId: string) => {
    setPopupAmountOverrides(prev => ({ ...prev, [callId]: popupTempAmount }));
    setPopupEditingAmount(null);
    await supabase.from('calls').update({
      buyer_final: popupTempAmount,
      updated_at: new Date().toISOString(),
    }).eq('id', callId);
  };

  const handlePopupAddNote = async (callId: string) => {
    if (!selectedUser) { setError('Please select your name to add notes.'); return; }
    const text = popupNewNoteText[callId]?.trim();
    if (!text) return;
    const call = calls.find(c => c.id === callId);
    const creditUser = allUsers.find(u => u.id === selectedUser) || users.find(u => u.id === selectedUser) || currentUser;
    const { data, error } = await supabase.from('call_notes').insert({
      call_id: callId,
      application_id: call?.applicationId || '',
      dealer_name: call?.dealerName || '',
      note_text: text,
      created_by: selectedUser,
      created_by_name: creditUser.name,
    }).select().single();
    if (!error && data) {
      setPopupNotes(prev => ({ ...prev, [callId]: [...(prev[callId] || []), data] }));
      setPopupNewNoteText(prev => ({ ...prev, [callId]: '' }));
    }
  };

  const togglePopupNotes = (callId: string) => {
    const n = new Set(popupExpandedNotes);
    if (n.has(callId)) n.delete(callId); else n.add(callId);
    setPopupExpandedNotes(n);
  };

  // ── SEARCH ───────────────────────────────────────────────────────

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase().trim();
    const results = calls.filter(c =>
      c.applicationId.toLowerCase().includes(q) ||
      c.dealerName.toLowerCase().includes(q) ||
      (c.customerName || '').toLowerCase().includes(q)
    ).slice(0, 8);
    setSearchResults(results);
  };

  const handleSelectCall = (call: {
    id: string;
    applicationId: string;
    dealerName: string;
    state: string;
    customerName?: string;
    buyerFinal?: string;
    dealerCifNumber?: string;
    statusLast?: string;
    submittedDate?: string;
  }) => {
    const full: Call = {
      id: call.id,
      applicationId: call.applicationId,
      dealerCifNumber: call.dealerCifNumber || '',
      dealerName: call.dealerName,
      state: call.state,
      buyerFinal: call.buyerFinal || '',
      statusLast: call.statusLast || '',
      submittedDate: call.submittedDate || '',
      customerName: call.customerName,
    };
    setLinkedCall(full);
    setAppIdConflicts([]);
    setSoftMatches([]);
    setForm(prev => ({
      ...prev,
      appId: full.applicationId,
      dealerName: full.dealerName,
      amount: full.buyerFinal || '',
      state: full.state,
      fuStatus: 'Deal',
      customerName: full.customerName || '',
    }));
    setSearchResults([]);
    setSearchQuery('');
  };

  const clearLinkedCall = () => {
    setLinkedCall(null);
    setSearchQuery('');
    setSearchResults([]);
    setAppIdConflicts([]);
    setSoftMatches([]);
    setForm(prev => ({ ...prev, appId: '', dealerName: '', customerName: '', amount: '', state: '' }));
  };

  useEffect(() => {
    if (linkedCall) {
      setAppIdConflicts([]);
      setCheckingAppId(false);
      return;
    }
    const appId = form.appId.trim();
    if (!appId) {
      setAppIdConflicts([]);
      setCheckingAppId(false);
      return;
    }

    const localMatches = findCallsByAppId(calls, appId);
    setAppIdConflicts(localMatches);

    let cancelled = false;
    setCheckingAppId(true);
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.from('calls')
        .select('id, application_id, dealer_name, buyer_final, state, customer_full_name')
        .ilike('application_id', appId)
        .limit(10);
      if (cancelled) return;
      const remote = findCallsByAppId(data || [], appId).map(c => ({
        id: c.id,
        applicationId: c.application_id,
        dealerName: c.dealer_name || '',
        state: c.state || '',
        customerName: c.customer_full_name || undefined,
        buyerFinal: c.buyer_final || '',
      }));
      const byId = new Map<string, typeof remote[number] | Call>();
      [...localMatches, ...remote].forEach(c => byId.set(c.id, c));
      setAppIdConflicts(Array.from(byId.values()));
      setCheckingAppId(false);
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.appId, linkedCall, calls]);

  useEffect(() => {
    if (linkedCall || appIdConflicts.length > 0) {
      setSoftMatches([]);
      setCheckingSoftMatch(false);
      return;
    }
    const dealer = form.dealerName.trim();
    const customer = form.customerName.trim();
    if (!dealer || !customer) {
      setSoftMatches([]);
      setCheckingSoftMatch(false);
      return;
    }

    const localMatches = findCallsByDealerCustomer(calls, dealer, customer, form.appId).slice(0, 8);
    setSoftMatches(localMatches);

    let cancelled = false;
    setCheckingSoftMatch(true);
    const timer = window.setTimeout(async () => {
      const dealerToken = dealer.split(/\s+/)[0] || dealer;
      const customerToken = customer.split(/\s+/)[0] || customer;
      const { data } = await supabase.from('calls')
        .select('id, application_id, dealer_name, buyer_final, state, customer_full_name')
        .ilike('dealer_name', `%${dealerToken}%`)
        .ilike('customer_full_name', `%${customerToken}%`)
        .limit(40);
      if (cancelled) return;
      const remote = findCallsByDealerCustomer(
        (data || []).map(c => ({
          id: c.id,
          applicationId: c.application_id,
          dealerName: c.dealer_name || '',
          state: c.state || '',
          customerName: c.customer_full_name || undefined,
          buyerFinal: c.buyer_final || '',
        })),
        dealer,
        customer,
        form.appId,
      );
      const byId = new Map<string, typeof remote[number] | Call>();
      [...localMatches, ...remote].forEach(c => byId.set(c.id, c));
      setSoftMatches(Array.from(byId.values()).slice(0, 8));
      setCheckingSoftMatch(false);
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.dealerName, form.customerName, form.appId, linkedCall, calls, appIdConflicts.length]);

  // ── HANDLERS ─────────────────────────────────────────────────────

  const handleAddDeal = async () => {
    if (!selectedUser) {
      setFormError('Please select your name.'); return;
    }
    if (!form.appId || !form.dealerName || !form.amount || !form.state) {
      setFormError('App ID, dealer, amount and state are required'); return;
    }
    if (!linkedCall && !form.customerName) {
      setFormError('Customer name is required'); return;
    }
    if (!linkedCall && findCallsByAppId(calls, form.appId).length > 0) {
      setFormError('This App ID already exists in Calls. Select the existing app above — Manual entry is blocked to prevent duplicates.');
      return;
    }
    if (!linkedCall) {
      const appId = form.appId.trim();
      const { data } = await supabase.from('calls')
        .select('id, application_id, dealer_name, buyer_final, state, customer_full_name')
        .ilike('application_id', appId)
        .limit(10);
      if (findCallsByAppId(data || [], appId).length > 0) {
        setFormError('This App ID already exists in Calls. Select the existing app above — Manual entry is blocked to prevent duplicates.');
        return;
      }
    }
    try {
      setFormError('');
      const creditUser = allUsers.find(u => u.id === selectedUser) || users.find(u => u.id === selectedUser) || currentUser;
      const { error: err } = await supabase.from('daily_deals').insert({
        app_id: form.appId.trim(), dealer_name: form.dealerName.trim(),
        customer_name: form.customerName.trim() || linkedCall?.customerName || '',
        amount: form.amount.trim(),
        state: form.state.trim().toUpperCase(), fu_status: form.fuStatus,
        added_by: selectedUser, added_by_name: creditUser.name, deal_date: today,
      });
      if (err) throw err;
      if (linkedCall) {
        await supabase.from('calls').update({
          fu_status: form.fuStatus,
          deal_by: selectedUser,
          deal_by_name: creditUser.name,
          deal_date: today,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedCall.id);
        setLinkedCall(null);
      }
      setSuccess('Deal added!');
      setTimeout(() => setSuccess(''), 3000);
      setForm({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });
      setSoftMatches([]);
      onRefresh();
    } catch (e: any) {
      setFormError('Failed to add deal: ' + e.message);
    }
  };

  const startEditing = (entry: CombinedEntry) => {
    setEditingDeal(entry.id);
    setEditAppId(entry.appId);
    setEditDealerName(entry.dealerName);
    setEditCustomerName(entry.customerName === '—' ? '' : entry.customerName);
    setEditAmount(entry.amount);
    setEditState(entry.state);
    setEditFuStatus(entry.fuStatus);
    setEditCreditId(entry.creditId || '');
    setEditCreditName(entry.creditName);
  };

  const handleUpdateCombined = async (entry: CombinedEntry) => {
    try {
      if (entry.source === 'manual') {
        const creditUser = allUsers.find(u => u.id === editCreditId);
        const { error: err } = await supabase.from('daily_deals').update({
          app_id: editAppId.trim(), dealer_name: editDealerName.trim(),
          customer_name: editCustomerName.trim(), amount: editAmount.trim(),
          state: editState.trim().toUpperCase(), fu_status: editFuStatus,
          added_by: editCreditId || null, added_by_name: creditUser?.name || editCreditName,
        }).eq('id', entry.id);
        if (err) throw err;
        await fetchTodayDeals();
      } else {
        const existing = calls.find(c => c.id === entry.id);
        const creditUser = allUsers.find(u => u.id === (editCreditId || selectedUser)) || currentUser;
        const { error: err } = await supabase.from('calls').update({
          buyer_final: editAmount.trim(),
          ...dealCreditDbFields(editFuStatus, {
            dealBy: existing?.dealBy,
            dealByName: existing?.dealByName,
            dealDate: existing?.dealDate,
          }, { id: creditUser.id, name: creditUser.name }),
          updated_at: new Date().toISOString(),
        }).eq('id', entry.id);
        if (err) throw err;
        setCallOverrides(prev => ({ ...prev, [entry.id]: { amount: editAmount.trim(), fuStatus: editFuStatus } }));
      }
      setEditingDeal(null);
      onRefresh();
    } catch (e: any) {
      setError('Failed to update: ' + e.message);
    }
  };

  const handleDeleteDeal = async (deal: DailyDeal) => {
    const canDelete = currentUser.role === 'admin' || currentUser.role === 'manager' || deal.addedBy === currentUser.id;
    if (!canDelete) { setError('You can only delete your own entries.'); return; }
    if (!confirm('Delete this deal entry?')) return;
    const { error: err } = await supabase.from('daily_deals').delete().eq('id', deal.id);
    if (err) { setError('Failed to delete: ' + err.message); return; }
    await fetchTodayDeals();
    onRefresh();
  };

  const handleAddNote = async (dealId: string) => {
    if (!selectedUser) { setError('Please select your name to add notes.'); return; }
    const text = newNoteText[dealId]?.trim();
    if (!text) return;
    const creditUser = allUsers.find(u => u.id === selectedUser) || users.find(u => u.id === selectedUser) || currentUser;
    const { error: err } = await supabase.from('daily_deal_notes').insert({
      deal_id: dealId, note_text: text,
      created_by: selectedUser, created_by_name: creditUser.name,
    });
    if (err) return;
    setNewNoteText(prev => ({ ...prev, [dealId]: '' }));
    await fetchNotesForDeals(todayDeals.map(d => d.id));
  };

  const handleUpdateDealNote = async (noteId: string, text: string) => {
    const { error } = await supabase.from('daily_deal_notes').update({ note_text: text }).eq('id', noteId);
    if (!error) await fetchNotesForDeals(todayDeals.map(d => d.id));
  };

  const handleDeleteDealNote = async (noteId: string) => {
    const { error } = await supabase.from('daily_deal_notes').delete().eq('id', noteId);
    if (!error) await fetchNotesForDeals(todayDeals.map(d => d.id));
  };

  const handleUpdatePopupNote = async (noteId: string, text: string) => {
    const { error } = await supabase.from('call_notes').update({ note_text: text }).eq('id', noteId);
    if (!error) {
      setPopupNotes(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(callId => {
          next[callId] = next[callId].map((n: any) =>
            n.id === noteId ? { ...n, note_text: text } : n
          );
        });
        return next;
      });
    }
  };

  const handleDeletePopupNote = async (noteId: string) => {
    const { error } = await supabase.from('call_notes').delete().eq('id', noteId);
    if (!error) {
      setPopupNotes(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(callId => {
          next[callId] = next[callId].filter((n: any) => n.id !== noteId);
        });
        return next;
      });
    }
  };

  const toggleRow = (id: string) => {
    if (editingDeal === id) return;
    const n = new Set(expandedRows);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedRows(n);
  };

  const toggleNotes = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (editingDeal === id) return;
    const n = new Set(expandedRows);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedRows(n);
  };

  const handleCalendarClick = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStr >= today || !datesWithDeals.has(dateStr)) return;
    if (selectedDate === dateStr) { setSelectedDate(null); setSelectedDateDeals([]); return; }
    setSelectedDate(dateStr);
    fetchDealsByDate(dateStr);
  };

  const isToday = (date: Date) => {
    const t = new Date();
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
  };

  const isNewUpload = (call: Call): boolean => {
    if (!call.createdAt) return false;
    return isToday(new Date(call.createdAt));
  };

  // ── KPIs ─────────────────────────────────────────────────────────

  const ddDealCount = todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').length;
  const ddTotalAmount = todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').reduce((s, d) => s + parseAmount(d.amount), 0);
  const callDealsToday = calls.filter(c => {
    if (c.fuStatus !== 'Deal' && c.fuStatus !== 'Confirmed Deal') return false;
    if (!c.dealDate) return false;
    return isSameLocalDate(c.dealDate.toISOString(), today);
  });

  const manualAppIdsToday = new Set(
    todayDeals.map(d => d.appId.trim().toLowerCase()).filter(Boolean),
  );
  const callDealsForToday = callDealsToday.filter(
    c => !manualAppIdsToday.has(c.applicationId.trim().toLowerCase()),
  );

  const callDealCount = callDealsForToday.length;
  const callDealAmount = callDealsForToday.reduce((s, c) => s + parseAmount(c.buyerFinal || '0'), 0);
  const totalDealCount = ddDealCount + callDealCount;
  const totalAmount = ddTotalAmount + callDealAmount;
  const goalPct = goals.team > 0 ? Math.min((totalDealCount / goals.team) * 100, 100) : 0;
  const combinedEntries: CombinedEntry[] = [
    ...todayDeals.map(d => ({
      id: d.id, source: 'manual' as const,
      appId: d.appId, dealerName: d.dealerName, customerName: d.customerName,
      amount: d.amount, state: d.state, fuStatus: d.fuStatus,
      creditName: d.addedByName, creditId: d.addedBy,
      sortTime: new Date(d.createdAt).getTime(),
    })),
    ...callDealsForToday.map(c => ({
      id: c.id, source: 'call' as const,
      appId: c.applicationId, dealerName: c.dealerName, customerName: c.customerName || '—',
      amount: callOverrides[c.id]?.amount ?? (c.buyerFinal || '0'),
      state: c.state,
      fuStatus: callOverrides[c.id]?.fuStatus ?? (c.fuStatus || 'Deal'),
      creditName: c.dealByName || c.assignedToName || 'Unknown',
      creditId: c.dealBy || c.assignedTo,
      sortTime: c.dealDate ? new Date(c.dealDate).getTime() : Date.now(),
    })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  const exportTodayEntries = () => {
    if (combinedEntries.length === 0) return;
    exportRowsToExcel(
      combinedEntries.map(entry => ({
        'App ID': entry.appId,
        Dealer: entry.dealerName,
        Customer: entry.customerName,
        Amount: parseAmount(entry.amount),
        State: entry.state,
        Status: entry.fuStatus,
        Source: entry.source === 'call' ? 'Calls' : 'Manual',
        By: entry.creditName,
      })),
      'Today Entries',
      `daily-deals-today-${today}.xlsx`,
    );
  };

  const exportHistoryDeals = () => {
    if (!selectedDate || selectedDateDeals.length === 0) return;
    exportRowsToExcel(
      selectedDateDeals.map(deal => ({
        'App ID': deal.appId,
        Dealer: deal.dealerName,
        Customer: deal.customerName,
        Amount: parseAmount(deal.amount),
        State: deal.state,
        Status: deal.fuStatus,
        By: deal.addedByName,
        Source: deal.id.startsWith('call-') ? 'Calls' : 'Manual',
      })),
      'History',
      `daily-deals-history-${selectedDate}.xlsx`,
    );
  };

  const leaderboard = (() => {
    const nameMap: { [id: string]: string } = {};
    const roleMap: { [id: string]: string } = {};
    allUsers.forEach(u => { nameMap[u.id] = u.name; roleMap[u.id] = u.role; });
    users.forEach(u => { nameMap[u.id] = u.name; roleMap[u.id] = u.role; });
    const repMap: { [id: string]: { name: string; dealCount: number; amount: number; role: string } } = {};
    Object.entries(nameMap).forEach(([id, name]) => { repMap[id] = { name, dealCount: 0, amount: 0, role: roleMap[id] || 'rep' }; });
    todayDeals.forEach(d => {
      if (d.fuStatus !== 'Deal' && d.fuStatus !== 'Confirmed Deal') return;
      if (!repMap[d.addedBy]) repMap[d.addedBy] = { name: d.addedByName, dealCount: 0, amount: 0, role: roleMap[d.addedBy] || 'rep' };
      repMap[d.addedBy].dealCount++; repMap[d.addedBy].amount += parseAmount(d.amount);
    });
    callDealsForToday.forEach(c => {
      const creditId = c.dealBy || c.assignedTo;
      const creditName = c.dealByName || c.assignedToName || nameMap[creditId || ''] || 'Unknown';
      if (!creditId) return;
      if (!repMap[creditId]) repMap[creditId] = { name: creditName, dealCount: 0, amount: 0, role: roleMap[creditId] || 'rep' };
      repMap[creditId].dealCount++; repMap[creditId].amount += parseAmount(c.buyerFinal || '0');
    });
    return Object.entries(repMap).map(([id, data]) => ({ id, ...data }))
      .filter(r => r.dealCount > 0 || r.role === 'rep')
      .sort((a, b) => b.dealCount - a.dealCount || b.amount - a.amount);
  })();

  const dealerMasterList = useMemo(() => {
    const names = new Set<string>();
    calls.forEach(c => { if (c.dealerName?.trim()) names.add(c.dealerName.trim()); });
    todayDeals.forEach(d => { if (d.dealerName?.trim()) names.add(d.dealerName.trim()); });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [calls, todayDeals]);

  const selectableUsers = useMemo(() => {
    const userMap = new Map<string, User>();
    [...allUsers, ...users, currentUser].forEach(u => userMap.set(u.id, u));
    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, users, currentUser]);

  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const inputCls = 'px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const allDealerCalls = dealerPopup
    ? calls.filter(c => c.dealerName === dealerPopup).sort((a, b) => new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime())
    : [];

  const dealerCalls = showAllPopupStatuses
    ? allDealerCalls
    : allDealerCalls.filter(c => {
        const sl = (c.statusLast || '').toLowerCase();
        const fu = (c.fuStatus || '').toLowerCase();
        if (sl.includes('denial') || sl.includes('declined') || sl.includes('duplicate')) return false;
        if (fu === 'no deal' || fu === 'duplicates') return false;
        return true;
      });

  return (
    <div className="space-y-5">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Daily Deals</h2>
          <p className="text-sm text-gray-400 mt-0.5">{formatDateLabel(today)} &nbsp;·&nbsp; Resets at midnight</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowHistory(true); fetchDatesWithDeals(calendarYear, calendarMonth); }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition">
            📅 View History
          </button>
          <button onClick={() => { navigator.clipboard.writeText('https://dss-portal-delta.vercel.app/deals'); alert('Link copied to clipboard!'); }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded-lg text-sm transition">
            🔗 Share Link
          </button>
          <button onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-green-950/30">
            + Log Deal
          </button>
        </div>
      </div>

      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-lg text-sm">{success}</div>}

      {/* TOP ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="relative overflow-hidden rounded-xl border border-green-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-green-950/25 p-4 shadow-xl shadow-green-950/10">
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-green-500/10 blur-2xl" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Deals Today</p>
                  <p className="mt-2 text-3xl font-bold text-green-300 leading-none">{totalDealCount}</p>
                  {callDealCount > 0 && <p className="mt-2 text-xs text-green-400/80">+{callDealCount} from calls</p>}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/10 text-green-300">
                  <Trophy className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-emerald-950/25 p-4 shadow-xl shadow-emerald-950/10">
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Amount</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-300 leading-none">{formatCurrency(totalAmount)}</p>
                  {callDealAmount > 0 && <p className="mt-2 text-xs text-gray-500">+{formatCurrency(callDealAmount)} from calls</p>}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-cyan-950/25 p-4 shadow-xl shadow-cyan-950/10">
              <div className="relative flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-cyan-300" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Goal</p>
                  </div>
                  <p className="mt-2 text-xl font-bold text-cyan-300 leading-none">
                    {totalDealCount} <span className="text-sm font-normal text-gray-500">/ {goals.team}</span>
                  </p>
                </div>
                <Target className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all" style={{ width: `${goalPct}%` }} />
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-gray-800 via-gray-800 to-blue-950/25 p-4 shadow-xl shadow-blue-950/10">
              <div className="relative flex items-start justify-between">
                <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Entries</p>
                  <p className="mt-2 text-3xl font-bold text-blue-300 leading-none">{combinedEntries.length}</p>
                  <p className="mt-2 text-xs text-gray-500">all sources</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
                  <ClipboardList className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          {/* FORM */}
          <div className="bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-xl border border-gray-700 overflow-hidden shadow-xl shadow-black/10">
            <button onClick={() => setShowForm(f => !f)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/60 transition border-b border-gray-700">
              <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-500/30 bg-green-500/10 text-green-300">
                  <PlusCircle className="h-4 w-4" />
                </span>
                Log a deal
              </span>
              <span className="text-gray-400">{showForm ? '▲' : '▼'}</span>
            </button>
            {showForm && (
              <div className="p-5">
                {formError && <div className="bg-red-900 border border-red-700 text-red-200 px-3 py-2 rounded text-sm mb-4">{formError}</div>}

                {/* Search — only when no call linked */}
                {!linkedCall && (
                  <div className="bg-gray-900/40 border border-gray-700 rounded-xl p-4 mb-4">
                    <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Search existing app first</label>
                    <div className="flex gap-2">
                      <input type="text" value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults([]); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                        placeholder="Type App ID to search…"
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">Search</button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {searchResults.map(call => (
                          <div key={call.id} className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded-lg border border-gray-600">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm text-blue-400 font-medium">{call.applicationId}</span>
                              <button
                                onClick={() => openDealerPopup(call.dealerName)}
                                className="text-xs text-gray-300 hover:text-blue-300 underline underline-offset-2 transition"
                                title={`View all calls for ${call.dealerName}`}>
                                {call.dealerName}
                              </button>
                              <span className="text-xs text-gray-500">{call.state}</span>
                              <span className="text-xs text-gray-400">{formatCurrency(parseAmount(call.buyerFinal))}</span>
                              {call.customerName && <span className="text-xs text-gray-400 italic">{call.customerName}</span>}
                            </div>
                            <button onClick={() => handleSelectCall(call)}
                              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex-shrink-0">
                              Use this app →
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.length === 0 && searchQuery && (
                      <p className="text-xs text-gray-500 mt-2">No match in search — you can enter a new App ID below only if it is not already in Calls.</p>
                    )}
                  </div>
                )}

                {appIdConflicts.length > 0 && !linkedCall && (
                  <div className="mb-4 rounded-xl border border-amber-700/70 bg-amber-950/40 px-4 py-3">
                    <p className="text-sm font-medium text-amber-200">
                      This App ID already exists in Calls. Manual entry is blocked — select the existing app to avoid duplicates.
                    </p>
                    <div className="mt-2 space-y-1">
                      {appIdConflicts.map(call => (
                        <div key={call.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/80 rounded-lg border border-amber-800/50">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-blue-400 font-medium">{call.applicationId}</span>
                            <span className="text-xs text-gray-300">{call.dealerName}</span>
                            <span className="text-xs text-gray-500">{call.state}</span>
                            {call.customerName && <span className="text-xs text-gray-400 italic">{call.customerName}</span>}
                          </div>
                          <button onClick={() => handleSelectCall(call)}
                            className="text-xs px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex-shrink-0">
                            Use this app →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {checkingAppId && !linkedCall && form.appId.trim() && (
                  <p className="text-xs text-gray-500 mb-4">Checking App ID against Calls…</p>
                )}

                <div className="mb-4">
                  <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Your name *</label>
                  <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select your name…</option>
                    {selectableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                {/* COMPACT FORM when call linked */}
                {linkedCall ? (
                  <div className="border border-blue-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-900 bg-opacity-20 border-b border-blue-800">
                      <div>
                        <span className="text-sm font-medium text-blue-400">{linkedCall.applicationId}</span>
                        <span className="text-xs text-gray-400 ml-2">·</span>
                        <span className="text-xs text-gray-300 ml-2">{linkedCall.dealerName}</span>
                        <span className="text-xs text-gray-500 ml-2">· {formatCurrency(parseAmount(linkedCall.buyerFinal))} · {linkedCall.state}</span>
                      </div>
                      <button onClick={clearLinkedCall} className="text-gray-500 hover:text-gray-300 transition"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Customer name <span className="text-gray-600 normal-case">(optional)</span></label>
                          <input type="text" value={form.customerName}
                            onChange={e => setForm({ ...form, customerName: e.target.value })}
                            placeholder="Leave blank if unknown"
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">FU Status *</label>
                          <select value={form.fuStatus} onChange={e => setForm({ ...form, fuStatus: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button onClick={handleAddDeal}
                            className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-green-950/30">
                            Log Deal
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">App ID *</label>
                        <input type="text" value={form.appId} onChange={e => setForm({ ...form, appId: e.target.value })}
                          placeholder="e.g. DTBFE001"
                          className={`w-full px-3 py-2 bg-gray-700 border rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${appIdConflicts.length > 0 ? 'border-amber-600' : 'border-gray-600'}`} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Dealer *</label>
                        <DealerNameInput
                          value={form.dealerName}
                          onChange={(dealerName) => setForm({ ...form, dealerName })}
                          suggestions={dealerMasterList}
                          placeholder="Dealer name"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Customer *</label>
                        <input type="text" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
                          placeholder="Customer name"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </div>
                    {softMatches.length > 0 && appIdConflicts.length === 0 && (
                      <div className="mb-3 rounded-xl border border-sky-700/70 bg-sky-950/30 px-4 py-3">
                        <p className="text-sm font-medium text-sky-200">
                          Possible match: same dealer &amp; customer, different App ID. This may be the same deal — link it, or continue as a new Manual entry.
                        </p>
                        <div className="mt-2 space-y-1">
                          {softMatches.map(call => (
                            <div key={call.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/80 rounded-lg border border-sky-800/50">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-sm text-blue-400 font-medium">{call.applicationId}</span>
                                <span className="text-xs text-gray-300">{call.dealerName}</span>
                                <span className="text-xs text-gray-500">{call.state}</span>
                                {call.customerName && <span className="text-xs text-gray-400 italic">{call.customerName}</span>}
                              </div>
                              <button onClick={() => handleSelectCall(call)}
                                className="text-xs px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition flex-shrink-0">
                                Use this app →
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-sky-300/80 mt-2">Add Deal stays available if this is truly a different deal.</p>
                      </div>
                    )}
                    {checkingSoftMatch && appIdConflicts.length === 0 && form.dealerName.trim() && form.customerName.trim() && (
                      <p className="text-xs text-gray-500 mb-3">Checking dealer + customer for possible matches…</p>
                    )}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Amount *</label>
                        <input type="text" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                          placeholder="$0"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">State *</label>
                        <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
                          placeholder="IL" maxLength={2}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">FU Status *</label>
                        <select value={form.fuStatus} onChange={e => setForm({ ...form, fuStatus: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                          {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button onClick={handleAddDeal}
                          disabled={appIdConflicts.length > 0 || checkingAppId}
                          className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition shadow-lg shadow-green-950/30">
                          Add Deal
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Counts toward today's goal only. Expand each row to add notes.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl border border-gray-700 overflow-hidden shadow-xl shadow-black/10">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
                  <Trophy className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-gray-200">Today's Rankings</p>
              </div>
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-semibold text-gray-400">{leaderboard.length}</span>
          </div>
            <div className="divide-y divide-gray-700/70">
            {leaderboard.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No entries yet today</p>
            ) : leaderboard.map((rep, idx) => {
              const m = medal(idx);
              const isMe = rep.id === selectedUser;
              return (
                <div key={rep.id} className={`flex items-center gap-3 px-4 py-3 transition ${isMe ? 'bg-blue-900/20 ring-1 ring-inset ring-blue-500/20' : 'hover:bg-gray-750'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${idx < 3 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-gray-700 text-gray-400'}`}>
                    {m || <span className="text-xs text-gray-400 font-medium">{idx + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isMe ? 'text-blue-300' : 'text-gray-200'}`}>
                      {rep.name}{isMe && <span className="ml-1 text-xs text-blue-400 font-normal">(you)</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {rep.amount > 0 ? formatCurrency(rep.amount) : <span className="italic">no deals yet</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-bold leading-none ${rep.dealCount > 0 ? 'text-green-400' : 'text-gray-600'}`}>{rep.dealCount}</p>
                    <p className="text-xs text-gray-500 mt-0.5">deals</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TODAY'S ENTRIES */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-300" />
            Today's entries
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={exportTodayEntries}
              disabled={combinedEntries.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-700 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-40 transition"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <span className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-400">{combinedEntries.length} total</span>
          </div>
        </div>
        {loading ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-400">Loading...</div>
        ) : combinedEntries.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-10 text-center">
            <p className="text-base font-medium text-gray-400">No deals logged yet today.</p>
            <p className="text-sm text-gray-500 mt-1">Use the form above to log the first deal.</p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-xl border border-gray-700 overflow-x-auto shadow-xl shadow-black/10">
            <table className="w-full">
              <thead className="bg-gray-950/60">
                <tr className="border-b border-gray-700">
                  <th className="w-8 px-3 py-3"></th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">App ID</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Dealer</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">By</th>
                  <th className="w-8 px-3 py-3"></th>
                  <th className="w-16 px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/80">
                {combinedEntries.map(entry => {
                  const isExpanded = expandedRows.has(entry.id);
                  const isEditing = editingDeal === entry.id;
                  const notes = entry.source === 'manual' ? (dealNotes[entry.id] || []) : [];
                  const manualDeal = entry.source === 'manual' ? todayDeals.find(d => d.id === entry.id) : null;
                  const canDelete = entry.source === 'manual' && manualDeal &&
                    (currentUser.role === 'admin' || currentUser.role === 'manager' || manualDeal.addedBy === currentUser.id);
                  return (
                    <>
                      <tr key={entry.id}
                        className={`hover:bg-gray-750 transition-colors odd:bg-gray-900/10 ${!isEditing && entry.source === 'manual' ? 'cursor-pointer' : ''}`}
                        onClick={() => { if (!isEditing && entry.source === 'manual') toggleRow(entry.id); }}>
                        <td className="px-3 py-3 text-center">
                          {entry.source === 'manual' && (isExpanded
                            ? <ChevronDown className="w-4 h-4 text-blue-400 mx-auto" />
                            : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />)}
                        </td>
                        <td className="px-3 py-3 text-sm text-blue-400 font-medium">{entry.appId}</td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openDealerPopup(entry.dealerName)}
                            className="text-sm text-left hover:text-blue-300 transition text-gray-200 max-w-[150px] truncate"
                            title={`View all calls for ${entry.dealerName}`}>
                            {entry.dealerName}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-400">{entry.customerName}</td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isEditing ? (
                            <input value={editAmount} onChange={e => setEditAmount(e.target.value)} className={`${inputCls} w-24`} />
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-gray-100">{formatCurrency(parseAmount(entry.amount))}</span>
                              <button onClick={() => startEditing(entry)} className="text-gray-600 hover:text-gray-400 transition"><Edit2 className="w-3 h-3" /></button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isEditing && entry.source === 'manual'
                            ? <input value={editState} onChange={e => setEditState(e.target.value.toUpperCase())} maxLength={2} className={`${inputCls} w-14`} />
                            : <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">{entry.state}</span>}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isEditing
                            ? <select value={editFuStatus} onChange={e => setEditFuStatus(e.target.value)} className={inputCls}>
                                {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            : <span className={`px-2.5 py-1 rounded-full text-xs border ${getFuStatusStyle(entry.fuStatus)}`}>{entry.fuStatus}</span>}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${entry.source === 'call' ? 'bg-purple-900 text-purple-300 border border-purple-700' : 'bg-gray-700 text-gray-400 border border-gray-600'}`}>
                            {entry.source === 'call' ? 'Calls' : 'Manual'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-400">{entry.creditName}</td>
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          {entry.source === 'manual' && (
                            <button onClick={e => toggleNotes(e, entry.id)} title="Notes"
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition ${notes.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-indigo-900 text-indigo-400 hover:bg-indigo-700 hover:text-white'}`}>
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleUpdateCombined(entry)} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingDeal(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                            </div>
                          ) : canDelete && manualDeal ? (
                            <button onClick={() => handleDeleteDeal(manualDeal)} className="text-gray-600 hover:text-red-400 transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {isExpanded && !isEditing && entry.source === 'manual' && (
                        <tr key={`${entry.id}-exp`}>
                          <td colSpan={11} className="px-4 py-4 pl-12 bg-gray-750">
                            <div className="space-y-3 max-w-2xl">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Notes ({notes.length})</p>
                              {notes.length === 0 ? <p className="text-sm text-gray-500 italic">No notes yet.</p> : (
                                <div className="space-y-2">
                                  {notes.map(note => (
                                    <NoteItem
                                      key={note.id}
                                      id={note.id}
                                      noteText={note.noteText}
                                      createdByName={note.createdByName}
                                      createdAt={note.createdAt}
                                      canEdit={!!selectedUser && note.createdBy === selectedUser}
                                      onUpdate={handleUpdateDealNote}
                                      onDelete={handleDeleteDealNote}
                                    />
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <input type="text" placeholder={selectedUser ? 'Add a note...' : 'Select your name above to add a note...'}
                                  value={newNoteText[entry.id] || ''}
                                  onChange={e => setNewNoteText(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleAddNote(entry.id); }}
                                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  autoFocus />
                                <button onClick={() => handleAddNote(entry.id)}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">Save</button>
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

      {/* DEALER POPUP — fully editable */}
      {dealerPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-10 z-50 px-4"
          onClick={closeDealerPopup}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-5xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-gray-100">{dealerPopup}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {dealerCalls.length} call{dealerCalls.length !== 1 ? 's' : ''}
                    {!showAllPopupStatuses && allDealerCalls.length !== dealerCalls.length && (
                      <span className="text-gray-600"> · {allDealerCalls.length - dealerCalls.length} hidden</span>
                    )}
                    · press Escape to close
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowAllPopupStatuses(f => !f)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      showAllPopupStatuses
                        ? 'bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-600'
                        : 'bg-blue-900 bg-opacity-40 border-blue-700 text-blue-300 hover:bg-opacity-60'
                    }`}>
                    {showAllPopupStatuses ? 'Showing all' : 'Active only'}
                  </button>
                  <button onClick={closeDealerPopup} className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
                </div>
              </div>
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '24px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '115px' }} />
                        <col style={{ width: '72px' }} />
                        <col style={{ width: '38px' }} />
                        <col style={{ width: '62px' }} />
                        <col style={{ width: '108px' }} />
                        <col style={{ width: '105px' }} />
                        <col style={{ width: '38px' }} />
                        <col style={{ width: '30px' }} />
                      </colgroup>
                    <thead className="bg-gray-750 sticky top-0 z-10">
                      <tr className="border-b border-gray-700">
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">App ID</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">St</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status Last</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">FU Status</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Notes</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                <tbody className="divide-y divide-gray-700">
                  {dealerCalls.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No calls found for this dealer</td></tr>
                  ) : dealerCalls.map(call => {
                    const isNew = isNewUpload(call);
                    const callNotes = popupNotes[call.id] || [];
                    const isExpanded = popupExpandedNotes.has(call.id);
                    const fuStatus = popupFuOverrides[call.id] ?? (call.fuStatus || '');
                    const statusLast = popupStatusLastOverrides[call.id] ?? call.statusLast;
                    const amount = popupAmountOverrides[call.id] ?? call.buyerFinal;

                    return (
                      <>
                        <tr key={call.id}
                          className={`transition-colors ${isNew ? 'bg-amber-950 border-l-2 border-l-amber-500 hover:bg-amber-900 hover:bg-opacity-20' : 'hover:bg-gray-750'}`}>
                          <td className="px-3 py-3 text-center cursor-pointer" onClick={() => togglePopupNotes(call.id)}>
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-blue-400 mx-auto" />
                              : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />}
                          </td>

                          {/* App ID */}
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs text-blue-400 font-medium cursor-pointer hover:underline truncate"
                                onClick={() => navigator.clipboard.writeText(call.applicationId)}
                                title="Click to copy">
                                {call.applicationId}
                              </span>
                              {isNew && <span className="px-1 bg-amber-900 text-amber-300 text-[9px] rounded border border-amber-700 font-medium flex-shrink-0">NEW</span>}
                            </div>
                          </td>

                          {/* Customer */}
                          <td className="px-2 py-2">
                            {call.customerName
                              ? <span className="text-xs text-gray-400 truncate block" title={call.customerName}>{call.customerName}</span>
                              : <span className="text-xs text-gray-600">—</span>}
                          </td>

                          {/* Amount */}
                          <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                          {popupEditingAmount === call.id ? (
                              <div className="flex items-center gap-1">
                                <input type="text" value={popupTempAmount} onChange={e => setPopupTempAmount(e.target.value)}
                                  className="w-14 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none" autoFocus />
                                <button onClick={() => handlePopupSaveAmount(call.id)} className="text-green-400 hover:text-green-300"><Check className="w-3 h-3" /></button>
                                <button onClick={() => setPopupEditingAmount(null)} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-gray-100">{formatCurrency(parseAmount(amount))}</span>
                                <button onClick={() => { setPopupEditingAmount(call.id); setPopupTempAmount(amount); }}
                                  className="text-gray-600 hover:text-gray-400 transition"><Edit2 className="w-2.5 h-2.5" /></button>
                              </div>
                            )}
                          </td>

                          {/* State */}
                          <td className="px-2 py-2">
                            <span className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[10px] rounded border border-gray-600">{call.state}</span>
                          </td>

                          {/* Date */}
                          <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{call.submittedDate}</td>

                          {/* Status Last */}
                          <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                            {popupEditingStatusLast === call.id ? (
                              <div className="flex items-center gap-1">
                                <select value={popupTempStatusLast} onChange={e => setPopupTempStatusLast(e.target.value)}
                                  className="px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none" autoFocus>
                                  {STATUS_LAST_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button onClick={() => handlePopupSaveStatusLast(call.id)} className="text-green-400 hover:text-green-300"><Check className="w-3 h-3" /></button>
                                <button onClick={() => setPopupEditingStatusLast(null)} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className={`px-1.5 py-0 rounded-full text-[10px] border truncate ${getStatusLastStyle(statusLast)}`}>{statusLast}</span>
                                <button onClick={() => { setPopupEditingStatusLast(call.id); setPopupTempStatusLast(statusLast); }}
                                  className="text-gray-600 hover:text-gray-400 transition flex-shrink-0"><Edit2 className="w-2.5 h-2.5" /></button>
                              </div>
                            )}
                          </td>

                          {/* FU Status */}
                          <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                            <select value={fuStatus}
                              onChange={e => handlePopupFuStatus(call.id, e.target.value)}
                              className="px-1.5 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full">
                              <option value="">Select…</option>
                              <option>Deal</option><option>No Deal</option>
                              <option>Pending</option><option>No Answer</option><option>Duplicates</option>
                              <option>Follow Up</option>
                            </select>
                          </td>

                          {/* Notes count */}
                          <td className="px-2 py-2">
                            {callNotes.length > 0 && (
                              <div className="flex items-center gap-1 text-blue-400">
                                <MessageSquare className="w-3 h-3" />
                                <span className="text-[10px] font-bold">{callNotes.length}</span>
                              </div>
                            )}
                          </td>

                          {/* Note button */}
                          <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                            <button onClick={() => togglePopupNotes(call.id)}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded transition ${callNotes.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-indigo-900 text-indigo-400 hover:bg-indigo-700 hover:text-white'}`}>
                              <MessageSquare className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded notes */}
                        {isExpanded && (
                          <tr key={`${call.id}-popup-notes`}>
                          <td colSpan={10} className="px-3 py-2 pl-8 bg-gray-750">
                              <div className="space-y-3 max-w-2xl">
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Notes ({callNotes.length})</p>
                                {callNotes.length === 0 ? <p className="text-sm text-gray-500 italic">No notes yet.</p> : (
                                  <div className="space-y-2">
                                    {callNotes.map((note: any) => (
                                      <NoteItem
                                        key={note.id}
                                        id={note.id}
                                        noteText={note.note_text}
                                        createdByName={note.created_by_name}
                                        createdAt={note.created_at}
                                        canEdit={!!selectedUser && note.created_by === selectedUser}
                                        onUpdate={handleUpdatePopupNote}
                                        onDelete={handleDeletePopupNote}
                                      />
                                    ))}
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <input type="text" placeholder="Add a note…"
                                    value={popupNewNoteText[call.id] || ''}
                                    onChange={e => setPopupNewNoteText(prev => ({ ...prev, [call.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handlePopupAddNote(call.id); }}
                                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    autoFocus />
                                  <button onClick={() => handlePopupAddNote(call.id)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">Save</button>
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
            <div className="px-6 py-3 border-t border-gray-700 flex items-center justify-between">
              <p className="text-xs text-gray-500">Press Escape to close · Click dealer name to copy App ID</p>
              {dealerCalls.some(c => isNewUpload(c)) && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-xs text-amber-300">Amber = uploaded today</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center pt-16 z-50 px-4"
          onClick={() => { setShowHistory(false); setSelectedDate(null); setSelectedDateDeals([]); }}>
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
              <h3 className="text-lg font-semibold text-gray-100">Deal History</h3>
              <button onClick={() => { setShowHistory(false); setSelectedDate(null); setSelectedDateDeals([]); }}
                className="text-gray-400 hover:text-gray-200 text-2xl font-light">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); } else setCalendarMonth(m => m - 1); }}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">‹</button>
                <span className="text-base font-medium text-gray-100">{monthNames[calendarMonth]} {calendarYear}</span>
                <button onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); } else setCalendarMonth(m => m + 1); }}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center text-xs text-gray-500 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isTodayDate = dateStr === today;
                  const isFuture = dateStr > today;
                  const hasDeals = datesWithDeals.has(dateStr);
                  const isSelected = selectedDate === dateStr;
                  let cls = 'relative text-center text-sm py-2 rounded-lg transition font-normal ';
                  if (isTodayDate) cls += 'bg-blue-600 text-white font-medium';
                  else if (isFuture) cls += 'text-gray-600';
                  else if (isSelected) cls += 'bg-blue-900 border border-blue-500 text-blue-300 cursor-pointer';
                  else if (hasDeals) cls += 'bg-green-900 text-green-300 hover:bg-green-800 cursor-pointer font-medium';
                  else cls += 'text-gray-500';
                  return (
                    <div key={i} className={cls} onClick={() => handleCalendarClick(day)}>
                      {day}
                      {hasDeals && !isTodayDate && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-400 block" />}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-5 mb-4 pb-4 border-b border-gray-700">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-green-400" /><span className="text-xs text-gray-400">Has entries</span></div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-xs text-gray-400">Today</span></div>
              </div>
              {selectedDate && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-200">{formatDateLabel(selectedDate)} — {selectedDateDeals.length} deal{selectedDateDeals.length !== 1 ? 's' : ''}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={exportHistoryDeals}
                        disabled={selectedDateDeals.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-700 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-40 transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export
                      </button>
                      <button onClick={() => { setSelectedDate(null); setSelectedDateDeals([]); }} className="text-xs text-gray-400 hover:text-gray-200">clear</button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-700 overflow-hidden max-h-[45vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-700 sticky top-0 z-10">
                        <tr>{['App ID','Dealer','Customer','Amount','State','Status','By'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700 bg-gray-800">
                        {selectedDateDeals.map(deal => (
                          <tr key={deal.id} className="hover:bg-gray-750">
                            <td className="px-3 py-2.5 text-blue-400 font-medium">
                              {deal.appId}
                              {deal.id.startsWith('call-') && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800">Calls</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-200">{deal.dealerName}</td>
                            <td className="px-3 py-2.5 text-gray-200">{deal.customerName}</td>
                            <td className="px-3 py-2.5 font-medium text-gray-100">{formatCurrency(parseAmount(deal.amount))}</td>
                            <td className="px-3 py-2.5"><span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">{deal.state}</span></td>
                            <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs border ${getFuStatusStyle(deal.fuStatus)}`}>{deal.fuStatus}</span></td>
                            <td className="px-3 py-2.5 text-gray-400">{deal.addedByName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}