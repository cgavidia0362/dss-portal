import { useState, useEffect } from 'react';
import { BarChart3, Upload, Users, FileText, UserCog, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import CallsTab from './pages/CallsTab';
import UploadTab from './pages/UploadTab';
import AssignTab from './pages/AssignTab';
import ReportingTab from './pages/ReportingTab';
import UserManagementTab from './pages/UserManagementTab';

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
  role: 'admin' | 'rep';
  active: boolean;
  allowedStatuses: string[];
}

interface Goals {
  daily: { [repId: string]: number };
  team: number;
  weekly: number;
  monthly: number;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [activeTab, setActiveTab] = useState('calls');
  const [calls, setCalls] = useState<Call[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [users] = useState<User[]>([]);
  
  const [goals, setGoals] = useState<Goals>({
    daily: {},
    team: 30,
    weekly: 50,
    monthly: 200,
  });

  // Check authentication on mount
  useEffect(() => {
    checkAuth();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

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
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (profile) {
        setCurrentUser({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          active: profile.active,
          allowedStatuses: profile.allowed_statuses || [],
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setCurrentUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleLoginSuccess = () => {
    checkAuth();
  };

  const tabs = [
    { id: 'calls', name: 'Calls', icon: FileText },
    { id: 'upload', name: 'Upload', icon: Upload },
    { id: 'assign', name: 'Assign', icon: Users },
    { id: 'reporting', name: 'Reporting', icon: BarChart3 },
    { id: 'users', name: 'Users', icon: UserCog },
  ];

  // Show loading spinner while checking auth
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

  // Show login page if not authenticated
  if (!isAuthenticated || !currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-400">DSS Portal</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                {currentUser.name} ({currentUser.role})
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-4 overflow-x-auto">
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
                  {tab.name}
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
          />
        )}
        {activeTab === 'upload' && (
          <UploadTab
            calls={calls}
            setCalls={setCalls}
            dealers={dealers}
            setDealers={setDealers}
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
          />
        )}
{activeTab === 'users' && (
  <UserManagementTab
    currentUserId={currentUser.id}
    currentUserRole={currentUser.role}
  />
)}
      </main>
    </div>
  );
}

export default App;