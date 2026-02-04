
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, CalendarCheck, Settings, LogOut, Menu, X, Sparkles, Shield, User as UserIcon, Check } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ClientManager from './components/ClientManager';
import VisitManager from './components/VisitManager';
import AdminPanel from './components/AdminPanel';
import { Client, Visit, ViewState, User, CustomFieldDefinition, StorageSettings, Department } from './types';
import { initSupabase, fetchAllData, addClient, updateClient, deleteClient, addVisit, updateVisit, deleteVisit, addUser, updateUser, deleteUser, addField, deleteField, addDepartment, updateDepartment, deleteDepartment } from './services/supabaseService';

const MOCK_FIELD_DEFINITIONS: CustomFieldDefinition[] = [
  { id: 'f1', target: 'Client', label: '职位', type: 'text' },
  { id: 'f2', target: 'Client', label: '首选语言', type: 'text' },
  { id: 'f3', target: 'Client', label: '预算范围', type: 'text' },
  { id: 'f4', target: 'Visit', label: '拜访时长 (分钟)', type: 'number' },
  { id: 'f5', target: 'Visit', label: '参与人数', type: 'number' },
  { id: 'f6', target: 'User', label: '员工编号', type: 'text' },
];

const MOCK_USERS: User[] = [
  { id: 'u1', name: 'John Doe', email: 'john@example.com', phone: '138-0013-8001', department: '销售部', role: 'Admin', avatarUrl: 'https://picsum.photos/seed/u1/200', customFields: [{ fieldId: 'f6', value: 'EMP001' }] },
  { id: 'u2', name: 'Jane Smith', email: 'jane@example.com', phone: '139-1122-3344', department: '市场部', role: 'Member', avatarUrl: 'https://picsum.photos/seed/u2/200', customFields: [{ fieldId: 'f6', value: 'EMP002' }] },
  { id: 'u3', name: 'Mike Johnson', email: 'mike@example.com', phone: '137-5555-6666', department: '销售部', role: 'TeamLeader', avatarUrl: 'https://picsum.photos/seed/u3/200', customFields: [{ fieldId: 'f6', value: 'EMP003' }] },
];

const MOCK_CLIENTS: Client[] = [
  { id: '1', userId: 'u1', name: '艾丽斯·弗里曼', company: '泰克诺瓦 (TechNova)', email: 'alice@technova.com', phone: '555-0123', address: '科技大道 123 号', avatarUrl: 'https://picsum.photos/seed/alice/200', industry: 'SaaS', status: 'Active', customFields: [{ fieldId: 'f1', value: 'CTO' }, { fieldId: 'f2', value: '英语' }] },
  { id: '2', userId: 'u2', name: '鲍勃·史密斯', company: '必筑公司 (BuildCo)', email: 'bob@buildco.com', phone: '555-0199', address: '建设路 456 号', avatarUrl: 'https://picsum.photos/seed/bob/200', industry: 'Construction', status: 'Lead', customFields: [{ fieldId: 'f3', value: '50万-100万' }] },
];

const MOCK_VISITS: Visit[] = [
  { id: '101', userId: 'u1', clientId: '1', clientName: '艾丽斯·弗里曼', date: new Date(Date.now() - 86400000 * 2).toISOString(), category: 'Outbound', summary: '讨论了第三季度的路线图。客户对目前的进展感到满意，但要求增加一项新的报告功能。', rawNotes: '讨论Q3路线图。客户想要新报表功能。整体满意。', participants: 'CTO Alice, Sales John', outcome: 'Positive', actionItems: ['发送 API 文档', '安排技术评审'], sentimentScore: 85, customFields: [{ fieldId: 'f4', value: '60' }, { fieldId: 'f5', value: '3' }], followUpEmailDraft: 'Subject: Q3 Roadmap...' },
  { id: '102', userId: 'u2', clientId: '2', clientName: '鲍勃·史密斯', date: new Date(Date.now() - 86400000 * 5).toISOString(), category: 'Inbound', summary: '初步需求会议。客户预算低于预期。需要调整提案。', rawNotes: '预算太低。需调整。', participants: 'Bob Smith, Jane Smith', outcome: 'Neutral', actionItems: ['修改报价', '邮件跟进'], sentimentScore: 50, followUpEmailDraft: 'Subject: Revised Proposal...' },
];

const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  mode: 'SUPABASE',
  mysqlConfig: { host: '', port: '3306', username: '', password: '', database: '' },
  supabaseConfig: { url: '', anonKey: '' },
  emailConfig: { smtpHost: 'smtp.example.com', smtpPort: '587', senderName: 'VisitPro Agent', senderEmail: 'sales@visitpro.com', authEnabled: false, authUsername: '', authPassword: '' },
  aiConfig: { activeModel: 'Gemini', deepSeekApiKey: '' },
  iflytekConfig: { appId: '', apiSecret: '', apiKey: '' }
};

const STORAGE_KEY = 'visitpro_data';

const App: React.FC = () => {
  const loadInitialState = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // --- Migration Logic ---
        
        // 1. Config migrations
        if (!parsed.storageSettings.supabaseConfig) {
            parsed.storageSettings.supabaseConfig = DEFAULT_STORAGE_SETTINGS.supabaseConfig;
        }
        if (!parsed.storageSettings.emailConfig) {
            parsed.storageSettings.emailConfig = DEFAULT_STORAGE_SETTINGS.emailConfig;
        }
        if (!parsed.storageSettings.iflytekConfig) {
            parsed.storageSettings.iflytekConfig = DEFAULT_STORAGE_SETTINGS.iflytekConfig;
        }
        // Force Supabase mode default
        if (!parsed.storageSettings.mode) parsed.storageSettings.mode = 'SUPABASE';

        // 2. Data migrations (Backfill missing userId)
        const defaultUserId = (parsed.users && parsed.users.length > 0) ? parsed.users[0].id : 'u1';
        
        if (parsed.clients) {
            parsed.clients = parsed.clients.map((c: any) => ({
                ...c,
                userId: c.userId || defaultUserId
            }));
        }
        
        if (parsed.visits) {
            parsed.visits = parsed.visits.map((v: any) => ({
                ...v,
                userId: v.userId || defaultUserId
            }));
        }

        return parsed;
      } catch (e) {
        console.error("Failed to parse local storage", e);
      }
    }
    return null;
  };

  const initialState = loadInitialState();

  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [users, setUsers] = useState<User[]>(initialState?.users || MOCK_USERS);
  const [clients, setClients] = useState<Client[]>(initialState?.clients || MOCK_CLIENTS);
  const [visits, setVisits] = useState<Visit[]>(initialState?.visits || MOCK_VISITS);
  const [fieldDefinitions, setFieldDefinitions] = useState<CustomFieldDefinition[]>(initialState?.fieldDefinitions || MOCK_FIELD_DEFINITIONS);
  const [departments, setDepartments] = useState<Department[]>(initialState?.departments || []);
  const [storageSettings, setStorageSettings] = useState<StorageSettings>(initialState?.storageSettings || DEFAULT_STORAGE_SETTINGS);
  
  // Safe initialization of currentUser
  const [currentUser, setCurrentUser] = useState<User>(() => {
      if (users.length > 0) return users[0];
      return MOCK_USERS[0]; 
  });
  
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  
  // User Switcher Modal State
  const [isUserSwitchModalOpen, setIsUserSwitchModalOpen] = useState(false);

  // Initialize Supabase on load or setting change
  useEffect(() => {
    // Always initialize/update the client when settings change
    if (storageSettings.supabaseConfig?.url || process.env.SUPABASE_URL) {
      const client = initSupabase(storageSettings.supabaseConfig);
      
      // Auto-fetch data from Supabase
      if (client) {
          fetchAllData().then(data => {
              if (data.users.length > 0 || data.clients.length > 0) {
                  setUsers(data.users);
                  setClients(data.clients);
                  setVisits(data.visits);
                  setFieldDefinitions(data.fieldDefinitions);
                  setDepartments(data.departments);
              }
          }).catch(err => {
              console.error("Auto fetch failed:", err);
          });
      }
    }
  }, [storageSettings.supabaseConfig]);

  // Persist to local storage (acts as cache or offline store)
  useEffect(() => {
    const dataToSave = { users, clients, visits, fieldDefinitions, departments, storageSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [users, clients, visits, fieldDefinitions, departments, storageSettings]);

  const handleBackupData = () => {
      const data = { metadata: { version: '1.2', exportDate: new Date().toISOString() }, users, clients, visits, fieldDefinitions, departments, storageSettings: { ...storageSettings, lastBackupDate: new Date().toISOString() } };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VisitPro_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStorageSettings(prev => ({ ...prev, lastBackupDate: new Date().toISOString() }));
  };

  const handleRestoreData = (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const data = JSON.parse(e.target?.result as string);
              if (data.users && data.clients && data.visits) {
                  // Ensure migrated structure on restore as well
                  const defaultUId = data.users[0]?.id || 'u1';
                  const migratedClients = data.clients.map((c: any) => ({...c, userId: c.userId || defaultUId}));
                  const migratedVisits = data.visits.map((v: any) => ({...v, userId: v.userId || defaultUId}));

                  setUsers(data.users);
                  setClients(migratedClients);
                  setVisits(migratedVisits);
                  setFieldDefinitions(data.fieldDefinitions || MOCK_FIELD_DEFINITIONS);
                  setDepartments(data.departments || []);
                  setStorageSettings(data.storageSettings || DEFAULT_STORAGE_SETTINGS);
                  alert('数据恢复成功！');
              } else {
                  alert('无效的备份文件格式。');
              }
          } catch (err) {
              alert('读取备份文件失败。');
          }
      };
      reader.readAsText(file);
  };

  const handleSyncSupabase = async () => {
      // Force sync check
      if (storageSettings.mode !== 'SUPABASE') {
           setStorageSettings(prev => ({ ...prev, mode: 'SUPABASE' }));
      }
      try {
          const data = await fetchAllData();
          setUsers(data.users);
          setClients(data.clients);
          setVisits(data.visits);
          setFieldDefinitions(data.fieldDefinitions);
          setDepartments(data.departments);
          setStorageSettings(prev => ({ ...prev, lastSyncDate: new Date().toISOString() }));
          alert('云端数据同步完成！');
      } catch (e: any) {
          console.error("Sync failed", e);
          alert(`同步失败: ${e.message}`);
      }
  };

  const safeExecute = async (operation: Promise<void>, fallback?: () => void) => {
      try {
          await operation;
      } catch (e: any) {
          console.error("Operation failed:", e);
          alert(`操作失败: ${e.message}`);
          if (fallback) fallback();
      }
  };

  const handleAddClient = async (newClient: Client) => {
      setClients(prev => [...prev, newClient]);
      await safeExecute(addClient(newClient), () => {
          setClients(prev => prev.filter(c => c.id !== newClient.id));
      });
  };
  const handleUpdateClient = async (updatedClient: Client) => {
      const original = clients.find(c => c.id === updatedClient.id);
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      await safeExecute(updateClient(updatedClient), () => {
          if (original) setClients(prev => prev.map(c => c.id === updatedClient.id ? original : c));
      });
  };
  const handleDeleteClient = async (clientId: string) => { 
      const original = clients.find(c => c.id === clientId);
      if (confirm('确定要删除此客户吗？')) {
          setClients(prev => prev.filter(c => c.id !== clientId));
          await safeExecute(deleteClient(clientId), () => {
              if (original) setClients(prev => [...prev, original]);
          });
      }
  };

  const handleAddVisit = async (newVisit: Visit) => {
      setVisits(prev => [newVisit, ...prev]);
      await safeExecute(addVisit(newVisit), () => {
          setVisits(prev => prev.filter(v => v.id !== newVisit.id));
      });
  };
  const handleUpdateVisit = async (updatedVisit: Visit) => {
      const original = visits.find(v => v.id === updatedVisit.id);
      setVisits(prev => prev.map(v => v.id === updatedVisit.id ? updatedVisit : v));
      await safeExecute(updateVisit(updatedVisit), () => {
          if (original) setVisits(prev => prev.map(v => v.id === updatedVisit.id ? original : v));
      });
  };
  const handleDeleteVisit = async (visitId: string) => { 
      const original = visits.find(v => v.id === visitId);
      if (confirm('确定要删除这条拜访记录吗？')) {
          setVisits(prev => prev.filter(v => v.id !== visitId));
          await safeExecute(deleteVisit(visitId), () => {
              if (original) setVisits(prev => [...prev, original]);
          });
      }
  };
  const handleVisitClick = (visitId: string) => { setSelectedVisitId(visitId); setView(ViewState.VISITS); };

  const handleAddUser = async (user: User) => {
      setUsers(prev => [...prev, user]);
      await safeExecute(addUser(user), () => {
          setUsers(prev => prev.filter(u => u.id !== user.id));
      });
  };
  const handleUpdateUser = async (updatedUser: User) => { 
      const original = users.find(u => u.id === updatedUser.id);
      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u)); 
      if (currentUser.id === updatedUser.id) setCurrentUser(updatedUser); 
      await safeExecute(updateUser(updatedUser), () => {
          if (original) setUsers(prev => prev.map(u => u.id === updatedUser.id ? original : u));
      });
  };
  const handleDeleteUser = async (id: string) => { 
      const original = users.find(u => u.id === id);
      if (confirm('确定要删除此用户吗？')) {
          setUsers(prev => prev.filter(u => u.id !== id));
          await safeExecute(deleteUser(id), () => {
              if (original) setUsers(prev => [...prev, original]);
          });
      }
  };
  const handleUpdateUserRole = async (id: string, role: 'Admin' | 'TeamLeader' | 'Member') => { 
      const updated = users.find(u => u.id === id);
      if (updated) {
          const newUser = { ...updated, role };
          setUsers(prev => prev.map(u => u.id === id ? newUser : u));
          if (currentUser.id === id) setCurrentUser(newUser);
          await safeExecute(updateUser(newUser)); // No rollback needed strictly for role change unless critical
      }
  };

  const handleAddField = async (field: CustomFieldDefinition) => {
      setFieldDefinitions(prev => [...prev, field]);
      await safeExecute(addField(field), () => {
          setFieldDefinitions(prev => prev.filter(f => f.id !== field.id));
      });
  };
  const handleDeleteField = async (id: string) => {
      const original = fieldDefinitions.find(f => f.id === id);
      setFieldDefinitions(prev => prev.filter(f => f.id !== id));
      await safeExecute(deleteField(id), () => {
          if (original) setFieldDefinitions(prev => [...prev, original]);
      });
  };

  const handleAddDepartment = async (dept: Department) => {
      setDepartments(prev => [...prev, dept]);
      await safeExecute(addDepartment(dept), () => {
          setDepartments(prev => prev.filter(d => d.id !== dept.id));
      });
  };
  const handleUpdateDepartment = async (dept: Department) => {
      const original = departments.find(d => d.id === dept.id);
      setDepartments(prev => prev.map(d => d.id === dept.id ? dept : d));
      await safeExecute(updateDepartment(dept), () => {
          if (original) setDepartments(prev => prev.map(d => d.id === dept.id ? original : d));
      });
  };
  const handleDeleteDepartment = async (id: string) => {
      const original = departments.find(d => d.id === id);
      if (confirm('确定要删除此部门吗？')) {
          setDepartments(prev => prev.filter(d => d.id !== id));
          await safeExecute(deleteDepartment(id), () => {
              if (original) setDepartments(prev => [...prev, original]);
          });
      }
  };

  const NavItem = ({ viewTarget, label, icon: Icon }: { viewTarget: ViewState, label: string, icon: any }) => (
    <button onClick={() => { setView(viewTarget); setIsMobileMenuOpen(false); }} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${view === viewTarget ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </button>
  );

  const getRoleLabel = (role: string) => {
      if (role === 'Admin') return '系统管理员';
      if (role === 'TeamLeader') return '团队负责人';
      return '成员';
  };

  return (
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-full flex flex-col">
            <div className="p-6 flex items-center space-x-3 border-b border-gray-800">
              <div className="bg-gradient-to-tr from-blue-500 to-purple-600 p-2 rounded-lg"><Sparkles className="w-6 h-6 text-white" /></div>
              <h1 className="text-xl font-bold tracking-tight">VisitPro</h1>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-2">
              <NavItem viewTarget={ViewState.DASHBOARD} label="仪表盘" icon={LayoutDashboard} />
              <NavItem viewTarget={ViewState.CLIENTS} label="客户列表" icon={Users} />
              <NavItem viewTarget={ViewState.VISITS} label="拜访管理" icon={CalendarCheck} />
              {currentUser.role === 'Admin' && (
                 <div className="pt-4 mt-4 border-t border-gray-800">
                    <p className="px-4 text-xs font-semibold text-gray-500 uppercase mb-2">管理员</p>
                    <NavItem viewTarget={ViewState.ADMIN} label="系统管理" icon={Shield} />
                 </div>
              )}
            </nav>
            
            {/* User Profile / Switcher Trigger */}
            <div className="p-4 border-t border-gray-800 mt-auto">
               <button className="w-full flex items-center space-x-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"><Settings className="w-5 h-5" /><span>设置</span></button>
               
               <div 
                  className="mt-4 flex items-center space-x-3 px-4 py-2 cursor-pointer hover:bg-gray-800 rounded-lg transition-colors active:scale-95"
                  onClick={() => setIsUserSwitchModalOpen(true)}
                  title="点击切换用户"
               >
                  <img src={currentUser.avatarUrl} alt="Profile" className="w-8 h-8 rounded-full bg-gray-700" />
                  <div className="text-sm flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{currentUser.name}</p>
                    <p className="text-gray-500 text-xs truncate">{getRoleLabel(currentUser.role)}</p>
                  </div>
                  <Settings className="w-4 h-4 text-gray-500" />
               </div>
            </div>
          </div>
        </aside>
        
        {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
        
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 lg:px-8">
            <div className="flex items-center lg:hidden"><button onClick={() => setIsMobileMenuOpen(true)} className="text-gray-500 hover:text-gray-700"><Menu className="w-6 h-6" /></button></div>
            <div className="hidden lg:flex items-center text-gray-800 font-semibold text-lg">{view === ViewState.DASHBOARD && '仪表盘概览'}{view === ViewState.CLIENTS && '客户目录'}{view === ViewState.VISITS && '拜访管理'}{view === ViewState.ADMIN && '系统管理面板'}</div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 lg:p-8">
            <div className="max-w-7xl mx-auto h-full">
              {view === ViewState.DASHBOARD && <Dashboard visits={visits} users={users} departments={departments} clients={clients} totalClients={clients.length} onVisitClick={handleVisitClick} />}
              {view === ViewState.CLIENTS && <ClientManager clients={clients} users={users} currentUser={currentUser} onAddClient={handleAddClient} onUpdateClient={handleUpdateClient} onDeleteClient={handleDeleteClient} fieldDefinitions={fieldDefinitions} />}
              {view === ViewState.VISITS && <VisitManager clients={clients} visits={visits} users={users} departments={departments} onAddVisit={handleAddVisit} onUpdateVisit={handleUpdateVisit} onDeleteVisit={handleDeleteVisit} onUpdateClient={handleUpdateClient} fieldDefinitions={fieldDefinitions} initialEditingVisitId={selectedVisitId} onClearInitialEditingVisitId={() => setSelectedVisitId(null)} currentUserId={currentUser.id} storageSettings={storageSettings} onUpdateStorageSettings={setStorageSettings} />}
              {view === ViewState.ADMIN && currentUser.role === 'Admin' && <AdminPanel users={users} clients={clients} visits={visits} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} onUpdateUserRole={handleUpdateUserRole} fieldDefinitions={fieldDefinitions} onAddField={handleAddField} onDeleteField={handleDeleteField} storageSettings={storageSettings} onUpdateStorageSettings={setStorageSettings} onBackupData={handleBackupData} onRestoreData={handleRestoreData} onSyncSupabase={handleSyncSupabase} departments={departments} onAddDepartment={handleAddDepartment} onUpdateDepartment={handleUpdateDepartment} onDeleteDepartment={handleDeleteDepartment} />}
            </div>
          </main>
        </div>

        {/* User Switcher Modal */}
        {isUserSwitchModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                    <div className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
                        <h3 className="text-lg font-bold text-white flex items-center">
                            <Users className="w-5 h-5 mr-2 text-blue-400" />
                            切换当前账户
                        </h3>
                        <button onClick={() => setIsUserSwitchModalOpen(false)} className="text-gray-400 hover:text-white transition-colors hover:bg-gray-800 p-1 rounded-lg">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar bg-gray-50">
                        <p className="text-xs text-gray-500 mb-3 px-2">请选择要模拟登录的系统用户：</p>
                        <div className="space-y-2">
                            {users.map(u => (
                                <button 
                                    key={u.id} 
                                    onClick={() => { setCurrentUser(u); setIsUserSwitchModalOpen(false); }} 
                                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between border transition-all ${
                                        currentUser.id === u.id 
                                        ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-200' 
                                        : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                                    }`}
                                >
                                    <div className="flex items-center space-x-3">
                                        <img src={u.avatarUrl} alt={u.name} className="w-10 h-10 rounded-full bg-gray-200 object-cover" />
                                        <div>
                                            <p className={`font-bold text-sm ${currentUser.id === u.id ? 'text-blue-900' : 'text-gray-800'}`}>{u.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{getRoleLabel(u.role)}</p>
                                        </div>
                                    </div>
                                    {currentUser.id === u.id && <Check className="w-5 h-5 text-blue-600" />}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="p-4 border-t border-gray-200 bg-white">
                        <button onClick={() => setIsUserSwitchModalOpen(false)} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">
                            取消
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
  );
};

export default App;
