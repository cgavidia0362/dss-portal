import { useState, useEffect } from 'react';
import { BarChart3, Upload, Users, FileText, UserCog, LogOut, TrendingUp, StickyNote, Car, BadgeDollarSign } from 'lucide-react';
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
import VehicleRiskAnalyzer from './pages/VehicleRiskAnalyzer';
import PublicDealsPage from './pages/PublicDealsPage';
import VehicleRiskPublic from './pages/VehicleRiskPublic';
import IncomeVerificationTab from './pages/IncomeVerificationTab';
import { resolveVisibleTabIds } from './lib/tabAccess';
import { callShouldAutoClose } from './lib/statusLastFilter';
import {
  dealShouldReturnToFollowUp,
  followUpShouldClearReminder,
  mergeFetchedCalls,
} from './lib/callActivity';
import { updateCallsByIds } from './lib/callWrite';

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
  fuStatus?: 'Deal' | 'Confirmed Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates' | 'Follow Up';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
  createdAt?: Date;
  dealDate?: Date;
  isDuplicate?: boolean;
  dealBy?: string;
  dealByName?: string;
  customerName?: string;
  updatedBy?: string;
  updatedByName?: string;
  lastActivityAt?: Date;
  lastActivityBy?: string;
  lastActivityByName?: string;
  followUpAt?: Date;
}

interface CallNote {
  id: string;
  callId: string;
  applicationId?: string;
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
  allowedTabs: string[];
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

const publicPath = window.location.pathname;
const isPublicDealsRoute = publicPath === '/deals';
const isVehicleRiskPublicRoute = publicPath === '/vehicle-risk-public';

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

  // Reset to calls tab if current tab isn't allowed for this role / grants
  useEffect(() => {
    if (!currentUser) return;
    const allowed = getVisibleTabs(currentUser.role, currentUser.allowedTabs).map(t => t.id);
    if (!allowed.includes(activeTab)) setActiveTab('calls');
  }, [currentUser?.role, currentUser?.allowedTabs, activeTab]);

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

  // Live KPIs: refresh calls + daily deals when either table changes
  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchTodayDailyDeals();
        fetchCalls();
      }, 250);
    };
    const channel = supabase
      .channel('app_live_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_deals' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
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
          allowedTabs: profile.allowed_tabs || [],
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
          allowedTabs: user.allowed_tabs || [],
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
      // Paginate — Supabase caps a single select at 1000 rows; oldest-first
      // truncation was dropping newer notes from the Calls tab.
      const BATCH_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('call_notes')
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, from + BATCH_SIZE - 1);
        if (error) { console.error('Error fetching call notes batch:', error); break; }
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        if (data.length < BATCH_SIZE) break;
        from += BATCH_SIZE;
      }

      setNotes(allData.map((n: any) => ({
        id: n.id,
        callId: n.call_id,
        applicationId: n.application_id || '',
        noteText: n.note_text,
        createdBy: n.created_by,
        createdByName: n.created_by_name,
        createdAt: new Date(n.created_at),
      })));
    } catch (err) {
      console.error('Error fetching call notes:', err);
    }
  };

  const fetchCalls = async () => {
    try {
      const BATCH_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('calls')
          .select('*')
          .order('timestamp_submit', { ascending: false })
          .range(from, from + BATCH_SIZE - 1);

        if (error) { console.error('Error fetching calls batch:', error); break; }
        if (!data || data.length === 0) break;

        allData = [...allData, ...data];
        if (data.length < BATCH_SIZE) break;
        from += BATCH_SIZE;
      }

      // Clear old Accepted→Deal orphans that have no credited/assigned rep
      const orphanAcceptedIds = allData
        .filter((c: any) =>
          (c.fu_status === 'Deal' || c.fu_status === 'Confirmed Deal') &&
          !c.deal_by &&
          !c.assigned_to &&
          String(c.status_last || '').toLowerCase().includes('accept')
        )
        .map((c: any) => c.id as string);

      if (orphanAcceptedIds.length > 0) {
        await supabase.from('calls').update({
          fu_status: null,
          deal_date: null,
        }).in('id', orphanAcceptedIds);

        const orphanSet = new Set(orphanAcceptedIds);
        allData = allData.map((c: any) =>
          orphanSet.has(c.id)
            ? { ...c, fu_status: null, deal_date: null }
            : c
        );
      }

      const now = Date.now();
      const autoCloseIds = allData
        .filter((c: any) =>
          callShouldAutoClose({
            statusLast: c.status_last || '',
            fuStatus: c.fu_status,
            createdAt: c.created_at,
            now,
          })
        )
        .map((c: any) => c.id as string);

      if (autoCloseIds.length > 0) {
        const closedAt = new Date().toISOString();
        const CLOSE_CHUNK = 200;
        const closedIds = new Set<string>();
        for (let i = 0; i < autoCloseIds.length; i += CLOSE_CHUNK) {
          const chunk = autoCloseIds.slice(i, i + CLOSE_CHUNK);
          const { error: closeError } = await updateCallsByIds(chunk, {
            fu_status: 'Closed',
            follow_up_at: null,
            updated_at: closedAt,
          });
          if (closeError) {
            console.error('Error auto-closing calls:', closeError);
            break;
          }
          chunk.forEach((id) => closedIds.add(id));
        }
        if (closedIds.size > 0) {
          allData = allData.map((c: any) =>
            closedIds.has(c.id) ? { ...c, fu_status: 'Closed', updated_at: closedAt } : c
          );
        }
      }

      const UPDATE_CHUNK = 200;
      const applyChunkedUpdate = async (ids: string[], patch: Record<string, unknown>) => {
        const updated = new Set<string>();
        for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
          const chunk = ids.slice(i, i + UPDATE_CHUNK);
          const { error } = await updateCallsByIds(chunk, patch);
          if (error) {
            console.error('Error updating queued calls:', error);
            break;
          }
          chunk.forEach((id) => updated.add(id));
        }
        return updated;
      };

      const dealFollowUpIds = allData
        .filter((c: any) =>
          dealShouldReturnToFollowUp({
            fuStatus: c.fu_status,
            lastActivityAt: c.last_activity_at,
            dealDate: c.deal_date,
          }, now)
        )
        .map((c: any) => c.id as string);

      if (dealFollowUpIds.length > 0) {
        const agedAt = new Date().toISOString();
        const agedIds = await applyChunkedUpdate(dealFollowUpIds, {
          fu_status: 'Follow Up',
          follow_up_at: null,
          last_activity_at: agedAt,
          last_activity_by_name: 'Queue',
          updated_at: agedAt,
        });
        if (agedIds.size > 0) {
          allData = allData.map((c: any) =>
            agedIds.has(c.id)
              ? { ...c, fu_status: 'Follow Up', follow_up_at: null, last_activity_at: agedAt, last_activity_by_name: 'Queue', updated_at: agedAt }
              : c
          );
        }
      }

      const dueFollowUpIds = allData
        .filter((c: any) =>
          followUpShouldClearReminder({
            fuStatus: c.fu_status,
            followUpAt: c.follow_up_at,
          }, new Date(now))
        )
        .map((c: any) => c.id as string);

      if (dueFollowUpIds.length > 0) {
        const dueAt = new Date().toISOString();
        const clearedIds = await applyChunkedUpdate(dueFollowUpIds, {
          follow_up_at: null,
          updated_at: dueAt,
        });
        if (clearedIds.size > 0) {
          allData = allData.map((c: any) =>
            clearedIds.has(c.id) ? { ...c, follow_up_at: null, updated_at: dueAt } : c
          );
        }
      }

      if (allData.length > 0) {
        const mapped: Call[] = allData.map((c: any) => ({
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
          updatedAt: c.updated_at ? new Date(c.updated_at) : new Date(),
          createdAt: c.created_at ? new Date(c.created_at) : undefined,
          dealDate: c.deal_date ? new Date(c.deal_date) : undefined,
          isDuplicate: c.is_duplicate || false,
          dealBy: c.deal_by || undefined,
          dealByName: c.deal_by_name || undefined,
          customerName: c.customer_full_name || undefined,
          updatedBy: c.updated_by || undefined,
          updatedByName: c.updated_by_name || undefined,
          lastActivityAt: c.last_activity_at ? new Date(c.last_activity_at) : undefined,
          lastActivityBy: c.last_activity_by || undefined,
          lastActivityByName: c.last_activity_by_name || undefined,
          followUpAt: c.follow_up_at ? new Date(c.follow_up_at) : undefined,
        }));
        setCalls(prev => mergeFetchedCalls(mapped, prev));
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
  const getVisibleTabs = (role: string, allowedTabs: string[] = []) => {
    const allTabs = [
      { id: 'calls', label: 'Calls', icon: FileText },
      { id: 'upload', label: 'Upload', icon: Upload },
      { id: 'assign', label: 'Assign', icon: Users },
      { id: 'users', label: 'Users', icon: UserCog },
      { id: 'analytics', label: 'Analytics', icon: TrendingUp },
      { id: 'daily-deals', label: 'Daily Deals', icon: TrendingUp },
      { id: 'notes', label: 'Notes', icon: StickyNote },
      { id: 'vehicle-risk', label: 'Vehicle Risk', icon: Car },
      { id: 'income-verification', label: 'Income Verification', icon: BadgeDollarSign },
      { id: 'reporting', label: 'Reporting', icon: BarChart3 },
    ];
    const visibleIds = new Set<string>(resolveVisibleTabIds(role, allowedTabs));
    return allTabs.filter((t) => visibleIds.has(t.id));
  };

  // ── LOADING / AUTH GATES ──────────────────────────────────────────
  if (isPublicDealsRoute) return <PublicDealsPage />;
  if (isVehicleRiskPublicRoute) return <VehicleRiskPublic />;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dss-canvas">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-dss-border border-t-dss-navy" />
          <p className="mt-4 text-sm text-dss-muted">Loading…</p>
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

  const tabs = getVisibleTabs(currentUser.role, currentUser.allowedTabs);
  const activeTabMeta = tabs.find((t) => t.id === activeTab);
  const navGroups: Array<{ label: string; ids: string[] }> = [
    { label: 'Operations', ids: ['calls', 'upload', 'assign'] },
    { label: 'Analysis', ids: ['analytics', 'daily-deals', 'notes', 'reporting'] },
    { label: 'Tools', ids: ['vehicle-risk', 'income-verification'] },
    { label: 'Admin', ids: ['users'] },
  ];

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-dss-canvas">
      <aside className="iv-no-print flex w-56 shrink-0 flex-col border-r border-white/10 bg-dss-navy text-white">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-[11px] font-bold tracking-wide">
            DSS
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">DSS Portal</p>
            <p className="truncate text-[10px] uppercase tracking-[0.14em] text-white/45">
              Operations
            </p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navGroups.map((group) => {
            const items = tabs.filter((t) => group.ids.includes(t.id));
            if (!items.length) return null;
            return (
              <div key={group.label} className="mb-4">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {items.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex w-full items-center gap-2.5 rounded-dss-sm px-2.5 py-2 text-left text-[13px] font-medium transition ${
                          active
                            ? 'bg-white/12 text-white'
                            : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="iv-no-print sticky top-0 z-40 flex h-14 items-center justify-between border-b border-dss-border bg-dss-surface px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-dss-ink">
              {activeTabMeta?.label || 'DSS Portal'}
            </p>
            <p className="truncate text-xs text-dss-muted">
              {currentUser.name} · {currentUser.role.replace('_', ' ')}
            </p>
          </div>
          <button type="button" onClick={handleLogout} className="dss-btn-secondary">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </header>

        {activeTab === 'income-verification' ? (
          <IncomeVerificationTab currentUser={currentUser} />
        ) : (
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-5">
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
                onUpdateCurrentUser={(patch) => setCurrentUser(prev => prev ? { ...prev, ...patch } : prev)}
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
                onUploadSuccess={fetchCalls}
              />
            )}

            {activeTab === 'assign' && (
              <AssignTab
                currentUserRole={currentUser.role}
                calls={calls}
                setCalls={setCalls}
                users={users}
                setUsers={setUsers}
                goals={goals}
                setGoals={setGoals}
              />
            )}

            {activeTab === 'reporting' && (
              <ReportingTab
                currentUserId={currentUser.id}
                currentUserRole={currentUser.role}
                calls={calls}
                setCalls={setCalls}
                goals={goals}
                setGoals={setGoals}
                fundingData={fundingData}
                todayDailyDeals={todayDailyDeals}
                onRefreshDailyDeals={() => { fetchTodayDailyDeals(); fetchCalls(); }}
                users={users}
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
                onRefresh={() => { fetchTodayDailyDeals(); fetchCalls(); }}
                calls={calls}
                setCalls={setCalls}
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

            {activeTab === 'vehicle-risk' && (
              <VehicleRiskAnalyzer currentUser={currentUser} />
            )}
          </main>
        )}
      </div>
    </div>
  );
}

export default App;