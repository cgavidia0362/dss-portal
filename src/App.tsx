import { useState, useEffect } from 'react';
import { BarChart3, Upload, Users, FileText, UserCog, LogOut, TrendingUp, StickyNote } from 'lucide-react';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import CallsTab from './pages/CallsTab';
import UploadTab from './pages/UploadTab';
import AssignTab from './pages/AssignTab';
import ReportingTab from './pages/ReportingTab';
import UserManagementTab from './pages/UserManagementTab';
import AnalyticsTab from './pages/AnalyticsTab';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DailyDealsTab from './pages/DailyDealsTab';
import NotesTab from './pages/NotesTab';

interface Dealer {
  cifNumber: string;
  name: string;
  state: string;
  createdAt: Date;
}

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
  isDuplicate?: boolean;
}

interface CallNote {
  id: string;
  callId: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
  active: boolean;
  allowedStatuses: string[];
  state?: string;
}

interface Goals {
  daily: { [repId: string]: number };
  team: number;
  weekly: number;
  monthly: number;
}

interface FundingData {
  [state: string]: {
    count: number;
    totalAmount: number;
  };
}

export interface DailyDealSummary {
  id: string;
  addedBy: string;
  fuStatus: string;
  dealDate: string;
  amount: string;
  state: string;
}

// Check for password recovery URL synchronously — before React mounts
const isRecoveryUrl = (() => {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const urlParams = new URLSearchParams(window.location.search);
  return (
    hashParams.get('type') === 'recovery' ||
    urlParams.get('type') === 'recovery'
  );
})();

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(!isRecoveryUrl);
  const [showPasswordReset, setShowPasswordReset] = useState(isRecoveryUrl);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [activeTab, setActiveTab] = useState('calls');
  const [calls, setCalls] = useState<Call[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [goals, setGoals] = useState<Goals>({
    daily: {},
    team: 30,
    weekly: 50,
    monthly: 200,
  });

  const [fundingData, setFundingData] = useState<FundingData>({});
  const [todayDailyDeals, setTodayDailyDeals] = useState<DailyDealSummary[]>([]);

  // ── AUTH ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecoveryUrl) return; // Already showing reset page, skip auth check
    checkAuth();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
        setIsLoading(false);
      } else if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setIsLoading(false);
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  // Reset to calls tab if current tab isn't allowed for this role
  useEffect(() => {
    if (!currentUser) return;
    const allowed = getVisibleTabs(currentUser.role).map(t => t.id);
    if (!allowed.includes(activeTab)) setActiveTab('calls');
  }, [currentUser?.role]);

  // Load all data on login
  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
      fetchTodayDailyDeals();
      fetchCallNotes();
      fetchCalls();
      fetchFundingData();
      fetchTeamGoals();
    }
  }, [isAuthenticated]);

  // Real-time subscription for daily deals
  useEffect(() => {
    if (!isAuthenticated) return;
    const channel = supabase
      .channel('app_daily_deals_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_deals' }, () => {
        fetchTodayDailyDeals();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated]);

  // ── AUTH HELPERS ──────────────────────────────────────────────────
  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  };

  const loadUserProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      if (profile) {
        setCurrentUser({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role as 'admin' | 'manager' | 'rep' | 'buying_assistant',
          active: profile.active,
          allowedStatuses: profile.allowed_statuses || [],
          state: profile.state || undefined,
        });
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Profile load error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // ── DATA FETCHERS ─────────────────────────────────────────────────
  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('active', true).order('name');
      if (error) throw error;
      if (data) {
        setUsers(data.map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as 'admin' | 'manager' | 'rep' | 'buying_assistant',
          active: user.active,
          allowedStatuses: user.allowed_statuses || [],
          state: user.state || undefined,
        })));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchTodayDailyDeals = async () => {
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const { data } = await supabase
        .from('daily_deals')
        .select('id, added_by, fu_status, deal_date, amount, state')
        .eq('deal_date', today);
      if (data) {
        setTodayDailyDeals(data.map((d: any) => ({
          id: d.id,
          addedBy: d.added_by,
          fuStatus: d.fu_status,
          dealDate: d.deal_date,
          amount: d.amount || '0',
          state: d.state || '',
        })));
      }
    } catch (err) {
      console.error('Error fetching daily deals summary:', err);
    }
  };

  const fetchCallNotes = async () => {
    try {
      const { data } = await supabase
        .from('call_notes').select('*')
        .order('created_at', { ascending: true });
      if (data) {
        setNotes(data.map((n: any) => ({
          id: n.id,
          callId: n.call_id,
          noteText: n.note_text,
          createdBy: n.created_by,
          createdByName: n.created_by_name,
          createdAt: new Date(n.created_at),
        })));
      }
    } catch (err) {
      console.error('Error fetching call notes:', err);
    }
  };

  const fetchCalls = async () => {
    try {
      const { data } = await supabase
        .from('calls')
        .select('*')
        .order('timestamp_submit', { ascending: false });
      if (data && data.length > 0) {
        setCalls(data.map((c: any) => ({
          id: c.id,
          applicationId: c.application_id,
          dealerCifNumber: c.dealer_cif_number || '',
          dealerName: c.dealer_name || '',
          state: c.state || '',
          buyerFinal: c.buyer_final || '0',
          statusLast: c.status_last || '',
          timestampSubmit: new Date(c.timestamp_submit),
          submittedDate: c.submitted_date || '',
          assignedTo: c.assigned_to || undefined,
          assignedToName: c.assigned_to_name || undefined,
          fuStatus: c.fu_status || undefined,
          fiType: c.fi_type || undefined,
          updatedAt: new Date(c.updated_at),
          dealDate: c.deal_date ? new Date(c.deal_date) : undefined,
          isDuplicate: c.is_duplicate || false,
          dealBy: c.deal_by || undefined,
          dealByName: c.deal_by_name || undefined,
        })));
      }
    } catch (err) {
      console.error('Error fetching calls:', err);
    }
  };

  const fetchFundingData = async () => {
    try {
      const { data } = await supabase.from('funding_data').select('*');
      if (data && data.length > 0) {
        const fd: FundingData = {};
        data.forEach((row: any) => {
          fd[row.state] = { count: row.count, totalAmount: row.total_amount };
        });
        setFundingData(fd);
      }
    } catch (err) {
      console.error('Error fetching funding data:', err);
    }
  };

  const fetchTeamGoals = async () => {
    try {
      const { data } = await supabase
        .from('team_goals').select('*').eq('id', 1).single();
      if (data) {
        setGoals(prev => ({
          ...prev,
          team: data.team_daily || 30,
          weekly: data.team_weekly || 50,
          monthly: data.team_monthly || 200,
          daily: data.rep_daily_goals || {},
        }));
      }
    } catch {
      // Use defaults if no row saved yet
    }
  };

  // ── HANDLERS ──────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setCurrentUser(null);
      setCalls([]);
      setNotes([]);
      setFundingData({});
      setTodayDailyDeals([]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleLoginSuccess = () => { checkAuth(); };

  // ── TAB VISIBILITY ────────────────────────────────────────────────
  const getVisibleTabs = (role: string) => {
    const allTabs = [
      { id: 'calls', label: 'Calls', icon: FileText },
      { id: 'upload', label: 'Upload', icon: Upload },
      { id: 'assign', label: 'Assign', icon: Users },
      { id: 'reporting', label: 'Reporting', icon: BarChart3 },
      { id: 'users', label: 'Users', icon: UserCog },
      { id: 'analytics', label: 'Analytics', icon: TrendingUp },
      { id: 'daily-deals', label: 'Daily Deals', icon: TrendingUp },
      { id: 'notes', label: 'Notes', icon: StickyNote },
    ];
    if (role === 'admin') return allTabs.filter(t => t.id !== 'analytics');
    if (role === 'manager') return allTabs.filter(t => t.id !== 'users' && t.id !== 'analytics');
    if (role === 'buying_assistant') return allTabs.filter(t => ['calls', 'daily-deals', 'notes'].includes(t.id));
    return allTabs.filter(t => ['calls', 'analytics', 'daily-deals', 'notes'].includes(t.id));
  };

  // ── LOADING / AUTH GATES ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-400 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (showPasswordReset) {
    return <ResetPasswordPage onSuccess={() => { setShowPasswordReset(false); checkAuth(); }} />;
  }

  if (!isAuthenticated || !currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const tabs = getVisibleTabs(currentUser.role);

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-blue-400">DSS Portal</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{currentUser.name} ({currentUser.role})</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {activeTab === 'calls' && (
          <CallsTab
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
            calls={calls}
            setCalls={setCalls}
            notes={notes}
            setNotes={setNotes}
            dailyGoal={goals.daily[currentUser.id] || 0}
            teamGoal={goals.team}
            currentUser={currentUser}
            todayDailyDeals={todayDailyDeals}
            users={users}
          />
        )}

        {activeTab === 'upload' && (
          <UploadTab
            calls={calls}
            setCalls={setCalls}
            dealers={dealers}
            setDealers={setDealers}
            fundingData={fundingData}
            setFundingData={setFundingData}
          />
        )}

        {activeTab === 'assign' && (
          <AssignTab
            currentUserRole={currentUser.role}
            calls={calls}
            setCalls={setCalls}
            users={users}
            goals={goals}
            setGoals={setGoals}
          />
        )}

        {activeTab === 'reporting' && (
          <ReportingTab
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
            calls={calls}
            goals={goals}
            setGoals={setGoals}
            fundingData={fundingData}
            todayDailyDeals={todayDailyDeals}
          />
        )}

        {activeTab === 'users' && (
          <UserManagementTab
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            currentUser={currentUser}
            calls={calls}
            fundingData={fundingData}
            todayDailyDeals={todayDailyDeals}
          />
        )}

{activeTab === 'daily-deals' && (
          <DailyDealsTab
            currentUser={currentUser}
            goals={goals}
            onRefresh={fetchTodayDailyDeals}
            calls={calls}
            todayDailyDeals={todayDailyDeals}
            users={users}
          />
        )}

        {activeTab === 'notes' && (
          <NotesTab
            currentUser={currentUser}
            users={users}
          />
        )}

      </main>
    </div>
  );
}

export default App;