
import React, { useState } from 'react';
import { User, CustomFieldDefinition } from '../types';
import { Users, Settings, Plus, Trash2, Shield, User as UserIcon, Type, Hash, Calendar, Pencil, X, Phone, Briefcase, Users2 } from 'lucide-react';

interface AdminPanelProps {
  users: User[];
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUserRole: (userId: string, role: 'Admin' | 'User') => void;
  fieldDefinitions: CustomFieldDefinition[];
  onAddField: (field: CustomFieldDefinition) => void;
  onDeleteField: (fieldId: string) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({
  users,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onUpdateUserRole,
  fieldDefinitions,
  onAddField,
  onDeleteField,
}) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'FIELDS'>('USERS');
  
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

  const userFieldDefinitions = fieldDefinitions.filter(f => f.target === 'User');

  // Fix: Made children optional to resolve TS error where children are perceived as missing in JSX tags
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
            <Users className="w-4 h-4 mr-2" /> 团队成员管理
          </button>
          <button
            onClick={() => setActiveTab('FIELDS')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center ${activeTab === 'FIELDS' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Settings className="w-4 h-4 mr-2" /> 配置中心
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
                                <p className="text-gray-500 flex items-center"><X className="w-3 h-3 mr-1.5 text-gray-400 opacity-0" /> {user.email}</p>
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

      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-scale-in">
             <div className="bg-gray-900 px-6 py-5 flex justify-between items-center">
                <div className="flex items-center space-x-3 text-white">
                    <UserIcon className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-bold">成员信息维护</h3>
                </div>
                <button onClick={() => setIsUserModalOpen(false)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800">
                   <X className="w-6 h-6" />
                </button>
             </div>
             <form onSubmit={handleSaveUser} className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <div className="md:col-span-1">
                        <InputLabel>姓名 <span className="text-red-500">*</span></InputLabel>
                        <FormInput 
                            required
                            placeholder="请输入真实姓名"
                            value={editingUser.name || ''}
                            onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                        />
                    </div>
                    <div className="md:col-span-1">
                        <InputLabel>邮箱地址 <span className="text-red-500">*</span></InputLabel>
                        <FormInput 
                            required
                            type="email"
                            placeholder="example@visitpro.com"
                            value={editingUser.email || ''}
                            onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                        />
                    </div>
                    <div className="md:col-span-1">
                        <InputLabel>联系电话</InputLabel>
                        <FormInput 
                            placeholder="138-0000-0000"
                            value={editingUser.phone || ''}
                            onChange={e => setEditingUser({...editingUser, phone: e.target.value})}
                        />
                    </div>
                    <div className="md:col-span-1">
                        <InputLabel>用户角色</InputLabel>
                        <select 
                            className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingUser.role}
                            onChange={e => setEditingUser({...editingUser, role: e.target.value as 'Admin' | 'User'})}
                        >
                            <option value="User">普通用户 / 销售</option>
                            <option value="Admin">系统管理员</option>
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <InputLabel>所属部门</InputLabel>
                        <FormInput 
                            placeholder="例如：销售部、市场部"
                            value={editingUser.department || ''}
                            onChange={e => setEditingUser({...editingUser, department: e.target.value})}
                        />
                    </div>
                    <div className="md:col-span-1">
                        <InputLabel>所属团队</InputLabel>
                        <FormInput 
                            placeholder="例如：华南二组"
                            value={editingUser.teamName || ''}
                            onChange={e => setEditingUser({...editingUser, teamName: e.target.value})}
                        />
                    </div>
                </div>

                {userFieldDefinitions.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">扩展属性配置</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {userFieldDefinitions.map(def => (
                                <div key={def.id}>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">{def.label}</label>
                                    <input 
                                        type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                                        className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                                        value={userCustomFieldInputs[def.id] || ''}
                                        onChange={e => setUserCustomFieldInputs({...userCustomFieldInputs, [def.id]: e.target.value})}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-10 flex space-x-4">
                    <button 
                        type="button" 
                        onClick={() => setIsUserModalOpen(false)} 
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition-all"
                    >
                        取消
                    </button>
                    <button 
                        type="submit" 
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-200"
                    >
                        确认保存
                    </button>
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
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-md mt-4">
                立即添加
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
