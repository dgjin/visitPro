import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, CalendarCheck, Settings, LogOut, Menu, X, Sparkles, Shield, User as UserIcon } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ClientManager from './components/ClientManager';
import VisitManager from './components/VisitManager';
import AdminPanel from './components/AdminPanel';
import { Client, Visit, ViewState, User, CustomFieldDefinition, StorageSettings } from './types';
import { initSupabase, fetchAllData, addClient, updateClient, deleteClient, addVisit, updateVisit, deleteVisit, addUser, updateUser, deleteUser, addField, deleteField } from './services/supabaseService';

const MOCK_FIELD_DEFINITIONS: CustomFieldDefinition[] = [
  { id: 'f1', target: 'Client', label: '职位', type: 'text' },
  { id: 'f2', target: 'Client', label: '首选语言', type: 'text' },
  { id: 'f3', target: 'Client', label: '预算范围', type: 'text' },
  { id: 'f4', target: 'Visit', label: '拜访时长 (分钟)', type: 'number' },
  { id: 'f5', target: 'Visit', label: '参与人数', type: 'number' },
  { id: 'f6', target: 'User', label: '员工编号', type: 'text' },
];

const MOCK_USERS: User[] = [
  { id: 'u1', name: 'John Doe', email: 'john@example.com', phone: '138-0013-8001', department: '销售部', teamName: '华东大区一组', role: 'Admin', avatarUrl: 'https://picsum.photos/seed/u1/200', customFields: [{ fieldId: 'f6', value: 'EMP001' }] },
  { id: 'u2', name: 'Jane Smith', email: 'jane@example.com', phone: '139-1122-3344', department: '市场部', teamName: '内容运营组', role: 'User', avatarUrl: 'https://picsum.photos/seed/u2/200', customFields: [{ fieldId: 'f6', value: 'EMP002' }] },
];

const MOCK_CLIENTS: Client[] = [
  { id: '1', name: '艾丽斯·弗里曼', company: '泰克诺瓦 (TechNova)', email: 'alice@technova.com', phone: '555-0123', address: '科技大道 123 号', avatarUrl: 'https://picsum.photos/seed/alice/200', industry: 'SaaS', status: 'Active', customFields: [{ fieldId: 'f1', value: 'CTO' }, { fieldId: 'f2', value: '英语' }] },
  { id: '2', name: '鲍勃·史密斯', company: '必筑公司 (BuildCo)', email: 'bob@buildco.com', phone: '555-0199', address: '建设路 456 号', avatarUrl: 'https://picsum.photos/seed/bob/200', industry: 'Construction', status: 'Lead', customFields: [{ fieldId: 'f3', value: '50万-100万' }] },
];

const MOCK_VISITS: Visit[] = [
  { id: '101', userId: 'u1', clientId: '1', clientName: '艾丽斯·弗里曼', date: new Date(Date.now() - 86400000 * 2).toISOString(), category: 'Outbound', summary: '讨论了第三季度的路线图。客户对目前的进展感到满意，但要求增加一项新的报告功能。', rawNotes: '讨论Q3路线图。客户想要新报表功能。整体满意。', participants: 'CTO Alice, Sales John', outcome: 'Positive', actionItems: ['发送 API 文档', '安排技术评审'], sentimentScore: 85, customFields: [{ fieldId: 'f4', value: '60' }, { fieldId: 'f5', value: '3' }], followUpEmailDraft: 'Subject: Q3 Roadmap...' },
  { id: '102', userId: 'u2', clientId: '2', clientName: '鲍勃·史密斯', date: new Date(Date.now() - 86400000 * 5).toISOString(), category: 'Inbound', summary: '初步需求会议。客户预算低于预期。需要调整提案。', rawNotes: '预算太低。需调整。', participants: 'Bob Smith, Jane Smith', outcome: 'Neutral', actionItems: ['修改报价', '邮件跟进'], sentimentScore: 50, followUpEmailDraft: 'Subject: Revised Proposal...' },
];

const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  mode: 'LOCAL_FILE', // Changed default from SUPABASE to LOCAL_FILE to prevent init errors
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
        // Migration logic
        if (!parsed.storageSettings.supabaseConfig) {
            parsed.storageSettings.supabaseConfig = DEFAULT_STORAGE_SETTINGS.supabaseConfig;
        }
        if (!parsed.storageSettings.emailConfig) {
            parsed.storageSettings.emailConfig = DEFAULT_STORAGE_SETTINGS.emailConfig;
        }
        if (!parsed.storageSettings.iflytekConfig) {
            parsed.storageSettings.iflytekConfig = DEFAULT_STORAGE_SETTINGS.iflytekConfig;
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
  const [storageSettings, setStorageSettings] = useState<StorageSettings>(initialState?.storageSettings || DEFAULT_STORAGE_SETTINGS);
  const [currentUser, setCurrentUser] = useState<User>(users[0]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  // Initialize Supabase on load or setting change
  useEffect(() => {
    // If mode is SUPABASE but config is missing, revert to LOCAL_FILE to prevent errors
    if (storageSettings.mode === 'SUPABASE' && !storageSettings.supabaseConfig?.url && !process.env.SUPABASE_URL) {
        console.warn("Supabase mode enabled but no configuration found. Reverting to Local File mode.");
        setStorageSettings(prev => ({ ...prev, mode: 'LOCAL_FILE' }));
        return;
    }

    // Always initialize/update the client when settings change
    if (storageSettings.supabaseConfig?.url || process.env.SUPABASE_URL) {
      const client = initSupabase(storageSettings.supabaseConfig);
      
      // Only auto-fetch if explicitly in SUPABASE mode
      if (storageSettings.mode === 'SUPABASE' && client) {
          fetchAllData().then(data => {
              if (data.users.length > 0 || data.clients.length > 0) {
                  setUsers(data.users);
                  setClients(data.clients);
                  setVisits(data.visits);
                  setFieldDefinitions(data.fieldDefinitions);
              }
          }).catch(err => {
              console.error("Auto fetch failed:", err);
              // Don't alert here to avoid spamming the user on load, just log it.
          });
      }
    }
  }, [storageSettings.mode, storageSettings.supabaseConfig]);

  // Persist to local storage (acts as cache or offline store)
  useEffect(() => {
    const dataToSave = { users, clients, visits, fieldDefinitions, storageSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [users, clients, visits, fieldDefinitions, storageSettings]);

  const handleBackupData = () => {
      const data = { metadata: { version: '1.2', exportDate: new Date().toISOString() }, users, clients, visits, fieldDefinitions, storageSettings: { ...storageSettings, lastBackupDate: new Date().toISOString() } };
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
                  setUsers(data.users);
                  setClients(data.clients);
                  setVisits(data.visits);
                  setFieldDefinitions(data.fieldDefinitions || MOCK_FIELD_DEFINITIONS);
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
      if (storageSettings.mode !== 'SUPABASE') {
          alert('请先在设置中启用 Supabase 模式');
          return;
      }
      try {
          const data = await fetchAllData();
          setUsers(data.users);
          setClients(data.clients);
          setVisits(data.visits);
          setFieldDefinitions(data.fieldDefinitions);
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
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(addClient(newClient), () => {
              setClients(prev => prev.filter(c => c.id !== newClient.id));
          });
      }
  };
  const handleUpdateClient = async (updatedClient: Client) => {
      const original = clients.find(c => c.id === updatedClient.id);
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(updateClient(updatedClient), () => {
              if (original) setClients(prev => prev.map(c => c.id === updatedClient.id ? original : c));
          });
      }
  };
  const handleDeleteClient = async (clientId: string) => { 
      const original = clients.find(c => c.id === clientId);
      if (confirm('确定要删除此客户吗？')) {
          setClients(prev => prev.filter(c => c.id !== clientId));
          if (storageSettings.mode === 'SUPABASE') {
              await safeExecute(deleteClient(clientId), () => {
                  if (original) setClients(prev => [...prev, original]);
              });
          }
      }
  };

  const handleAddVisit = async (newVisit: Visit) => {
      setVisits(prev => [newVisit, ...prev]);
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(addVisit(newVisit), () => {
              setVisits(prev => prev.filter(v => v.id !== newVisit.id));
          });
      }
  };
  const handleUpdateVisit = async (updatedVisit: Visit) => {
      const original = visits.find(v => v.id === updatedVisit.id);
      setVisits(prev => prev.map(v => v.id === updatedVisit.id ? updatedVisit : v));
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(updateVisit(updatedVisit), () => {
              if (original) setVisits(prev => prev.map(v => v.id === updatedVisit.id ? original : v));
          });
      }
  };
  const handleDeleteVisit = async (visitId: string) => { 
      const original = visits.find(v => v.id === visitId);
      if (confirm('确定要删除这条拜访记录吗？')) {
          setVisits(prev => prev.filter(v => v.id !== visitId));
          if (storageSettings.mode === 'SUPABASE') {
              await safeExecute(deleteVisit(visitId), () => {
                  if (original) setVisits(prev => [...prev, original]);
              });
          }
      }
  };
  const handleVisitClick = (visitId: string) => { setSelectedVisitId(visitId); setView(ViewState.VISITS); };

  const handleAddUser = async (user: User) => {
      setUsers(prev => [...prev, user]);
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(addUser(user), () => {
              setUsers(prev => prev.filter(u => u.id !== user.id));
          });
      }
  };
  const handleUpdateUser = async (updatedUser: User) => { 
      const original = users.find(u => u.id === updatedUser.id);
      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u)); 
      if (currentUser.id === updatedUser.id) setCurrentUser(updatedUser); 
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(updateUser(updatedUser), () => {
              if (original) setUsers(prev => prev.map(u => u.id === updatedUser.id ? original : u));
          });
      }
  };
  const handleDeleteUser = async (id: string) => { 
      const original = users.find(u => u.id === id);
      if (confirm('确定要删除此用户吗？')) {
          setUsers(prev => prev.filter(u => u.id !== id));
          if (storageSettings.mode === 'SUPABASE') {
              await safeExecute(deleteUser(id), () => {
                  if (original) setUsers(prev => [...prev, original]);
              });
          }
      }
  };
  const handleUpdateUserRole = async (id: string, role: 'Admin' | 'User') => { 
      const updated = users.find(u => u.id === id);
      if (updated) {
          const newUser = { ...updated, role };
          setUsers(prev => prev.map(u => u.id === id ? newUser : u));
          if (currentUser.id === id) setCurrentUser(newUser);
          if (storageSettings.mode === 'SUPABASE') {
              await safeExecute(updateUser(newUser)); // No rollback needed strictly for role change unless critical
          }
      }
  };

  const handleAddField = async (field: CustomFieldDefinition) => {
      setFieldDefinitions(prev => [...prev, field]);
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(addField(field), () => {
              setFieldDefinitions(prev => prev.filter(f => f.id !== field.id));
          });
      }
  };
  const handleDeleteField = async (id: string) => {
      const original = fieldDefinitions.find(f => f.id === id);
      setFieldDefinitions(prev => prev.filter(f => f.id !== id));
      if (storageSettings.mode === 'SUPABASE') {
          await safeExecute(deleteField(id), () => {
              if (original) setFieldDefinitions(prev => [...prev, original]);
          });
      }
  };

  const NavItem = ({ viewTarget, label, icon: Icon }: { viewTarget: ViewState, label: string, icon: any }) => (
    <button onClick={() => { setView(viewTarget); setIsMobileMenuOpen(false); }} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${view === viewTarget ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </button>
  );

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
            <div className="p-4 border-t border-gray-800 mt-auto">
               <button className="w-full flex items-center space-x-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"><Settings className="w-5 h-5" /><span>设置</span></button>
               <div className="mt-4 flex items-center space-x-3 px-4 relative group cursor-pointer">
                  <img src={currentUser.avatarUrl} alt="Profile" className="w-8 h-8 rounded-full bg-gray-700" />
                  <div className="text-sm">
                    <p className="text-white font-medium">{currentUser.name}</p>
                    <p className="text-gray-500 text-xs">{currentUser.role === 'Admin' ? '系统管理员' : '销售代表'}</p>
                  </div>
                  <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-lg shadow-lg p-2 hidden group-hover:block text-gray-800 z-50">
                      <p className="text-xs text-gray-500 mb-1 px-2">切换用户 (Demo)</p>
                      {users.map(u => (<button key={u.id} onClick={() => setCurrentUser(u)} className={`w-full text-left px-2 py-1 text-sm rounded hover:bg-gray-100 ${currentUser.id === u.id ? 'font-bold text-blue-600' : ''}`}>{u.name} ({u.role})</button>))}
                  </div>
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
              {view === ViewState.DASHBOARD && <Dashboard visits={visits} users={users} totalClients={clients.length} onVisitClick={handleVisitClick} />}
              {view === ViewState.CLIENTS && <ClientManager clients={clients} onAddClient={handleAddClient} onUpdateClient={handleUpdateClient} onDeleteClient={handleDeleteClient} fieldDefinitions={fieldDefinitions} />}
              {view === ViewState.VISITS && <VisitManager clients={clients} visits={visits} onAddVisit={handleAddVisit} onUpdateVisit={handleUpdateVisit} onDeleteVisit={handleDeleteVisit} onUpdateClient={handleUpdateClient} fieldDefinitions={fieldDefinitions} initialEditingVisitId={selectedVisitId} onClearInitialEditingVisitId={() => setSelectedVisitId(null)} currentUserId={currentUser.id} storageSettings={storageSettings} onUpdateStorageSettings={setStorageSettings} />}
              {view === ViewState.ADMIN && currentUser.role === 'Admin' && <AdminPanel users={users} clients={clients} visits={visits} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} onUpdateUserRole={handleUpdateUserRole} fieldDefinitions={fieldDefinitions} onAddField={handleAddField} onDeleteField={handleDeleteField} storageSettings={storageSettings} onUpdateStorageSettings={setStorageSettings} onBackupData={handleBackupData} onRestoreData={handleRestoreData} onSyncSupabase={handleSyncSupabase} />}
            </div>
          </main>
        </div>
      </div>
  );
};

export default App;