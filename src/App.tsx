import { useState } from 'react';
import { BarChart3, Upload, Users, FileText, UserCog } from 'lucide-react';
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

const mockUsers: User[] = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@company.com',
    role: 'admin',
    active: true,
    allowedStatuses: [],
  },
  {
    id: 'rep1',
    name: 'John Smith',
    email: 'jsmith@company.com',
    role: 'rep',
    active: true,
    allowedStatuses: ['Accepted', 'Approved', 'Counter', 'Pending Approval'],
  },
  {
    id: 'rep2',
    name: 'Sarah Johnson',
    email: 'sjohnson@company.com',
    role: 'rep',
    active: true,
    allowedStatuses: ['Accepted', 'Approved', 'Denial', 'Declined'],
  },
];

function App() {
  const [activeTab, setActiveTab] = useState('calls');
  const [calls, setCalls] = useState<Call[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [currentUser] = useState({ id: '1', role: 'admin' as const });
  
  const [goals, setGoals] = useState<Goals>({
    daily: {
      'rep1': 10,
      'rep2': 10,
    },
    team: 30,
    weekly: 50,
    monthly: 200,
  });

  const tabs = [
    { id: 'calls', name: 'Calls', icon: FileText },
    { id: 'upload', name: 'Upload', icon: Upload },
    { id: 'assign', name: 'Assign', icon: Users },
    { id: 'reporting', name: 'Reporting', icon: BarChart3 },
    { id: 'users', name: 'Users', icon: UserCog },
  ];

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
                {currentUser.role === 'admin' ? 'Admin User' : 'Rep User'}
              </span>
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
            currentUser={users.find(u => u.id === currentUser.id)}
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
            currentUserRole={currentUser.role}
            users={users}
            setUsers={setUsers}
          />
        )}
      </main>
    </div>
  );
}

export default App;