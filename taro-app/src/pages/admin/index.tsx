
import React, { useState } from 'react';
import { View as TaroView, Text as TaroText, Button as TaroButton, Input as TaroInput, ScrollView as TaroScrollView, Picker as TaroPicker } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getStorageData, updateSettings, addUser, deleteUser, addField, deleteField, saveStorageData, syncFromSupabase } from '../../services/storage';
import { User, CustomFieldDefinition, MySQLConfig, SupabaseConfig } from '../../types';
import './index.scss';

const View = TaroView as any;
const Text = TaroText as any;
const Button = TaroButton as any;
const Input = TaroInput as any;
const ScrollView = TaroScrollView as any;
const Picker = TaroPicker as any;

const TARGET_OPTIONS = ['Client', 'Visit', 'User'];
const TARGET_LABELS = ['客户 (Client)', '拜访 (Visit)', '用户 (User)'];
const TYPE_OPTIONS = ['text', 'number', 'date'];
const TYPE_LABELS = ['文本 (Text)', '数值 (Number)', '日期 (Date)'];

const AdminPage = () => {
  const [data, setData] = useState(getStorageData());
  const [activeTab, setActiveTab] = useState<'SETTINGS' | 'USERS' | 'FIELDS' | 'STORAGE'>('SETTINGS');
  
  // Settings Inputs
  const [geminiKey, setGeminiKey] = useState('');
  const [deepSeekKey, setDeepSeekKey] = useState('');
  const [userName, setUserName] = useState('');
  
  // New User Inputs
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

  // New Field Inputs
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldTargetIdx, setNewFieldTargetIdx] = useState(1); // Default to Visit
  const [newFieldTypeIdx, setNewFieldTypeIdx] = useState(0); // Default to text

  // Storage
  const [mysqlConfig, setMysqlConfig] = useState<MySQLConfig>({ host: '', port: '3306', username: '', password: '', database: '' });
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>({ url: '', anonKey: '' });

  const refresh = () => {
      const d = getStorageData();
      setData(d);
      setGeminiKey(d.settings.geminiApiKey || '');
      setDeepSeekKey(d.settings.aiConfig?.deepSeekApiKey || '');
      setUserName(d.settings.userName || '');
      setMysqlConfig(d.settings.mysqlConfig || { host: '', port: '3306', username: '', password: '', database: '' });
      setSupabaseConfig(d.settings.supabaseConfig || { url: '', anonKey: '' });
  };

  useDidShow(() => {
    refresh();
  });

  const saveConfig = () => {
      updateSettings({
          geminiApiKey: geminiKey,
          userName: userName,
          aiConfig: {
              activeModel: deepSeekKey ? 'DeepSeek' : 'Gemini',
              deepSeekApiKey: deepSeekKey
          }
      });
      refresh();
      Taro.showToast({ title: '配置已保存', icon: 'success' });
  };

  const handleBackup = () => {
      const json = JSON.stringify(data);
      Taro.setClipboardData({
          data: json,
          success: () => Taro.showModal({ title: '导出成功', content: '数据已复制到剪贴板，请粘贴保存到备忘录。', showCancel: false })
      });
  };

  const handleRestore = () => {
      Taro.showModal({
          title: '数据恢复',
          content: '请将备份的 JSON 内容粘贴到剪贴板，然后点击确定。这将会覆盖当前所有数据！',
          editable: true,
          placeholderText: '粘贴 JSON...',
          success: (res) => {
              const r = res as any;
              if (r.confirm && r.content) {
                  try {
                      const d = JSON.parse(r.content);
                      if (d.clients && d.visits) {
                          saveStorageData(d);
                          refresh();
                          Taro.showToast({ title: '恢复成功', icon: 'success' });
                      } else {
                          throw new Error("格式无效");
                      }
                  } catch(e) {
                      Taro.showToast({ title: '数据格式错误', icon: 'none' });
                  }
              }
          }
      } as any);
  };

  const handleSyncSupabase = async () => {
      await syncFromSupabase();
      refresh();
  };

  const handleAddUser = () => {
      if(!newUserName) return;
      addUser({
          id: Date.now().toString(),
          name: newUserName,
          email: newUserEmail,
          role: 'User',
          phone: '', department: '', teamName: '', avatarUrl: ''
      });
      setNewUserName(''); setNewUserEmail('');
      refresh();
  };

  const handleAddField = () => {
      if(!newFieldLabel) {
          Taro.showToast({ title: '请输入字段名称', icon: 'none' });
          return;
      }
      addField({
          id: Date.now().toString(),
          target: TARGET_OPTIONS[newFieldTargetIdx] as any,
          label: newFieldLabel,
          type: TYPE_OPTIONS[newFieldTypeIdx] as any
      });
      setNewFieldLabel('');
      refresh();
  };

  return (
    <View className="page-container bg-gray-50 h-screen flex flex-col">
      <View className="bg-white p-4 pt-safe flex justify-between items-center border-b border-gray-100">
          <Text className="text-2xl font-bold text-gray-900">系统管理</Text>
      </View>
      
      <ScrollView scrollX className="bg-white border-b border-gray-100">
          <View className="flex p-2 space-x-2">
            {['SETTINGS', 'USERS', 'FIELDS', 'STORAGE'].map(tab => (
                <View key={tab} className={`px-4 py-2 text-center text-xs font-bold rounded-lg whitespace-nowrap ${activeTab === tab ? 'bg-blue-50 text-blue-600' : 'text-gray-500'}`} onClick={() => setActiveTab(tab as any)}>
                    {tab === 'SETTINGS' ? '配置' : tab === 'USERS' ? '团队' : tab === 'FIELDS' ? '字段' : '存储备份'}
                </View>
            ))}
          </View>
      </ScrollView>

      <ScrollView scrollY className="flex-1 p-4 pb-safe">
        {activeTab === 'SETTINGS' && (
            <View className="space-y-4">
                <View className="bg-white p-4 rounded-xl shadow-sm">
                    <Text className="section-title">个人信息</Text>
                    <Input className="input-field" placeholder="您的姓名" value={userName} onInput={e => setUserName(e.detail.value)} />
                </View>

                <View className="bg-white p-4 rounded-xl shadow-sm">
                    <Text className="section-title">AI 模型配置</Text>
                    <View className="mb-3">
                        <Text className="text-xs text-gray-500 mb-1 block">Gemini API Key</Text>
                        <Input className="input-field" password placeholder="需支持录音分析" value={geminiKey} onInput={e => setGeminiKey(e.detail.value)} />
                    </View>
                    <View className="mb-3">
                        <Text className="text-xs text-gray-500 mb-1 block">DeepSeek API Key</Text>
                        <Input className="input-field" password placeholder="可选，用于文本分析" value={deepSeekKey} onInput={e => setDeepSeekKey(e.detail.value)} />
                    </View>
                    <Button className="bg-blue-600 text-white mt-4 rounded-xl text-sm" onClick={saveConfig}>保存配置</Button>
                </View>
            </View>
        )}

        {activeTab === 'USERS' && (
            <View>
                 <View className="bg-white p-4 rounded-xl shadow-sm mb-4">
                     <Text className="section-title">添加成员</Text>
                     <View className="flex gap-2">
                         <Input className="input-field flex-1" placeholder="姓名" value={newUserName} onInput={e => setNewUserName(e.detail.value)} />
                         <Input className="input-field flex-1" placeholder="邮箱" value={newUserEmail} onInput={e => setNewUserEmail(e.detail.value)} />
                     </View>
                     <Button className="bg-blue-600 text-white mt-2 text-xs w-full" onClick={handleAddUser}>添加</Button>
                 </View>
                 {data.users.map(u => (
                     <View key={u.id} className="bg-white p-4 rounded-xl shadow-sm mb-2 flex justify-between items-center">
                         <View>
                             <Text className="font-bold text-gray-900 block">{u.name}</Text>
                             <Text className="text-xs text-gray-500">{u.role}</Text>
                         </View>
                         {u.role !== 'Admin' && <Text className="text-red-500 text-xs p-2" onClick={() => { deleteUser(u.id); refresh(); }}>删除</Text>}
                     </View>
                 ))}
            </View>
        )}

        {activeTab === 'FIELDS' && (
            <View>
                <View className="bg-white p-4 rounded-xl shadow-sm mb-4">
                     <Text className="section-title">新增动态字段</Text>
                     
                     <View className="mb-3">
                         <Text className="text-xs text-gray-500 mb-1">字段名称</Text>
                         <Input className="input-field" placeholder="如：职位、预算范围" value={newFieldLabel} onInput={e => setNewFieldLabel(e.detail.value)} />
                     </View>

                     <View className="flex gap-2 mb-3">
                         <View className="flex-1">
                             <Text className="text-xs text-gray-500 mb-1">应用对象</Text>
                             <Picker range={TARGET_LABELS} value={newFieldTargetIdx} onChange={e => setNewFieldTargetIdx(Number(e.detail.value))}>
                                 <View className="input-field flex justify-between items-center">
                                     <Text>{TARGET_LABELS[newFieldTargetIdx]}</Text>
                                     <Text>▼</Text>
                                 </View>
                             </Picker>
                         </View>
                         <View className="flex-1">
                             <Text className="text-xs text-gray-500 mb-1">数据类型</Text>
                             <Picker range={TYPE_LABELS} value={newFieldTypeIdx} onChange={e => setNewFieldTypeIdx(Number(e.detail.value))}>
                                 <View className="input-field flex justify-between items-center">
                                     <Text>{TYPE_LABELS[newFieldTypeIdx]}</Text>
                                     <Text>▼</Text>
                                 </View>
                             </Picker>
                         </View>
                     </View>

                     <Button className="bg-indigo-600 text-white text-xs w-full py-2" onClick={handleAddField}>立即添加</Button>
                 </View>

                 {data.fieldDefinitions.map(f => (
                     <View key={f.id} className="bg-white p-4 rounded-xl shadow-sm mb-2 flex justify-between items-center">
                         <View>
                             <Text className="font-bold text-gray-900 block">{f.label}</Text>
                             <View className="flex space-x-2 mt-1">
                                 <Text className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded">{f.target}</Text>
                                 <Text className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded">{f.type}</Text>
                             </View>
                         </View>
                         <Text className="text-red-500 text-xs p-2" onClick={() => { deleteField(f.id); refresh(); }}>删除</Text>
                     </View>
                 ))}
            </View>
        )}

        {activeTab === 'STORAGE' && (
            <View className="space-y-4">
                 <View className="bg-white p-4 rounded-xl shadow-sm">
                    <Text className="section-title">数据备份</Text>
                    <View className="flex gap-3">
                        <Button className="flex-1 bg-gray-100 text-gray-800 text-xs py-2 m-0" onClick={handleBackup}>导出 JSON</Button>
                        <Button className="flex-1 bg-gray-100 text-gray-800 text-xs py-2 m-0" onClick={handleRestore}>导入恢复</Button>
                    </View>
                </View>

                {/* Supabase Config */}
                <View className="bg-white p-4 rounded-xl shadow-sm">
                    <Text className="section-title text-green-700">Supabase 后端 (BaaS)</Text>
                    <View className="bg-green-50 p-3 rounded mb-3">
                        <Text className="text-xs text-green-800 leading-relaxed">
                            切换到 Supabase 模式后，数据将实时同步到云端数据库。
                        </Text>
                    </View>
                    <Input className="input-field mb-2" placeholder="Project URL (https://xyz.supabase.co)" value={supabaseConfig.url} onInput={e => setSupabaseConfig({...supabaseConfig, url: e.detail.value})} />
                    <Input className="input-field mb-2" placeholder="Anon API Key" value={supabaseConfig.anonKey} onInput={e => setSupabaseConfig({...supabaseConfig, anonKey: e.detail.value})} />
                    
                    <View className="flex gap-3 mt-2">
                         <Button 
                            className={`flex-1 m-0 text-xs py-2 ${data.settings.storageMode === 'SUPABASE' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                            onClick={() => { updateSettings({ storageMode: 'SUPABASE', supabaseConfig }); refresh(); Taro.showToast({title:'已切换至 Supabase 模式', icon:'success'}); }}
                         >
                             {data.settings.storageMode === 'SUPABASE' ? '✓ 已启用' : '启用 Supabase'}
                         </Button>
                         <Button className="flex-1 bg-blue-600 text-white m-0 text-xs py-2" onClick={handleSyncSupabase}>立即同步云端数据</Button>
                    </View>
                </View>
            </View>
        )}
        <View className="h-10"></View>
      </ScrollView>
    </View>
  );
};

export default AdminPage;
