
import React, { useState } from 'react';
import { Client, CustomFieldDefinition, CustomFieldData } from '../types';
import { Search, Plus, MapPin, Building2, Phone, Mail, Pencil, Trash2, X } from 'lucide-react';

interface ClientManagerProps {
  clients: Client[];
  onAddClient: (client: Client) => void;
  onUpdateClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  fieldDefinitions: CustomFieldDefinition[];
}

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
    
    // Fix: Explicitly type customFieldsData and cast value to string to resolve 'unknown' type error on line 53
    const customFieldsData: CustomFieldData[] = Object.entries(customFieldInputs).map(([fieldId, value]) => ({
      fieldId,
      value: value as string
    }));

    if (editingClient.id) {
        const updated: Client = {
            ...editingClient as Client,
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
            industry: editingClient.industry || 'Technology',
            status: (editingClient.status as any) || 'Active',
            avatarUrl: `https://picsum.photos/seed/${editingClient.name}/200`,
            // Fix: customFieldsData is now correctly typed for assignment here at line 67
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-4">
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
                <img src={client.avatarUrl} alt={client.name} className="w-16 h-16 rounded-full bg-gray-100 object-cover" />
                <div>
                    <h3 className="font-bold text-gray-900">{client.name}</h3>
                    <p className="text-sm text-gray-500">{client.company}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${client.status === 'Active' ? 'bg-green-100 text-green-700' : client.status === 'Lead' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {translateStatus(client.status)}
                    </span>
                </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600 flex-1">
                <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span>{client.industry}</span>
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
                                <span className="text-gray-400 block">{getFieldLabel(cf.fieldId)}</span>
                                <span className="text-gray-700">{cf.value}</span>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
                <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">{editingClient.id ? '编辑客户' : '添加客户'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">姓名 <span className="text-red-500">*</span></label>
                            <input required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={editingClient.name || ''} onChange={e => setEditingClient({...editingClient, name: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">公司 <span className="text-red-500">*</span></label>
                            <input required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={editingClient.company || ''} onChange={e => setEditingClient({...editingClient, company: e.target.value})} />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">行业</label>
                             <input className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={editingClient.industry || ''} onChange={e => setEditingClient({...editingClient, industry: e.target.value})} />
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                             <select className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={editingClient.status} onChange={e => setEditingClient({...editingClient, status: e.target.value as any})}>
                                 <option value="Active">活跃 (Active)</option>
                                 <option value="Lead">潜在 (Lead)</option>
                                 <option value="Churned">流失 (Churned)</option>
                             </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                        <input type="email" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={editingClient.email || ''} onChange={e => setEditingClient({...editingClient, email: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                        <input className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={editingClient.phone || ''} onChange={e => setEditingClient({...editingClient, phone: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                        <input className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={editingClient.address || ''} onChange={e => setEditingClient({...editingClient, address: e.target.value})} />
                    </div>

                    {clientDefinitions.length > 0 && (
                        <div className="pt-4 border-t border-gray-100">
                             <h4 className="text-sm font-bold text-gray-700 mb-3">其他信息</h4>
                             <div className="space-y-3">
                                 {clientDefinitions.map(def => (
                                     <div key={def.id}>
                                         <label className="block text-xs font-medium text-gray-500 mb-1">{def.label}</label>
                                         <input 
                                             type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                                             className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                                             value={customFieldInputs[def.id] || ''}
                                             onChange={e => setCustomFieldInputs({...customFieldInputs, [def.id]: e.target.value})}
                                         />
                                     </div>
                                 ))}
                             </div>
                        </div>
                    )}

                    <div className="pt-4 flex space-x-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2.5 rounded-lg transition-colors">取消</button>
                        <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors shadow-sm">保存</button>
                    </div>
                </form>
            </div>
          </div>
      )}
    </div>
  );
};

export default ClientManager;
