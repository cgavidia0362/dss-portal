import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface DailyDeal {
  id: string;
  appId: string;
  dealerName: string;
  customerName: string;
  amount: string;
  state: string;
  fuStatus: string;
  addedByName: string;
  createdAt: string;
}

interface RepUser {
  id: string;
  name: string;
}

const FU_STATUSES = ['Deal', 'Confirmed Deal', 'Pending', 'No Answer', 'No Deal'];

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const parseAmount = (str: string) =>
  parseFloat((str || '0').replace(/[^0-9.-]+/g, '')) || 0;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const getFuStatusStyle = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('confirmed')) return 'bg-emerald-900 text-emerald-300 border-emerald-700';
  if (s.includes('deal')) return 'bg-green-900 text-green-300 border-green-700';
  if (s.includes('pending')) return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  if (s.includes('no answer')) return 'bg-orange-900 text-orange-300 border-orange-700';
  if (s.includes('no deal')) return 'bg-red-900 text-red-300 border-red-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
};

export default function PublicDealsPage() {
  const today = getTodayString();

  const [users, setUsers] = useState<RepUser[]>([]);
  const [todayDeals, setTodayDeals] = useState<DailyDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [selectedUser, setSelectedUser] = useState('');
  const [form, setForm] = useState({
    appId: '', dealerName: '', customerName: '',
    amount: '', state: '', fuStatus: 'Deal',
  });

  useEffect(() => {
    fetchUsers();
    fetchTodayDeals();

    const channel = supabase
      .channel('public_deals_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_deals' }, () => {
        fetchTodayDeals();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setUsers(data.map((u: any) => ({ id: u.id, name: u.name })));
  };

  const fetchTodayDeals = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_deals')
      .select('*')
      .eq('deal_date', today)
      .order('created_at', { ascending: false });
    if (data) {
      setTodayDeals(data.map((d: any) => ({
        id: d.id,
        appId: d.app_id,
        dealerName: d.dealer_name,
        customerName: d.customer_name,
        amount: d.amount,
        state: d.state,
        fuStatus: d.fu_status,
        addedByName: d.added_by_name,
        createdAt: d.created_at,
      })));
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!selectedUser) { setError('Please select your name.'); return; }
    if (!form.appId || !form.dealerName || !form.customerName || !form.amount || !form.state) {
      setError('All fields are required.'); return;
    }
    setError('');
    setSubmitting(true);
    try {
      const user = users.find(u => u.id === selectedUser);
      const { error: err } = await supabase.from('daily_deals').insert({
        app_id: form.appId.trim(),
        dealer_name: form.dealerName.trim(),
        customer_name: form.customerName.trim(),
        amount: form.amount.trim(),
        state: form.state.trim().toUpperCase(),
        fu_status: form.fuStatus,
        added_by: selectedUser,
        added_by_name: user?.name || 'Unknown',
        deal_date: today,
      });
      if (err) throw err;
      setSuccess(`Deal logged successfully for ${user?.name}!`);
      setForm({ appId: '', dealerName: '', customerName: '', amount: '', state: '', fuStatus: 'Deal' });
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError('Failed to log deal: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // KPIs
  const dealCount = todayDeals.filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal').length;
  const totalAmount = todayDeals
    .filter(d => d.fuStatus === 'Deal' || d.fuStatus === 'Confirmed Deal')
    .reduce((s, d) => s + parseAmount(d.amount), 0);

  return (
    <div className="min-h-screen bg-gray-900">

      {/* HEADER */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-blue-400">DSS Portal</h1>
            <span className="text-xs text-gray-500 bg-gray-700 px-2.5 py-1 rounded-full border border-gray-600">
              Daily Deals
            </span>
          </div>
          <span className="text-xs text-gray-500">{formatDateLabel(today)}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* KPI CARDS */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Deals Today</p>
            <p className="text-3xl font-bold text-green-400">{dealCount}</p>
            <p className="text-xs text-gray-500 mt-1">team total</p>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Amount</p>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-gray-500 mt-1">deals only</p>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Entries</p>
            <p className="text-3xl font-bold text-blue-400">{todayDeals.length}</p>
            <p className="text-xs text-gray-500 mt-1">all statuses</p>
          </div>
        </div>

        {/* FORM */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-gray-200">Log a deal</h2>
          </div>
          <div className="p-5 space-y-4">

            {success && (
              <div className="bg-green-900 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}
            {error && (
              <div className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Name selector */}
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Your name *</label>
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select your name…</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Row 1 */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">App ID *</label>
                <input
                  type="text"
                  value={form.appId}
                  onChange={e => setForm({ ...form, appId: e.target.value })}
                  placeholder="e.g. DTBFE001"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Dealer *</label>
                <input
                  type="text"
                  value={form.dealerName}
                  onChange={e => setForm({ ...form, dealerName: e.target.value })}
                  placeholder="Dealer name"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Customer *</label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={e => setForm({ ...form, customerName: e.target.value })}
                  placeholder="Customer name"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Amount *</label>
                <input
                  type="text"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="$0"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">State *</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
                  placeholder="IL"
                  maxLength={2}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">FU Status *</label>
                <select
                  value={form.fuStatus}
                  onChange={e => setForm({ ...form, fuStatus: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {FU_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition"
                >
                  {submitting ? 'Saving…' : 'Add Deal'}
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500">Counts toward today's team goal. Resets at midnight.</p>
          </div>
        </div>

        {/* TODAY'S ENTRIES */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-200">Today's entries</h2>
            <span className="text-xs text-gray-500">{todayDeals.length} total</span>
          </div>

          {loading ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-500 text-sm">
              Loading…
            </div>
          ) : todayDeals.length === 0 ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-10 text-center">
              <p className="text-sm text-gray-400">No deals logged yet today.</p>
              <p className="text-xs text-gray-500 mt-1">Be the first to log one above.</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">App ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Dealer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {todayDeals.map(deal => (
                      <tr key={deal.id} className="hover:bg-gray-750 transition-colors">
                        <td className="px-4 py-3 text-sm text-blue-400 font-medium">{deal.appId}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{deal.dealerName}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{deal.customerName}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-100">{deal.amount}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">
                            {deal.state}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs border ${getFuStatusStyle(deal.fuStatus)}`}>
                            {deal.fuStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">{deal.addedByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}