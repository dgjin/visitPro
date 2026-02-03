
import React, { useState, useRef } from 'react';
import { User, CustomFieldDefinition, StorageSettings, SupabaseConfig, Client, Visit } from '../types';
import { Users, Settings, Plus, Trash2, Database, Save, Upload, Download, Cloud, Copy, Loader2, X } from 'lucide-react';
import { testConnection, uploadAllData, initSupabase } from '../services/supabaseService';

interface AdminPanelProps {
  users: User[];
  clients: Client[]; 
  visits: Visit[];   
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUserRole: (userId: string, role: 'Admin' | 'User') => void;
  fieldDefinitions: CustomFieldDefinition[];
  onAddField: (field: CustomFieldDefinition) => void;
  onDeleteField: (fieldId: string) => void;
  storageSettings: StorageSettings;
  onUpdateStorageSettings: (settings: StorageSettings) => void;
  onBackupData: () => void;
  onRestoreData: (file: File) => void;
  onSyncSupabase?: () => void;
}

const SUPABASE_SCHEMA_SQL = `
-- (SQL Schema content)
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

-- Indexes for performance
create index if not exists idx_visits_client_id on public.visits(client_id);
create index if not exists idx_visits_user_id on public.visits(user_id);
`;

// Move components outside to prevent remounting and focus loss
const InputLabel = ({ children }: { children?: React.ReactNode }) => (
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">{children}</label>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input 
      {...props}
      className={`w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${props.className || ''}`}
    />
);

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
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldTarget, setNewFieldTarget] = useState<'Client' | 'Visit' | 'User'>('Client');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'date'>('text');

  // Supabase Form State
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(storageSettings.supabaseConfig || { url: '', anonKey: '' });
  
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  
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
    if (!newFieldLabel) return;
    onAddField({
      id: crypto.randomUUID(),
      label: newFieldLabel,
      target: newFieldTarget,
      type: newFieldType
    });
    // Reset form
    setNewFieldLabel('');
    setNewFieldTarget('Client');
    setNewFieldType('text');
  };

  const handleSaveStorageSettings = async () => {
      setStatusMessage(null);
      setIsTestingConnection(true);
      try {
          if (!supabaseConfig.url || !supabaseConfig.anonKey) {
              setStatusMessage({ type: 'error', text: '请填写完整的 Project URL 和 API Key' });
              return;
          }
          const result = await testConnection(supabaseConfig);
          if (result.success) {
              onUpdateStorageSettings({
                  ...storageSettings,
                  mode: 'SUPABASE',
                  supabaseConfig
              });
              setStatusMessage({ type: 'success', text: `✅ ${result.message} 配置已保存。` });
          } else {
              if (result.missingTables) {
                  const shouldOpenSql = confirm(`⚠️ 连接成功，但数据库缺少必要表结构。\n\n${result.message}\n\n是否立即查看 SQL 建表脚本？`);
                  if (shouldOpenSql) setIsSqlModalOpen(true);
                  // Allow saving even if tables missing, so user can run SQL later
                  onUpdateStorageSettings({ ...storageSettings, mode: 'SUPABASE', supabaseConfig });
              } else {
                  setStatusMessage({ type: 'error', text: `❌ 连接失败: ${result.message}` });
              }
          }
      } catch (e: any) {
          setStatusMessage({ type: 'error', text: `❌ 错误：${e.message}` });
      } finally {
          setIsTestingConnection(false);
      }
  };

  const handleConfirmUpload = async () => {
      setShowUploadConfirmModal(false);
      setIsUploading(true);
      try {
          if (supabaseConfig.url && supabaseConfig.anonKey) {
              initSupabase(supabaseConfig);
          }
          await uploadAllData({ users, clients, visits, fieldDefinitions });
          setStatusMessage({ type: 'success', text: "✅ 本地数据已成功初始化到云端！" });
      } catch (e: any) {
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
      alert('SQL 脚本已复制到剪贴板！');
  };

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
                            <h3 className="font-bold text-gray-900 text-lg">{user.name}</h3>
                            <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 self-end md:self-center">
                        <button onClick={() => openUserModal(user)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Settings className="w-4 h-4" /></button>
                        <button onClick={() => onDeleteUser(user.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                </div>
                ))}
            </div>
        </div>
      )}

      {isUserModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6">
                   <h3 className="text-lg font-bold mb-4">编辑/添加用户</h3>
                   <form onSubmit={handleSaveUser} className="space-y-4">
                       <FormInput placeholder="姓名" value={editingUser.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})} required />
                       <FormInput placeholder="邮箱" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} required />
                       <div className="flex justify-end space-x-2 mt-4">
                           <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 border rounded">取消</button>
                           <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">保存</button>
                       </div>
                   </form>
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
                                            <span className="text-xs font-bold">{field.type}</span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{field.label}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => onDeleteField(field.id)} className="text-gray-300 hover:text-red-500 p-2"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                            {fields.length === 0 && <div className="p-4 text-center text-gray-400 italic">无自定义字段</div>}
                        </div>
                    </div>
                );
            })}
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-fit sticky top-6 z-10">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2 text-indigo-600" /> 新增动态字段
            </h3>
            <form onSubmit={handleCreateField} className="space-y-4">
              <div>
                <InputLabel>字段显示名称</InputLabel>
                <FormInput 
                    required
                    value={newFieldLabel}
                    onChange={e => setNewFieldLabel(e.target.value)}
                    placeholder="如：预算范围、员工工号"
                />
              </div>
              <div>
                <InputLabel>应用对象</InputLabel>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newFieldTarget}
                  onChange={e => setNewFieldTarget(e.target.value as 'Client' | 'Visit' | 'User')}
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
                  value={newFieldType}
                  onChange={e => setNewFieldType(e.target.value as 'text' | 'number' | 'date')}
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
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Database className="w-5 h-5 mr-2 text-blue-600" /> Supabase 数据库配置</h3>
                        <div className="space-y-4">
                             <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                                 系统已强制使用 Supabase 作为唯一数据存储后端。请在此配置连接信息。
                             </div>
                             <div className="flex flex-col space-y-2">
                                 <InputLabel>Project URL</InputLabel>
                                 <FormInput value={supabaseConfig.url} onChange={e => setSupabaseConfig({...supabaseConfig, url: e.target.value})} placeholder="https://xyz.supabase.co" />
                             </div>
                             <div className="flex flex-col space-y-2">
                                 <InputLabel>Anon API Key</InputLabel>
                                 <FormInput value={supabaseConfig.anonKey} onChange={e => setSupabaseConfig({...supabaseConfig, anonKey: e.target.value})} placeholder="your-anon-key" />
                             </div>
                             {statusMessage && (
                                 <div className={`p-3 rounded-lg text-sm border flex items-center ${statusMessage.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                     {statusMessage.text}
                                 </div>
                             )}
                             <button onClick={handleSaveStorageSettings} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center">
                                 {isTestingConnection ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                 保存并测试连接
                             </button>
                        </div>
                    </div>
               </div>
               
               <div className="space-y-6">
                   <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                       <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Save className="w-5 h-5 mr-2 text-indigo-600" /> 数据迁移与备份</h3>
                       <div className="space-y-4">
                           <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
                               <strong>初始化云端数据：</strong> 如果您的 Supabase 数据库为空，可以点击下方按钮将本地缓存数据上传至云端。
                           </div>
                           <button onClick={() => setShowUploadConfirmModal(true)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold flex items-center justify-center transition-all shadow-md">
                               {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                               上传本地数据到 Supabase
                           </button>
                           
                           <hr className="border-gray-100 my-2"/>
                           
                           <button onClick={onBackupData} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-lg font-bold flex items-center justify-center"><Download className="w-4 h-4 mr-2" /> 导出 JSON 备份</button>
                           <div className="relative">
                               <input type="file" ref={fileInputRef} accept=".json" onChange={handleFileChange} className="hidden" />
                               <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-600 py-3 rounded-lg font-bold flex items-center justify-center transition-all"><Upload className="w-4 h-4 mr-2" /> 导入 JSON 恢复</button>
                           </div>
                       </div>
                   </div>
               </div>
           </div>
      )}

      {/* SQL Modal */}
      {isSqlModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-white flex items-center">数据库初始化脚本</h3>
                      <button onClick={() => setIsSqlModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar bg-gray-50 flex-1">
                      <pre className="bg-gray-800 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">{SUPABASE_SCHEMA_SQL}</pre>
                  </div>
                  <div className="p-4 border-t border-gray-200 bg-white flex justify-end">
                      <button onClick={copySqlToClipboard} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-colors flex items-center"><Copy className="w-4 h-4 mr-2" /> 复制代码</button>
                  </div>
              </div>
          </div>
      )}

      {/* Upload Confirm Modal */}
      {showUploadConfirmModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4"><Cloud className="h-6 w-6 text-blue-600" /></div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">确认上传数据</h3>
                  <p className="text-sm text-gray-500 mb-6">此操作将把当前本地的 {users.length} 个用户、{clients.length} 个客户和 {visits.length} 条拜访记录上传到 Supabase 数据库。已存在的 ID 将被更新，新 ID 将被创建。</p>
                  <div className="flex space-x-3 mt-6">
                      <button onClick={() => setShowUploadConfirmModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
                      <button onClick={handleConfirmUpload} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700">确认上传</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminPanel;
