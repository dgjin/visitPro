
import React, { useState } from 'react';
import { Client, CustomFieldDefinition, CustomFieldData } from '../types';
import { Search, Plus, MapPin, Building2, Phone, Mail, Pencil, Trash2, X, User, Layers, Activity, Briefcase } from 'lucide-react';

interface ClientManagerProps {
  clients: Client[];
  onAddClient: (client: Client) => void;
  onUpdateClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  fieldDefinitions: CustomFieldDefinition[];
}

// 国标行业分类（GB/T 4754—2017）门类
const INDUSTRIES = [
  "A 农、林、牧、渔业",
  "B 采矿业",
  "C 制造业",
  "D 电力、热力、燃气及水生产和供应业",
  "E 建筑业",
  "F 批发和零售业",
  "G 交通运输、仓储和邮政业",
  "H 住宿和餐饮业",
  "I 信息传输、软件和信息技术服务业",
  "J 金融业",
  "K 房地产业",
  "L 租赁和商务服务业",
  "M 科学研究和技术服务业",
  "N 水利、环境和公共设施管理业",
  "O 居民服务、修理和其他服务业",
  "P 教育",
  "Q 卫生和社会工作",
  "R 文化、体育和娱乐业",
  "S 公共管理、社会保障和社会组织",
  "T 国际组织"
];

const ClientManager: React.FC<ClientManagerProps> = ({ clients, onAddClient, onUpdateClient, onDeleteClient, fieldDefinitions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client>>({ customFields: [] });
  const [customFieldInputs, setCustomFieldInputs] = useState<Record<string, string>>({});

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const clientDefinitions = fieldDefinitions.filter(d => d.target === 'Client');

  const openModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      const inputs: Record<string, string> = {};
      client.customFields?.forEach(cf => {
        inputs[cf.fieldId] = cf.value;
      });
      setCustomFieldInputs(inputs);
    } else {
      setEditingClient({ customFields: [], status: 'Active' });
      setCustomFieldInputs({});
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient.name || !editingClient.company) return;
    
    const customFieldsData: CustomFieldData[] = Object.entries(customFieldInputs).map(([fieldId, value]) => ({
      fieldId,
      value: value as string
    }));

    if (editingClient.id) {
        // Explicitly construct updated object to ensure data integrity
        const updated: Client = {
            id: editingClient.id!, // Ensure ID is present
            name: editingClient.name!,
            company: editingClient.company!,
            email: editingClient.email || '',
            phone: editingClient.phone || '',
            address: editingClient.address || '',
            industry: editingClient.industry || '',
            status: (editingClient.status as any) || 'Active',
            avatarUrl: editingClient.avatarUrl || `https://picsum.photos/seed/${editingClient.name}/200`,
            customFields: customFieldsData
        };
        onUpdateClient(updated);
    } else {
        const client: Client = {
            id: crypto.randomUUID(),
            name: editingClient.name!,
            company: editingClient.company!,
            email: editingClient.email || '',
            phone: editingClient.phone || '',
            address: editingClient.address || '',
            industry: editingClient.industry || '',
            status: (editingClient.status as any) || 'Active',
            avatarUrl: `https://picsum.photos/seed/${editingClient.name}/200`,
            customFields: customFieldsData
        };
        onAddClient(client);
    }
    
    setIsModalOpen(false);
    setEditingClient({ customFields: [] });
    setCustomFieldInputs({});
  };

  const translateStatus = (status: string) => {
    switch(status) {
      case 'Active': return '活跃';
      case 'Lead': return '潜在';
      case 'Churned': return '流失';
      default: return status;
    }
  };

  const getFieldLabel = (fieldId: string) => {
    const def = fieldDefinitions.find(d => d.id === fieldId);
    return def ? def.label : '未知字段';
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="搜索客户..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={() => openModal()}
          className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>添加客户</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-4 custom-scrollbar">
        {filteredClients.map(client => (
          <div key={client.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col group relative">
            <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => openModal(client)}
                    className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => onDeleteClient(client.id)}
                    className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <div className="flex items-center space-x-4 mb-4">
                <img src={client.avatarUrl} alt={client.name} className="w-16 h-16 rounded-full bg-gray-100 object-cover border-2 border-white shadow-sm" />
                <div>
                    <h3 className="font-bold text-gray-900">{client.name}</h3>
                    <p className="text-sm text-gray-500">{client.company}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${client.status === 'Active' ? 'bg-green-100 text-green-700' : client.status === 'Lead' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {translateStatus(client.status)}
                    </span>
                </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600 flex-1">
                <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-gray-400" />
                    <span className="truncate" title={client.industry}>{client.industry || '未分类'}</span>
                </div>
                {client.email && (
                    <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{client.email}</span>
                    </div>
                )}
                {client.phone && (
                    <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span>{client.phone}</span>
                    </div>
                )}
                {client.address && (
                    <div className="flex items-center space-x-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{client.address}</span>
                    </div>
                )}
                
                {/* Custom Fields Display */}
                {client.customFields && client.customFields.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2">
                        {client.customFields.map(cf => (
                            <div key={cf.fieldId} className="text-xs">
                                <span className="text-gray-400 block mb-0.5">{getFieldLabel(cf.fieldId)}</span>
                                <span className="text-gray-700 font-medium">{cf.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>
        ))}
        {filteredClients.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
                未找到相关客户。
            </div>
        )}
      </div>

      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-scale-in">
                <div className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center">
                        <User className="w-5 h-5 mr-2 text-blue-400" />
                        {editingClient.id ? '编辑客户资料' : '添加新客户'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors hover:bg-gray-800 p-1 rounded-lg">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    
                    {/* Basic Information Section */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center">
                            基本信息
                        </h4>
                        <div className="grid grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">姓名 <span className="text-red-500">*</span></label>
                                <div className="relative group">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input required className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                                        placeholder="客户姓名"
                                        value={editingClient.name || ''} 
                                        onChange={e => setEditingClient({...editingClient, name: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">公司 <span className="text-red-500">*</span></label>
                                <div className="relative group">
                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input required className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                                        placeholder="所属公司"
                                        value={editingClient.company || ''} 
                                        onChange={e => setEditingClient({...editingClient, company: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                 <label className="text-xs font-semibold text-gray-600">行业分类</label>
                                 <div className="relative group">
                                    <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <select 
                                        className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer" 
                                        value={editingClient.industry || ''} 
                                        onChange={e => setEditingClient({...editingClient, industry: e.target.value})}
                                    >
                                        <option value="">选择行业分类...</option>
                                        {INDUSTRIES.map((ind) => (
                                            <option key={ind} value={ind}>{ind}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                 </div>
                            </div>
                            <div className="space-y-1.5">
                                 <label className="text-xs font-semibold text-gray-600">当前状态</label>
                                 <div className="relative group">
                                     <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                     <select 
                                        className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer" 
                                        value={editingClient.status} 
                                        onChange={e => setEditingClient({...editingClient, status: e.target.value as any})}
                                     >
                                         <option value="Active">活跃 (Active)</option>
                                         <option value="Lead">潜在 (Lead)</option>
                                         <option value="Churned">流失 (Churned)</option>
                                     </select>
                                     <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                 </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center">
                             联系方式
                        </h4>
                        <div className="grid grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">电子邮箱</label>
                                <div className="relative group">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input type="email" className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                                        placeholder="name@company.com"
                                        value={editingClient.email || ''} 
                                        onChange={e => setEditingClient({...editingClient, email: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">联系电话</label>
                                <div className="relative group">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                                        placeholder="电话号码"
                                        value={editingClient.phone || ''} 
                                        onChange={e => setEditingClient({...editingClient, phone: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div className="col-span-2 space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">办公地址</label>
                                <div className="relative group">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                                        placeholder="详细办公地址"
                                        value={editingClient.address || ''} 
                                        onChange={e => setEditingClient({...editingClient, address: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Custom Fields */}
                    {clientDefinitions.length > 0 && (
                        <div className="space-y-4">
                             <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center">
                                其他信息
                             </h4>
                             <div className="grid grid-cols-2 gap-5">
                                 {clientDefinitions.map(def => (
                                     <div key={def.id} className="space-y-1.5">
                                         <label className="text-xs font-semibold text-gray-600">{def.label}</label>
                                         <div className="relative group">
                                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                            <input 
                                                type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                                                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                value={customFieldInputs[def.id] || ''}
                                                onChange={e => setCustomFieldInputs({...customFieldInputs, [def.id]: e.target.value})}
                                                placeholder={`输入${def.label}...`}
                                            />
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    )}

                    <div className="pt-6 flex space-x-3 border-t border-gray-100">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-bold py-3 rounded-xl transition-colors">取消</button>
                        <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-blue-100">保存信息</button>
                    </div>
                </form>
            </div>
          </div>
      )}
    </div>
  );
};

export default ClientManager;
