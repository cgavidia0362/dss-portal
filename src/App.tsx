import { useState } from 'react';
import UploadTab from './pages/UploadTab';
import CallsTab from './pages/CallsTab';
import AssignTab from './pages/AssignTab';
import ReportingTab from './pages/ReportingTab';
import UserManagementTab from './pages/UserManagementTab';

type UserRole = 'admin' | 'rep';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

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
  dealDate?: Date; // NEW: Track when it became a Deal
}

interface CallNote {
  id: string;
  callId: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

interface Goals {
  daily: number;
  weekly: number;
  monthly: number;
}

function App() {
  const [currentUser] = useState<User>({
    id: '1',
    email: 'admin@dss.com',
    fullName: 'Admin User',
    role: 'admin',
  });

  const [activeTab, setActiveTab] = useState<'upload' | 'calls' | 'assign' | 'reporting' | 'users'>('upload');

  // Shared state across all tabs
  const [calls, setCalls] = useState<Call[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [goals, setGoals] = useState<Goals>({ daily: 10, weekly: 50, monthly: 200 });

  const tabs = [
    { id: 'upload' as const, label: 'Upload', adminOnly: true },
    { id: 'calls' as const, label: 'Calls', adminOnly: false },
    { id: 'assign' as const, label: 'Assign', adminOnly: true },
    { id: 'reporting' as const, label: 'Reporting', adminOnly: false },
    { id: 'users' as const, label: 'User Management', adminOnly: true },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">📞 DSS Portal v1.0</h1>
              <p className="text-sm text-gray-400 mt-1">Welcome back, {currentUser.fullName}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 text-white text-xs rounded-full font-medium ${currentUser.role === 'admin' ? 'bg-blue-600' : 'bg-green-600'}`}>
                {currentUser.role === 'admin' ? 'Admin' : 'Rep'}
              </span>
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">Logout</button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-8">
            {tabs.map((tab) => {
              if (tab.adminOnly && currentUser.role !== 'admin') return null;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-1 py-4 text-sm font-medium transition ${activeTab === tab.id ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-400 hover:text-white'}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'upload' && (
          <UploadTab 
            calls={calls}
            setCalls={setCalls}
            dealers={dealers}
            setDealers={setDealers}
          />
        )}

        {activeTab === 'calls' && (
          <CallsTab
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
            calls={calls}
            setCalls={setCalls}
            notes={notes}
            setNotes={setNotes}
            dailyGoal={goals.daily}
          />
        )}

        {activeTab === 'assign' && (
          <AssignTab
            currentUserRole={currentUser.role}
            calls={calls}
            setCalls={setCalls}
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
      </div>
    </div>
  );
}

export default App;