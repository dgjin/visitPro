
import React, { useState, useRef } from 'react';
import { User, CustomFieldDefinition, StorageSettings, MySQLConfig, SupabaseConfig, Client, Visit } from '../types';
import { Users, Settings, Plus, Trash2, Shield, User as UserIcon, Type, Hash, Calendar, Pencil, X, Phone, Briefcase, Users2, Database, Save, Upload, Download, HardDrive, Server, CheckCircle, AlertCircle, RefreshCw, Mail, Cloud, CloudLightning, FileJson, Copy, Loader2, Info, UploadCloud } from 'lucide-react';
import { testConnection, uploadAllData, initSupabase } from '../services/supabaseService';

interface AdminPanelProps {
  users: User[];
  clients: Client[]; // Added
  visits: Visit[];   // Added
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUserRole: (userId: string, role: 'Admin' | 'User') => void;
  fieldDefinitions: CustomFieldDefinition[];
  onAddField: (field: CustomFieldDefinition) => void;
  onDeleteField: (fieldId: string) => void;
  // Storage Props
  storageSettings: StorageSettings;
  onUpdateStorageSettings: (settings: StorageSettings) => void;
  onBackupData: () => void;
  onRestoreData: (file: File) => void;
  onSyncSupabase?: () => void;
}

const SUPABASE_SCHEMA_SQL = `
-- 1. Users Table
create table if not exists public.users (
  id text primary key,
  name text,
  email text,
  phone text,
  department text,
  team_name text,
  role text,
  avatar_url text,
  custom_fields jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Clients Table
create table if not exists public.clients (
  id text primary key,
  name text,
  company text,
  email text,
  phone text,
  address text,
  avatar_url text,
  industry text,
  status text,
  custom_fields jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Visits Table
create table if not exists public.visits (
  id text primary key,
  client_id text references public.clients(id),
  client_name text,
  user_id text,
  date timestamp with time zone,
  category text,
  summary text,
  raw_notes text,
  participants text,
  outcome text,
  action_items jsonb default '[]'::jsonb,
  sentiment_score numeric,
  follow_up_email_draft text,
  custom_fields jsonb default '[]'::jsonb,
  attachments jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Field Definitions Table (Global Config)
create table if not exists public.field_definitions (
  id text primary key,
  target text, -- 'Client', 'Visit', 'User'
  label text,
  type text, -- 'text', 'number', 'date'
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Optional: Enable RLS (Row Level Security) if needed later
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.visits enable row level security;
alter table public.field_definitions enable row level security;

-- Allow public access for this demo (Caution: Production apps should use authenticated policies)
create policy "Allow all operations for anon" on public.users for all using (true);
create policy "Allow all operations for anon" on public.clients for all using (true);
create policy "Allow all operations for anon" on public.visits for all using (true);
create policy "Allow all operations for anon" on public.field_definitions for all using (true);
`;

const AdminPanel: React.FC<AdminPanelProps> = ({
  users,
  clients,
  visits,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onUpdateUserRole,
  fieldDefinitions,
  onAddField,
  onDeleteField,
  storageSettings,
  onUpdateStorageSettings,
  onBackupData,
  onRestoreData,
  onSyncSupabase
}) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'FIELDS' | 'STORAGE'>('USERS');
  
  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({ 
    role: 'User', 
    department: '', 
    teamName: '', 
    phone: '',
    customFields: [] 
  });
  const [userCustomFieldInputs, setUserCustomFieldInputs] = useState<Record<string, string>>({});
  
  // Field Form State
  const [newField, setNewField] = useState<Partial<CustomFieldDefinition>>({ target: 'Client', type: 'text' });

  // MySQL Form State
  const [mysqlConfig, setMysqlConfig] = useState<MySQLConfig>(storageSettings.mysqlConfig);
  // Supabase Form State
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(storageSettings.supabaseConfig || { url: '', anonKey: '' });
  
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  
  // Upload Confirmation Modal State
  const [showUploadConfirmModal, setShowUploadConfirmModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const openUserModal = (user?: User) => {
      if (user) {
          setEditingUser(user);
          const inputs: Record<string, string> = {};
          user.customFields?.forEach(f => inputs[f.fieldId] = f.value);
          setUserCustomFieldInputs(inputs);
      } else {
          setEditingUser({ 
            role: 'User', 
            department: '', 
            teamName: '', 
            phone: '', 
            customFields: [] 
          });
          setUserCustomFieldInputs({});
      }
      setIsUserModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.name || !editingUser.email) return;

    const customFieldsData = Object.entries(userCustomFieldInputs).map(([fieldId, value]) => ({
        fieldId,
        value
    }));

    if (editingUser.id) {
        onUpdateUser({
            ...editingUser as User,
            customFields: customFieldsData
        });
    } else {
        onAddUser({
            id: crypto.randomUUID(),
            name: editingUser.name!,
            email: editingUser.email!,
            phone: editingUser.phone || '',
            department: editingUser.department || '',
            teamName: editingUser.teamName || '',
            role: editingUser.role || 'User',
            avatarUrl: `https://picsum.photos/seed/${editingUser.name}/200`,
            customFields: customFieldsData
        });
    }
    
    setIsUserModalOpen(false);
  };

  const handleCreateField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newField.label) return;
    onAddField({
      id: crypto.randomUUID(),
      label: newField.label,
      target: newField.target || 'Client',
      type: newField.type || 'text'
    });
    setNewField({ target: 'Client', type: 'text', label: '' });
  };

  const handleSaveStorageSettings = async () => {
      console.log("Saving settings...", storageSettings.mode);
      setStatusMessage(null);
      if (storageSettings.mode === 'SUPABASE') {
          setIsTestingConnection(true);
          try {
              // Local Validation
              if (!supabaseConfig.url || !supabaseConfig.anonKey) {
                  setStatusMessage({ type: 'error', text: '请填写完整的 Project URL 和 API Key' });
                  return;
              }

              const result = await testConnection(supabaseConfig);
              console.log("Test result:", result);
              
              if (result.success) {
                  onUpdateStorageSettings({
                      ...storageSettings,
                      mysqlConfig,
                      supabaseConfig
                  });
                  setStatusMessage({ type: 'success', text: `✅ ${result.message} 配置已保存，系统将自动尝试同步数据。` });
              } else {
                  if (result.missingTables) {
                      const shouldOpenSql = confirm(`⚠️ 连接成功，但数据库缺少必要表结构。\n\n${result.message}\n\n是否立即查看 SQL 建表脚本？\n\n(点击取消将强制保存配置)`);
                      if (shouldOpenSql) {
                          setIsSqlModalOpen(true);
                      }
                      // Still save to allow user to proceed after running SQL elsewhere
                      onUpdateStorageSettings({
                          ...storageSettings,
                          mysqlConfig,
                          supabaseConfig
                      });
                  } else {
                      const detailMsg = result.details ? `\n\n调试信息:\n${result.details}` : '';
                      setStatusMessage({ type: 'error', text: `❌ 连接失败: ${result.message}` });
                  }
              }
          } catch (e: any) {
              console.error(e);
              setStatusMessage({ type: 'error', text: `❌ 发生未预期的错误：${e.message}` });
          } finally {
              setIsTestingConnection(false);
          }
      } else {
          onUpdateStorageSettings({
              ...storageSettings,
              mysqlConfig,
              supabaseConfig
          });
          setStatusMessage({ type: 'success', text: '配置已保存 (本地/MySQL模式)' });
      }
  };

  const handleUploadClick = () => {
      setStatusMessage(null);
      setShowUploadConfirmModal(true);
  };

  const handleConfirmUpload = async () => {
      setShowUploadConfirmModal(false);
      setIsUploading(true);
      try {
          // Explicitly initialize with current input values to ensure we have a valid client
          // even if "Save" wasn't clicked or app state hasn't refreshed.
          console.log("Ensuring Supabase init with form values...");
          if (supabaseConfig.url && supabaseConfig.anonKey) {
              initSupabase(supabaseConfig);
          }

          await uploadAllData({
              users,
              clients,
              visits,
              fieldDefinitions
          });
          setStatusMessage({ type: 'success', text: "✅ 本地数据已成功初始化到云端！" });
      } catch (e: any) {
          console.error("Upload error:", e);
          setStatusMessage({ type: 'error', text: `❌ 上传失败: ${e.message}` });
      } finally {
          setIsUploading(false);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (confirm('恢复备份将覆盖当前所有数据，此操作不可撤销。确定要继续吗？')) {
              onRestoreData(file);
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const copySqlToClipboard = () => {
      navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      alert('SQL 脚本已复制到剪贴板！请前往 Supabase SQL Editor 执行。');
  };

  const userFieldDefinitions = fieldDefinitions.filter(f => f.target === 'User');

  const InputLabel = ({ children }: { children?: React.ReactNode }) => (
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">{children}</label>
  );

  const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input 
      {...props}
      className={`w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${props.className || ''}`}
    />
  );

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">系统管理</h2>
        <div className="flex bg-gray-200 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('USERS')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center ${activeTab === 'USERS' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Users className="w-4 h-4 mr-2" /> 团队成员
          </button>
          <button
            onClick={() => setActiveTab('FIELDS')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center ${activeTab === 'FIELDS' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Settings className="w-4 h-4 mr-2" /> 字段配置
          </button>
          <button
            onClick={() => setActiveTab('STORAGE')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center ${activeTab === 'STORAGE' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Database className="w-4 h-4 mr-2" /> 存储与备份
          </button>
        </div>
      </div>

      {activeTab === 'USERS' && (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <p className="text-sm text-gray-500">共计 <span className="font-bold text-blue-600">{users.length}</span> 位成员</p>
                <button 
                    onClick={() => openUserModal()}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    <span>添加成员</span>
                </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
                {users.map(user => (
                <div key={user.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                    <div className="flex items-start space-x-4">
                        <img src={user.avatarUrl} alt={user.name} className="w-14 h-14 rounded-full bg-gray-100 border-2 border-white shadow-sm" />
                        <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                                <h3 className="font-bold text-gray-900 text-lg">{user.name}</h3>
                                <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-bold ${user.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-600'}`}>
                                    {user.role === 'Admin' ? '管理员' : '销售代表'}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                <p className="text-gray-500 flex items-center"><Briefcase className="w-3 h-3 mr-1.5 text-gray-400" /> {user.department || '--'}</p>
                                <p className="text-gray-500 flex items-center"><Users2 className="w-3 h-3 mr-1.5 text-gray-400" /> {user.teamName || '--'}</p>
                                <p className="text-gray-500 flex items-center"><Phone className="w-3 h-3 mr-1.5 text-gray-400" /> {user.phone || '--'}</p>
                                <p className="text-gray-500 flex items-center"><Mail className="w-3 h-3 mr-1.5 text-gray-400 opacity-70" /> {user.email}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 self-end md:self-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={() => openUserModal(user)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="详细信息"
                        >
                            <Pencil className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => onDeleteUser(user.id)}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="移除成员"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                ))}
            </div>
        </div>
      )}

      {/* User Modal ... (unchanged) */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-scale-in">
             <div className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
                <div className="flex items-center space-x-3 text-white">
                    <UserIcon className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-bold">{editingUser.id ? '编辑成员' : '添加新成员'}</h3>
                </div>
                <button onClick={() => setIsUserModalOpen(false)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800">
                   <X className="w-6 h-6" />
                </button>
             </div>
             
             <form onSubmit={handleSaveUser} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                
                {/* Basic Info Section */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center">
                        基本信息
                    </h4>
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-600">姓名 <span className="text-red-500">*</span></label>
                            <div className="relative group">
                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input 
                                    required
                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="真实姓名"
                                    value={editingUser.name || ''}
                                    onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-600">邮箱 <span className="text-red-500">*</span></label>
                            <div className="relative group">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input 
                                    required
                                    type="email"
                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="example@visitpro.com"
                                    value={editingUser.email || ''}
                                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-600">联系电话</label>
                            <div className="relative group">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input 
                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="138-0000-0000"
                                    value={editingUser.phone || ''}
                                    onChange={e => setEditingUser({...editingUser, phone: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Role & Org Section */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center">
                        角色与组织
                    </h4>
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-600">用户角色</label>
                            <div className="relative group">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <select 
                                    className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
                                    value={editingUser.role}
                                    onChange={e => setEditingUser({...editingUser, role: e.target.value as 'Admin' | 'User'})}
                                >
                                    <option value="User">普通用户 / 销售</option>
                                    <option value="Admin">系统管理员</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                             <label className="text-xs font-semibold text-gray-600">所属部门</label>
                             <div className="relative group">
                                 <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                 <input 
                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="例如：销售部"
                                    value={editingUser.department || ''}
                                    onChange={e => setEditingUser({...editingUser, department: e.target.value})}
                                 />
                             </div>
                        </div>
                        <div className="space-y-1.5">
                             <label className="text-xs font-semibold text-gray-600">所属团队</label>
                             <div className="relative group">
                                 <Users2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                 <input 
                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="例如：华南二组"
                                    value={editingUser.teamName || ''}
                                    onChange={e => setEditingUser({...editingUser, teamName: e.target.value})}
                                 />
                             </div>
                        </div>
                    </div>
                </div>

                {/* Custom Fields Section */}
                {userFieldDefinitions.length > 0 && (
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center">
                            扩展信息
                        </h4>
                        <div className="grid grid-cols-2 gap-5">
                            {userFieldDefinitions.map(def => (
                                <div key={def.id} className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-600">{def.label}</label>
                                    <div className="relative group">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                        <input 
                                            type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            value={userCustomFieldInputs[def.id] || ''}
                                            onChange={e => setUserCustomFieldInputs({...userCustomFieldInputs, [def.id]: e.target.value})}
                                            placeholder={`输入${def.label}...`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="pt-6 flex space-x-3 border-t border-gray-100">
                    <button 
                        type="button" 
                        onClick={() => setIsUserModalOpen(false)} 
                        className="flex-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-bold py-3 rounded-xl transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        type="submit" 
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-blue-100"
                    >
                        保存信息
                    </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Upload Confirmation Modal */}
      {showUploadConfirmModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
                      <Cloud className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">确认上传数据</h3>
                  <div className="text-sm text-gray-500 mb-6 text-left bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <p className="mb-2">您即将把本地数据同步到 Supabase 云端，这将包含：</p>
                      <ul className="list-disc list-inside space-y-1 font-medium text-gray-700">
                          <li>{users.length} 位团队成员</li>
                          <li>{clients.length} 个客户资料</li>
                          <li>{visits.length} 条拜访记录</li>
                      </ul>
                      <p className="mt-3 text-xs text-amber-600 font-bold">⚠️ 注意：如果云端已存在相同 ID 的数据，旧数据将被覆盖。</p>
                  </div>
                  <div className="flex space-x-3">
                      <button 
                          onClick={() => setShowUploadConfirmModal(false)} 
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          onClick={handleConfirmUpload} 
                          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md transition-colors"
                      >
                          确认上传
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* SQL Modal */}
      {isSqlModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                  <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-white flex items-center">
                          <Database className="w-5 h-5 mr-2 text-green-400" />
                          数据库初始化脚本 (SQL)
                      </h3>
                      <button onClick={() => setIsSqlModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar bg-gray-50 flex-1">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm text-blue-800">
                          <p className="font-bold mb-1">操作指南：</p>
                          <ol className="list-decimal list-inside space-y-1">
                              <li>复制下方的 SQL 代码。</li>
                              <li>登录 <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">Supabase Dashboard</a>。</li>
                              <li>进入项目的 <strong>SQL Editor</strong> 选项卡。</li>
                              <li>粘贴代码并点击 <strong>Run</strong> 按钮以创建数据表。</li>
                          </ol>
                      </div>
                      <pre className="bg-gray-800 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                          {SUPABASE_SCHEMA_SQL}
                      </pre>
                  </div>
                  <div className="p-4 border-t border-gray-200 bg-white flex justify-end">
                      <button 
                          onClick={copySqlToClipboard}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg flex items-center shadow-md transition-colors"
                      >
                          <Copy className="w-4 h-4 mr-2" />
                          复制代码
                      </button>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'FIELDS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {['Client', 'Visit', 'User'].map((target) => {
                const targetLabel = target === 'Client' ? '客户 (Client)' : target === 'Visit' ? '拜访 (Visit)' : '用户 (User)';
                const fields = fieldDefinitions.filter(f => f.target === target);
                
                return (
                    <div key={target} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                            <h3 className="font-bold text-gray-900">{targetLabel} 动态属性</h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {fields.map(field => (
                                <div key={field.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 group">
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2 rounded ${target === 'Client' ? 'bg-blue-50 text-blue-600' : target === 'Visit' ? 'bg-indigo-50 text-indigo-600' : 'bg-purple-50 text-purple-600'}`}>
                                            {field.type === 'text' && <Type className="w-4 h-4" />}
                                            {field.type === 'number' && <Hash className="w-4 h-4" />}
                                            {field.type === 'date' && <Calendar className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{field.label}</p>
                                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">TYPE: {field.type}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => onDeleteField(field.id)} className="text-gray-300 hover:text-red-500 p-2 transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {fields.length === 0 && (
                                <div className="p-10 text-center text-gray-400 text-xs italic">该对象暂无动态扩展字段</div>
                            )}
                        </div>
                    </div>
                );
            })}
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-fit sticky top-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2 text-indigo-600" /> 新增动态字段
            </h3>
            <form onSubmit={handleCreateField} className="space-y-4">
              <div>
                <InputLabel>字段显示名称</InputLabel>
                <FormInput 
                    required
                    value={newField.label || ''}
                    onChange={e => setNewField({...newField, label: e.target.value})}
                    placeholder="如：预算范围、员工工号"
                />
              </div>
              <div>
                <InputLabel>应用对象</InputLabel>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newField.target}
                  onChange={e => setNewField({...newField, target: e.target.value as 'Client' | 'Visit' | 'User'})}
                >
                  <option value="Client">客户 (Client)</option>
                  <option value="Visit">拜访 (Visit)</option>
                  <option value="User">用户 (User)</option>
                </select>
              </div>
              <div>
                <InputLabel>数据格式</InputLabel>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newField.type}
                  onChange={e => setNewField({...newField, type: e.target.value as 'text' | 'number' | 'date'})}
                >
                  <option value="text">单行文本 (String)</option>
                  <option value="number">数值 (Number)</option>
                  <option value="date">日期 (Date)</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-all shadow-md mt-4">
                立即添加
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'STORAGE' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h3 className="font-bold text-gray-900 flex items-center">
                            <Database className="w-5 h-5 mr-2 text-blue-600" /> 存储方式配置
                        </h3>
                    </div>
                    <div className="p-6 space-y-6">
                         <div>
                             <InputLabel>选择数据存储模式</InputLabel>
                             <div className="grid grid-cols-2 gap-4 mt-2">
                                 <button
                                     onClick={() => {
                                         onUpdateStorageSettings({...storageSettings, mode: 'LOCAL_FILE'});
                                         alert('已切换至本地存储模式。数据将仅保存在浏览器中。');
                                     }}
                                     className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${storageSettings.mode === 'LOCAL_FILE' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                                 >
                                     <HardDrive className="w-8 h-8 mb-2" />
                                     <span className="font-bold text-sm">本地/文件存储</span>
                                     <span className="text-xs text-center mt-1 opacity-70">浏览器本地保存 + JSON 文件备份</span>
                                 </button>
                                 <button
                                     onClick={() => {
                                         onUpdateStorageSettings({...storageSettings, mode: 'SUPABASE'});
                                         // Note: We do not show immediate alert here, user must configure and save.
                                     }}
                                     className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${storageSettings.mode === 'SUPABASE' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                                 >
                                     <CloudLightning className="w-8 h-8 mb-2" />
                                     <span className="font-bold text-sm">Supabase 后端</span>
                                     <span className="text-xs text-center mt-1 opacity-70">PostgreSQL + 实时云同步</span>
                                 </button>
                             </div>
                             {/* Legacy MySQL button hidden but code preserved if needed */}
                         </div>

                         {storageSettings.mode === 'SUPABASE' && (
                             <div className="space-y-4 animate-fade-in">
                                 <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start space-x-3">
                                     <Cloud className="w-5 h-5 text-green-600 mt-0.5" />
                                     <div className="text-xs text-green-700">
                                         <b>提示：</b> 配置 Supabase 后，新建和修改的数据将自动同步到云端。
                                     </div>
                                 </div>
                                 <div className="grid grid-cols-1 gap-4">
                                     <div>
                                         <InputLabel>Project URL</InputLabel>
                                         <FormInput 
                                             value={supabaseConfig.url}
                                             onChange={e => setSupabaseConfig({...supabaseConfig, url: e.target.value})}
                                             placeholder="https://xyz.supabase.co"
                                         />
                                     </div>
                                     <div>
                                         <InputLabel>Anon API Key</InputLabel>
                                         <FormInput 
                                             value={supabaseConfig.anonKey}
                                             onChange={e => setSupabaseConfig({...supabaseConfig, anonKey: e.target.value})}
                                             placeholder="eyJh..."
                                         />
                                     </div>
                                 </div>
                                 
                                 {/* Status Message Display */}
                                 {statusMessage && (
                                     <div className={`p-3 rounded-lg text-sm border flex items-center animate-fade-in ${statusMessage.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                         {statusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                         {statusMessage.text}
                                     </div>
                                 )}

                                 <div className="flex space-x-3 pt-2">
                                     {onSyncSupabase && (
                                         <button 
                                            onClick={onSyncSupabase}
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
                                         >
                                             <RefreshCw className="w-4 h-4 mr-2" />
                                             从云端同步数据
                                         </button>
                                     )}
                                     <button 
                                         onClick={handleSaveStorageSettings}
                                         disabled={isTestingConnection}
                                         className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed"
                                     >
                                         {isTestingConnection ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                         {isTestingConnection ? '测试连接...' : '保存并测试连接'}
                                     </button>
                                 </div>
                                 
                                 <div className="pt-2 border-t border-gray-100 mt-2">
                                    <button 
                                        onClick={handleUploadClick}
                                        disabled={isUploading}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm"
                                    >
                                        {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                                        初始化云端数据 (上传本地数据)
                                    </button>
                                    <p className="text-[10px] text-gray-500 mt-1 text-center">注意：这将把所有本地数据上传到 Supabase，可能会覆盖云端同 ID 数据。</p>
                                 </div>

                                 <button 
                                    onClick={() => setIsSqlModalOpen(true)}
                                    className="w-full mt-2 text-xs text-blue-600 font-bold hover:underline flex items-center justify-center"
                                 >
                                    <FileJson className="w-3 h-3 mr-1" /> 查看建表 SQL (如果提示缺少表)
                                 </button>
                             </div>
                         )}

                         {storageSettings.mode === 'MYSQL' && (
                             <div className="space-y-4 animate-fade-in">
                                 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start space-x-3">
                                     <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                                     <div className="text-xs text-yellow-700">
                                         <b>注意：</b> 前端直连 MySQL 仅为演示。
                                     </div>
                                 </div>
                                 {/* MySQL inputs hidden for brevity as Supabase is focus */}
                                 <div className="flex space-x-3 pt-2">
                                     <button 
                                         onClick={handleSaveStorageSettings}
                                         className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
                                     >
                                         <Save className="w-4 h-4 mr-2" />
                                         保存配置
                                     </button>
                                 </div>
                             </div>
                         )}

                         {storageSettings.mode === 'LOCAL_FILE' && (
                             <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3 animate-fade-in">
                                 <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                                 <div className="text-sm text-green-800">
                                     <b>当前状态：</b> 数据已启用本地持久化。所有更改将自动保存到浏览器 LocalStorage 中。
                                 </div>
                             </div>
                         )}
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                 <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h3 className="font-bold text-gray-900 flex items-center">
                            <Save className="w-5 h-5 mr-2 text-indigo-600" /> 数据备份与恢复
                        </h3>
                    </div>
                    <div className="p-6 space-y-6">
                         <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                             <div className="flex items-center justify-between mb-2">
                                 <h4 className="font-bold text-gray-800">数据备份 (导出)</h4>
                                 <Download className="w-5 h-5 text-gray-400" />
                             </div>
                             <p className="text-xs text-gray-500 mb-4">将当前系统中的所有客户、拜访记录、用户及配置信息导出为 JSON 文件。</p>
                             <button 
                                 onClick={onBackupData}
                                 className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center shadow-md shadow-indigo-100"
                             >
                                 <Download className="w-4 h-4 mr-2" />
                                 立即导出备份数据
                             </button>
                             {storageSettings.lastBackupDate && (
                                 <p className="text-[10px] text-gray-400 mt-2 text-center">上次备份时间: {new Date(storageSettings.lastBackupDate).toLocaleString('zh-CN')}</p>
                             )}
                         </div>

                         <div className="border-t border-gray-100 pt-6">
                            <div className="bg-white rounded-lg p-4 border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all text-center">
                                <div className="flex flex-col items-center justify-center space-y-2">
                                    <div className="p-3 bg-blue-50 rounded-full">
                                        <Upload className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <h4 className="font-bold text-gray-800">数据恢复 (导入)</h4>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">点击选择或拖拽备份文件 (JSON) 至此。</p>
                                    
                                    <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        accept=".json"
                                        onChange={handleFileChange}
                                        className="hidden" 
                                    />
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="mt-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg transition-colors"
                                    >
                                        选择文件
                                    </button>
                                </div>
                            </div>
                         </div>
                    </div>
                 </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
