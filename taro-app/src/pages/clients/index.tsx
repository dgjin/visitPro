
import React, { useState } from 'react';
import { View as TaroView, Text as TaroText, Input as TaroInput, ScrollView as TaroScrollView, Button as TaroButton, Picker as TaroPicker } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getStorageData, addClient, updateClient } from '../../services/storage';
import { Client } from '../../types';
import './index.scss';

const View = TaroView as any;
const Text = TaroText as any;
const Input = TaroInput as any;
const ScrollView = TaroScrollView as any;
const Button = TaroButton as any;
const Picker = TaroPicker as any;

const INDUSTRIES = ["制造", "IT/软件", "金融", "建筑", "医疗", "零售", "教育", "其他"];

const ClientsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [showModal, setShowModal] = useState(false);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formIndustry, setFormIndustry] = useState('其他');
  const [formStatus, setFormStatus] = useState('Active');

  useDidShow(() => {
      setClients(getStorageData().clients);
  });

  const filtered = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.company.toLowerCase().includes(searchTerm.toLowerCase()));

  const openAdd = () => {
      setEditingId(null);
      setFormName('');
      setFormCompany('');
      setFormIndustry('其他');
      setFormStatus('Active');
      setShowModal(true);
  };

  const openEdit = (c: Client) => {
      setEditingId(c.id);
      setFormName(c.name);
      setFormCompany(c.company);
      setFormIndustry(c.industry || '其他');
      setFormStatus(c.status);
      setShowModal(true);
  };

  const handleSave = () => {
      if (!formName || !formCompany) return;
      
      const clientData: Client = {
          id: editingId || Date.now().toString(),
          name: formName,
          company: formCompany,
          email: '',
          phone: '',
          address: '',
          avatarUrl: '',
          industry: formIndustry,
          status: formStatus as any
      };
      
      if (editingId) {
          updateClient(clientData);
      } else {
          addClient(clientData);
      }
      
      setClients(getStorageData().clients);
      setShowModal(false);
      Taro.showToast({ title: '保存成功', icon: 'success' });
  };

  return (
    <View className="page-container h-screen bg-gray-50 flex flex-col relative">
      <View className="header bg-white p-4 pb-2">
        <View className="flex justify-between items-center mb-4">
             <Text className="text-xl font-bold">客户列表</Text>
             <Text className="text-blue-600 text-sm font-bold" onClick={openAdd}>添加 +</Text>
        </View>
        <View className="search-box bg-gray-100 rounded-lg p-2 flex items-center mb-2">
            <Text className="icon mr-2 text-gray-400">🔍</Text>
            <Input 
                className="flex-1 text-sm" 
                placeholder="搜索姓名或公司..." 
                value={searchTerm}
                onInput={e => setSearchTerm(e.detail.value)}
            />
        </View>
      </View>

      <ScrollView className="flex-1 p-4" scrollY>
        {filtered.map(client => (
            <View key={client.id} className="card bg-white p-4 rounded-xl shadow-sm mb-3 flex items-center" onClick={() => openEdit(client)}>
                <View className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 bg-blue-100 text-blue-600`}>
                    <Text className="font-bold text-lg">{client.name.charAt(0)}</Text>
                </View>
                <View className="flex-1">
                    <View className="flex justify-between items-start">
                        <Text className="font-bold text-gray-900 text-base">{client.name}</Text>
                        <Text className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            client.status === 'Active' ? 'bg-green-50 text-green-600' :
                            client.status === 'Lead' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                            {client.status}
                        </Text>
                    </View>
                    <Text className="text-sm text-gray-600 block mt-0.5">{client.company}</Text>
                    <Text className="text-xs text-gray-400 block mt-1">{client.industry}</Text>
                </View>
            </View>
        ))}
        <View className="h-10"></View>
      </ScrollView>

      {showModal && (
          <View className="fixed inset-0 z-50 flex items-center justify-center">
              <View className="absolute inset-0 bg-black opacity-50" onClick={() => setShowModal(false)}></View>
              <View className="bg-white rounded-xl p-6 w-80 z-10">
                  <Text className="text-lg font-bold mb-4 block">{editingId ? '编辑客户' : '添加新客户'}</Text>
                  
                  <Input className="bg-gray-50 p-2 rounded mb-3 text-sm border border-gray-200" placeholder="客户姓名" value={formName} onInput={e => setFormName(e.detail.value)}/>
                  <Input className="bg-gray-50 p-2 rounded mb-3 text-sm border border-gray-200" placeholder="公司名称" value={formCompany} onInput={e => setFormCompany(e.detail.value)}/>
                  
                  <Picker mode="selector" range={INDUSTRIES} onChange={e => setFormIndustry(INDUSTRIES[e.detail.value])}>
                      <View className="bg-gray-50 p-2 rounded mb-3 text-sm border border-gray-200 flex justify-between">
                          <Text>行业: {formIndustry}</Text>
                          <Text>▼</Text>
                      </View>
                  </Picker>

                   <Picker mode="selector" range={['Active', 'Lead', 'Churned']} onChange={e => setFormStatus(['Active', 'Lead', 'Churned'][e.detail.value])}>
                      <View className="bg-gray-50 p-2 rounded mb-4 text-sm border border-gray-200 flex justify-between">
                          <Text>状态: {formStatus}</Text>
                          <Text>▼</Text>
                      </View>
                  </Picker>

                  <View className="flex space-x-2">
                      <Button className="flex-1 bg-gray-100 text-gray-700 m-0 text-sm" onClick={() => setShowModal(false)}>取消</Button>
                      <Button className="flex-1 bg-blue-600 text-white m-0 text-sm" onClick={handleSave}>保存</Button>
                  </View>
              </View>
          </View>
      )}
    </View>
  );
};

export default ClientsPage;
