
import React, { useState, useRef, useMemo } from 'react';
import { User, CustomFieldDefinition, StorageSettings, SupabaseConfig, Client, Visit, Department } from '../types';
import { Users, Settings, Plus, Trash2, Database, Save, Upload, Download, Cloud, Copy, Loader2, X, Phone, Mail, Briefcase, User as UserIcon, FolderTree, ChevronRight, ChevronDown, Folder, FileJson, Search } from 'lucide-react';
import { testConnection, uploadAllData, initSupabase } from '../services/supabaseService';

interface AdminPanelProps {
  users: User[];
  clients: Client[]; 
  visits: Visit[];   
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUserRole: (userId: string, role: 'Admin' | 'TeamLeader' | 'Member') => void;
  fieldDefinitions: CustomFieldDefinition[];
  onAddField: (field: CustomFieldDefinition) => void;
  onDeleteField: (fieldId: string) => void;
  storageSettings: StorageSettings;
  onUpdateStorageSettings: (settings: StorageSettings) => void;
  onBackupData: () => void;
  onRestoreData: (file: File) => void;
  onSyncSupabase?: () => void;
  // Departments
  departments?: Department[];
  onAddDepartment?: (dept: Department) => void;
  onUpdateDepartment?: (dept: Department) => void;
  onDeleteDepartment?: (id: string) => void;
}

const SUPABASE_SCHEMA_SQL = `
-- 1. Users Table & Extensions
create table if not exists public.users (
  id text primary key,
  name text,
  email text,
  phone text,
  department text,
  role text,
  avatar_url text,
  custom_fields jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
-- Migrations for Users
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists department text;
alter table public.users add column if not exists role text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists custom_fields jsonb default '[]'::jsonb;

-- 2. Clients Table
create table if not exists public.clients (
  id text primary key,
  user_id text, -- Owner ID
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
-- Migrations for Clients
alter table public.clients add column if not exists user_id text;
alter table public.clients add column if not exists industry text;
alter table public.clients add column if not exists status text;
alter table public.clients add column if not exists avatar_url text;
alter table public.clients add column if not exists custom_fields jsonb default '[]'::jsonb;
create index if not exists idx_clients_user_id on public.clients(user_id);

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
-- Migrations for Visits
alter table public.visits add column if not exists client_name text;
alter table public.visits add column if not exists user_id text;
alter table public.visits add column if not exists category text;
alter table public.visits add column if not exists attachments jsonb default '[]'::jsonb;
alter table public.visits add column if not exists custom_fields jsonb default '[]'::jsonb;
create index if not exists idx_visits_client_id on public.visits(client_id);
create index if not exists idx_visits_user_id on public.visits(user_id);

-- 4. Field Definitions Table (Global Config)
create table if not exists public.field_definitions (
  id text primary key,
  target text, -- 'Client', 'Visit', 'User'
  label text,
  type text, -- 'text', 'number', 'date'
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Departments Table (Organizational Structure)
create table if not exists public.departments (
  id text primary key,
  name text not null,
  parent_id text references public.departments(id),
  manager_id text,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
create index if not exists idx_departments_parent_id on public.departments(parent_id);

-- IMPORTANT: Force PostgREST schema cache reload to recognize new columns immediately
NOTIFY pgrst, 'reload config';
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

// --- Department Tree Components ---

const DepartmentTreeItem: React.FC<{
  dept: Department;
  allDepts: Department[];
  onEdit: (d: Department) => void;
  onDelete: (id: string) => void;
  onAddSub: (parentId: string) => void;
}> = ({ dept, allDepts, onEdit, onDelete, onAddSub }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const children = allDepts.filter(d => d.parentId === dept.id);
  const hasChildren = children.length > 0;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="select-none relative">
      <div 
        className={`flex items-center group py-1.5 px-2 hover:bg-gray-50 rounded-lg transition-all border border-transparent hover:border-gray-200 mb-0.5 cursor-pointer`}
        onClick={() => onEdit(dept)}
      >
        {/* Toggle Button */}
        <button 
          onClick={handleToggle}
          className={`w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 mr-1 transition-colors ${hasChildren ? '' : 'invisible'}`}
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        
        {/* Label Content */}
        <div className="flex items-center flex-1 min-w-0 mr-2">
           <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${hasChildren ? 'text-blue-500' : 'text-gray-400'}`} />
           <span className="text-sm font-medium text-gray-700 truncate">{dept.name}</span>
           {dept.managerId && <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 flex-shrink-0 hidden sm:inline-block">Mgr: {dept.managerId}</span>}
        </div>

        {/* Hover Actions */}
        <div className="hidden group-hover:flex items-center space-x-0.5 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-100 px-1">
             <button onClick={(e) => { e.stopPropagation(); onAddSub(dept.id); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="添加子部门">
                <Plus className="w-3.5 h-3.5" />
             </button>
             <button onClick={(e) => { e.stopPropagation(); onEdit(dept); }} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors" title="编辑">
                <Settings className="w-3.5 h-3.5" />
             </button>
             <button onClick={(e) => { e.stopPropagation(); onDelete(dept.id); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="删除">
                <Trash2 className="w-3.5 h-3.5" />
             </button>
        </div>
      </div>
      
      {/* Nested Children with Indentation Line */}
      {isExpanded && hasChildren && (
        <div className="ml-[11px] pl-4 border-l border-gray-200 space-y-0.5"> 
           {children.map(child => (
             <DepartmentTreeItem 
               key={child.id} 
               dept={child} 
               allDepts={allDepts} 
               onEdit={onEdit}
               onDelete={onDelete}
               onAddSub={onAddSub}
             />
           ))}
        </div>
      )}
    </div>
  );
};

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
  onSyncSupabase,
  departments = [],
  onAddDepartment,
  onUpdateDepartment,
  onDeleteDepartment
}) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'DEPARTMENTS' | 'FIELDS' | 'STORAGE'>('USERS');
  
  // User Search State
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({ 
    role: 'Member', // Default to Member
    department: '', 
    phone: '',
    customFields: [] 
  });
  const [userCustomFieldInputs, setUserCustomFieldInputs] = useState<Record<string, string>>({});
  
  // Department State
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Partial<Department>>({ name: '', parentId: null });

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
  const templateInputRef = useRef<HTMLInputElement>(null);

  // Helper for department hierarchy
  const getDepartmentFullPath = (deptIdOrName: string | undefined) => {
      if (!deptIdOrName) return '未分配部门';
      if (!departments || departments.length === 0) return deptIdOrName;

      let dept = departments.find(d => d.id === deptIdOrName);
      if (!dept) dept = departments.find(d => d.name === deptIdOrName);
      
      if (!dept) return deptIdOrName;

      const path = [dept.name];
      let current = dept;
      while (current.parentId) {
          const parent = departments.find(d => d.id === current.parentId);
          if (parent) {
              path.unshift(parent.name);
              current = parent;
          } else {
              break;
          }
      }
      return path.join(' / ');
  };

  // Filter Users Logic
  const filteredUsers = users.filter(user => {
      const term = userSearchTerm.toLowerCase();
      const matchesName = user.name.toLowerCase().includes(term);
      const matchesEmail = user.email.toLowerCase().includes(term);
      const matchesDept = user.department ? getDepartmentFullPath(user.department).toLowerCase().includes(term) : false;
      return matchesName || matchesEmail || matchesDept;
  });

  const openUserModal = (user?: User) => {
      if (user) {
          // Normalize department to ID if it matches a name (for backward compatibility and correct select value)
          let deptId = user.department;
          const deptByName = departments.find(d => d.name === user.department);
          if (deptByName) deptId = deptByName.id;

          setEditingUser({ ...user, department: deptId });
          const inputs: Record<string, string> = {};
          user.customFields?.forEach(f => inputs[f.fieldId] = f.value);
          setUserCustomFieldInputs(inputs);
      } else {
          setEditingUser({ 
            role: 'Member', 
            department: '', 
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
            role: editingUser.role || 'Member',
            avatarUrl: `https://picsum.photos/seed/${editingUser.name}/200`,
            customFields: customFieldsData
        });
    }
    setIsUserModalOpen(false);
  };

  // Department Handlers
  const rootDepartments = useMemo(() => departments.filter(d => !d.parentId), [departments]);
  
  const openDeptModal = (dept?: Department, parentId: string | null = null) => {
      if (dept) {
          setEditingDept(dept);
      } else {
          setEditingDept({ id: '', name: '', parentId: parentId, description: '' });
      }
      setIsDeptModalOpen(true);
  };

  const handleSaveDept = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingDept.name || !onAddDepartment || !onUpdateDepartment) return;

      if (editingDept.id) {
          onUpdateDepartment(editingDept as Department);
      } else {
          onAddDepartment({
              id: crypto.randomUUID(),
              name: editingDept.name,
              parentId: editingDept.parentId || null,
              description: editingDept.description,
              managerId: editingDept.managerId
          });
      }
      setIsDeptModalOpen(false);
  };

  const handleDeptDelete = (id: string) => {
      // Check if has children
      const hasChildren = departments.some(d => d.parentId === id);
      if (hasChildren) {
          alert('无法删除：请先删除或移动该部门下的子部门。');
          return;
      }
      if (confirm('确定删除此部门吗？') && onDeleteDepartment) {
          onDeleteDepartment(id);
      }
  };

  const downloadDeptTemplate = () => {
      const template = [
          {
              "name": "总部",
              "children": [
                  { "name": "研发中心", "children": [{ "name": "前端组" }, { "name": "后端组" }] },
                  { "name": "市场部" },
                  { "name": "人力资源" }
              ]
          }
      ];
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Organization_Template.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const handleImportDepts = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onAddDepartment) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const json = JSON.parse(evt.target?.result as string);
              if (!Array.isArray(json)) throw new Error("JSON must be an array");

              const processNode = (node: any, parentId: string | null) => {
                   const newId = crypto.randomUUID();
                   onAddDepartment({
                       id: newId,
                       name: node.name,
                       parentId: parentId,
                       description: node.description
                   });
                   if (node.children && Array.isArray(node.children)) {
                       node.children.forEach((child: any) => processNode(child, newId));
                   }
              };

              json.forEach(root => processNode(root, null));
              alert('导入成功！');
          } catch (err) {
              alert('导入失败：格式错误。请使用提供的模版。');
          }
          if (templateInputRef.current) templateInputRef.current.value = '';
      };
      reader.readAsText(file);
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
          await uploadAllData({ users, clients, visits, fieldDefinitions, departments });
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

  const getRoleLabel = (role: string) => {
      switch(role) {
          case 'Admin': return '系统管理员';
          case 'TeamLeader': return '团队负责人';
          case 'Member': return '成员';
          default: return role;
      }
  };

  // Filter custom fields for users
  const userFields = fieldDefinitions.filter(f => f.target === 'User');

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">系统管理</h2>
        <div className="flex bg-gray-200 rounded-lg p-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('USERS')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center whitespace-nowrap ${activeTab === 'USERS' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Users className="w-4 h-4 mr-2" /> 团队成员
          </button>
          <button
            onClick={() => setActiveTab('DEPARTMENTS')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center whitespace-nowrap ${activeTab === 'DEPARTMENTS' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <FolderTree className="w-4 h-4 mr-2" /> 组织架构
          </button>
          <button
            onClick={() => setActiveTab('FIELDS')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center whitespace-nowrap ${activeTab === 'FIELDS' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Settings className="w-4 h-4 mr-2" /> 字段配置
          </button>
          <button
            onClick={() => setActiveTab('STORAGE')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center whitespace-nowrap ${activeTab === 'STORAGE' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Database className="w-4 h-4 mr-2" /> 存储与备份
          </button>
        </div>
      </div>

      {activeTab === 'USERS' && (
        <div className="space-y-4">
             <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <p className="text-sm text-gray-500 whitespace-nowrap">共 <span className="font-bold text-blue-600">{filteredUsers.length}</span> / {users.length}</p>
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="搜索姓名、邮箱或部门..." 
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            value={userSearchTerm}
                            onChange={(e) => setUserSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <button 
                    onClick={() => openUserModal()}
                    className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    <span>添加成员</span>
                </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
                {filteredUsers.map(user => (
                <div key={user.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6 group">
                    {/* Identity */}
                    <div className="flex items-center space-x-4 min-w-[200px]">
                        <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full bg-gray-100 border-2 border-white shadow-sm flex-shrink-0 object-cover" />
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg">{user.name}</h3>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                                user.role === 'Admin' ? 'bg-purple-100 text-purple-800' : 
                                user.role === 'TeamLeader' ? 'bg-indigo-100 text-indigo-800' : 
                                'bg-blue-100 text-blue-800'
                            }`}>
                                {getRoleLabel(user.role)}
                            </span>
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                        <div className="flex items-center text-sm text-gray-600">
                            <Briefcase className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                            <span className="truncate" title={getDepartmentFullPath(user.department)}>{getDepartmentFullPath(user.department)}</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                            <Mail className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{user.email}</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                            <Phone className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                            <span>{user.phone || '--'}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 self-end lg:self-center pt-4 lg:pt-0 border-t lg:border-t-0 border-gray-50 w-full lg:w-auto justify-end">
                        <button onClick={() => openUserModal(user)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="编辑成员">
                            <Settings className="w-5 h-5" />
                        </button>
                        <button onClick={() => onDeleteUser(user.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="删除成员">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                ))}
                {filteredUsers.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed text-gray-400">
                        <div className="flex justify-center mb-2"><Search className="w-8 h-8 text-gray-300" /></div>
                        <p>未找到匹配的团队成员</p>
                    </div>
                )}
            </div>
        </div>
      )}
      
      {/* DEPARTMENTS TAB */}
      {activeTab === 'DEPARTMENTS' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                  <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-sm text-gray-500">部门组织架构树</p>
                      <button 
                          onClick={() => openDeptModal(undefined, null)}
                          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium shadow-sm transition-colors text-sm"
                      >
                          <Plus className="w-4 h-4" />
                          <span>新增一级部门</span>
                      </button>
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm min-h-[400px]">
                      {departments.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
                              <FolderTree className="w-12 h-12 text-gray-200" />
                              <p>暂无部门数据，请添加或导入。</p>
                          </div>
                      ) : (
                          <div className="space-y-1">
                              {rootDepartments.map(root => (
                                  <DepartmentTreeItem 
                                    key={root.id}
                                    dept={root}
                                    allDepts={departments}
                                    onEdit={(d) => openDeptModal(d)}
                                    onDelete={handleDeptDelete}
                                    onAddSub={(pid) => openDeptModal(undefined, pid)}
                                  />
                              ))}
                          </div>
                      )}
                  </div>
              </div>
              
              <div className="space-y-6">
                   <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm sticky top-6">
                       <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                           <FileJson className="w-5 h-5 mr-2 text-indigo-600" /> 快速导入
                       </h3>
                       <div className="space-y-4">
                           <p className="text-sm text-gray-500">您可以下载标准 JSON 模版，填写后批量导入组织架构。</p>
                           <button onClick={downloadDeptTemplate} className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 rounded-lg flex items-center justify-center transition-colors text-sm">
                               <Download className="w-4 h-4 mr-2" /> 下载模版
                           </button>
                           <div className="relative">
                               <input type="file" ref={templateInputRef} accept=".json" onChange={handleImportDepts} className="hidden" />
                               <button onClick={() => templateInputRef.current?.click()} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg flex items-center justify-center transition-colors text-sm shadow-md">
                                   <Upload className="w-4 h-4 mr-2" /> 上传导入
                               </button>
                           </div>
                       </div>
                   </div>
              </div>
          </div>
      )}

      {/* Department Modal */}
      {isDeptModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in">
                   <h3 className="text-lg font-bold mb-4 flex items-center">
                       <Folder className="w-5 h-5 mr-2 text-blue-500" />
                       {editingDept.id ? '编辑部门' : '添加部门'}
                   </h3>
                   <form onSubmit={handleSaveDept} className="space-y-4">
                       <div className="space-y-1.5">
                           <InputLabel>部门名称 <span className="text-red-500">*</span></InputLabel>
                           <FormInput placeholder="如：研发部" value={editingDept.name || ''} onChange={e => setEditingDept({...editingDept, name: e.target.value})} required />
                       </div>
                       
                       <div className="space-y-1.5">
                           <InputLabel>上级部门</InputLabel>
                           <select 
                                className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={editingDept.parentId || ''}
                                onChange={e => setEditingDept({...editingDept, parentId: e.target.value || null})}
                           >
                               <option value="">(无 - 作为一级部门)</option>
                               {departments.filter(d => d.id !== editingDept.id).map(d => (
                                   <option key={d.id} value={d.id}>{d.name}</option>
                               ))}
                           </select>
                       </div>

                       <div className="space-y-1.5">
                           <InputLabel>描述/职责</InputLabel>
                           <FormInput placeholder="部门职能描述..." value={editingDept.description || ''} onChange={e => setEditingDept({...editingDept, description: e.target.value})} />
                       </div>

                       <div className="flex justify-end space-x-2 mt-6">
                           <button type="button" onClick={() => setIsDeptModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
                           <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md">保存</button>
                       </div>
                   </form>
               </div>
           </div>
      )}

      {/* User Modal */}
      {isUserModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-scale-in">
                   <div className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
                        <h3 className="text-lg font-bold text-white flex items-center">
                            <UserIcon className="w-5 h-5 mr-2 text-blue-400" />
                            {editingUser.id ? '编辑成员信息' : '添加新成员'}
                        </h3>
                        <button onClick={() => setIsUserModalOpen(false)} className="text-gray-400 hover:text-white transition-colors hover:bg-gray-800 p-1 rounded-lg">
                            <X className="w-6 h-6" />
                        </button>
                   </div>
                   
                   <form onSubmit={handleSaveUser} className="p-6 overflow-y-auto max-h-[75vh] custom-scrollbar">
                       <div className="space-y-6">
                           {/* Basic Info */}
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="col-span-1 sm:col-span-2 space-y-1.5">
                                    <InputLabel>姓名 <span className="text-red-500">*</span></InputLabel>
                                    <FormInput placeholder="输入成员姓名" value={editingUser.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})} required />
                                </div>
                                
                                <div className="space-y-1.5">
                                    <InputLabel>邮箱 <span className="text-red-500">*</span></InputLabel>
                                    <FormInput type="email" placeholder="email@company.com" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} required />
                                </div>

                                <div className="space-y-1.5">
                                    <InputLabel>联系电话</InputLabel>
                                    <FormInput placeholder="手机或座机号码" value={editingUser.phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value})} />
                                </div>

                                <div className="space-y-1.5">
                                    <InputLabel>所属部门</InputLabel>
                                    {/* Replace simple input with select if departments exist */}
                                    {departments.length > 0 ? (
                                        <select
                                            className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={editingUser.department || ''}
                                            onChange={e => setEditingUser({...editingUser, department: e.target.value})}
                                        >
                                            <option value="">选择部门...</option>
                                            {departments.map(d => (
                                                <option key={d.id} value={d.id}>{getDepartmentFullPath(d.id)}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <FormInput placeholder="例如：销售部" value={editingUser.department || ''} onChange={e => setEditingUser({...editingUser, department: e.target.value})} />
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <InputLabel>系统角色</InputLabel>
                                    <select 
                                        className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
                                        value={editingUser.role}
                                        onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                                    >
                                        <option value="Member">成员 (普通权限)</option>
                                        <option value="TeamLeader">团队负责人 (团队权限)</option>
                                        <option value="Admin">系统管理员 (完全权限)</option>
                                    </select>
                                </div>
                           </div>

                           {/* Custom Fields */}
                           {userFields.length > 0 && (
                               <div className="space-y-4 pt-4 border-t border-gray-100">
                                   <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">其他属性</h4>
                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                       {userFields.map(def => (
                                           <div key={def.id} className="space-y-1.5">
                                               <InputLabel>{def.label}</InputLabel>
                                               <FormInput 
                                                   type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                                                   placeholder={`输入${def.label}...`}
                                                   value={userCustomFieldInputs[def.id] || ''}
                                                   onChange={e => setUserCustomFieldInputs({...userCustomFieldInputs, [def.id]: e.target.value})}
                                               />
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           )}
                       </div>
                       
                       <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-100">
                           <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-5 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700 font-medium transition-colors">取消</button>
                           <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md font-medium transition-colors">保存成员信息</button>
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
