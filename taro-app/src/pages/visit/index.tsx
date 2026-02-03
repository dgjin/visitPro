
import React, { useState, useRef, useEffect } from 'react';
import { View as TaroView, Text as TaroText, Input as TaroInput, Button as TaroButton, Textarea as TaroTextarea, Picker as TaroPicker, ScrollView as TaroScrollView } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { nativeRecorder } from '../../services/nativeRecorder';
import { analyzeVisitAudio, analyzeVisitNotes } from '../../services/geminiService';
import { getStorageData, addVisit, updateVisit, deleteVisit, updateSettings } from '../../services/storage';
import { Client, Visit, CustomFieldDefinition, Attachment, AIModelProvider, CustomFieldData } from '../../types';
import './index.scss';

const View = TaroView as any;
const Text = TaroText as any;
const Input = TaroInput as any;
const Button = TaroButton as any;
const Textarea = TaroTextarea as any;
const Picker = TaroPicker as any;
const ScrollView = TaroScrollView as any;

const VisitPage = () => {
  const router = useRouter();
  
  // Views: LIST, EDIT, CALENDAR
  const [currentView, setCurrentView] = useState<'LIST' | 'EDIT' | 'CALENDAR'>('LIST');

  // List View State
  const [visits, setVisits] = useState<Visit[]>([]);
  const [filterOutcome, setFilterOutcome] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Edit/Create State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [selectedClientIdx, setSelectedClientIdx] = useState<number>(-1);
  const [clientPosition, setClientPosition] = useState<string>(''); // Added for read-only position
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Outbound');
  const [notes, setNotes] = useState('');
  const [participants, setParticipants] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  // Settings / Modals
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [activeModel, setActiveModel] = useState<AIModelProvider>('Gemini');

  // AI & Audio
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordTimer, setRecordTimer] = useState<any>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const audioCtxRef = useRef<Taro.InnerAudioContext | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  // Settings Temp State
  const [tempDeepSeekKey, setTempDeepSeekKey] = useState('');
  const [tempEmailConfig, setTempEmailConfig] = useState<any>({});
  
  // Field Definitions (Global)
  const [allFieldDefs, setAllFieldDefs] = useState<CustomFieldDefinition[]>([]);

  const loadData = () => {
    const data = getStorageData();
    setVisits(data.visits.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setClients(data.clients);
    setAllFieldDefs(data.fieldDefinitions);
    setCustomFields(data.fieldDefinitions.filter(f => f.target === 'Visit'));
    setActiveModel(data.settings.aiConfig?.activeModel || 'Gemini');
    setTempDeepSeekKey(data.settings.aiConfig?.deepSeekApiKey || '');
    setTempEmailConfig(data.settings.emailConfig || {});
  };

  useDidShow(() => {
    loadData();
    if (router.params.id) {
        openEdit(router.params.id);
    }
  });

  // Extract client position whenever selectedClientIdx changes
  useEffect(() => {
    if (selectedClientIdx >= 0 && clients[selectedClientIdx]) {
        const client = clients[selectedClientIdx];
        // Look for field named "职位" or "Position" in global defs
        const posDef = allFieldDefs.find(f => f.target === 'Client' && (f.label.includes('职位') || f.label.toLowerCase().includes('position')));
        if (posDef && client.customFields) {
            const fieldVal = client.customFields.find(cf => cf.fieldId === posDef.id)?.value;
            setClientPosition(fieldVal || '未录入');
        } else {
            setClientPosition('未配置职位字段');
        }
    } else {
        setClientPosition('');
    }
  }, [selectedClientIdx, clients, allFieldDefs]);

  const openEdit = (visitId?: string) => {
      setEditingId(visitId || null);
      setAiResult(null);
      setClientPosition('');
      
      if (visitId) {
          const v = visits.find(v => v.id === visitId);
          if (v) {
            const cIdx = clients.findIndex(c => c.id === v.clientId);
            setSelectedClientIdx(cIdx);
            setDate(v.date.split('T')[0]);
            setCategory(v.category);
            setNotes(v.rawNotes);
            setParticipants(v.participants || '');
            setAttachments(v.attachments || []);
            const cf: Record<string, string> = {};
            v.customFields?.forEach(f => cf[f.fieldId] = f.value);
            setCustomFieldValues(cf);
            
            // Restore AI display
            setAiResult({
                summary: v.summary,
                sentiment: v.outcome === 'Pending' ? 'Neutral' : v.outcome,
                actionItems: v.actionItems,
                followUpEmailDraft: v.followUpEmailDraft
            });
          }
      } else {
          // New
          setSelectedClientIdx(-1);
          setDate(new Date().toISOString().split('T')[0]);
          setCategory('Outbound');
          setNotes('');
          setParticipants('');
          setAttachments([]);
          setCustomFieldValues({});
      }
      setCurrentView('EDIT');
  };

  const handleSave = () => {
      if (selectedClientIdx < 0) {
          Taro.showToast({ title: '请选择客户', icon: 'none' });
          return;
      }
      const client = clients[selectedClientIdx];
      const cfData: CustomFieldData[] = Object.entries(customFieldValues).map(([k, v]) => ({ fieldId: k, value: String(v) }));
      
      const visitData: Visit = {
          id: editingId || Date.now().toString(),
          clientId: client.id,
          clientName: client.name,
          userId: 'current',
          date: new Date(date).toISOString(),
          category: category as any,
          rawNotes: notes,
          summary: aiResult?.summary || (notes.length > 20 ? notes.substring(0, 20) + '...' : '暂无摘要'),
          outcome: aiResult?.sentiment || 'Pending',
          actionItems: aiResult?.actionItems || [],
          sentimentScore: 60,
          attachments,
          participants,
          followUpEmailDraft: aiResult?.followUpEmailDraft,
          customFields: cfData
      };

      if (editingId) updateVisit(visitData);
      else addVisit(visitData);

      Taro.showToast({ title: '保存成功', icon: 'success' });
      loadData();
      setCurrentView('LIST');
  };

  const handleDelete = () => {
      if (editingId) {
          Taro.showModal({
              title: '确认删除',
              content: '删除后无法恢复，确定吗？',
              success: (res) => {
                  if (res.confirm) {
                      deleteVisit(editingId);
                      loadData();
                      setCurrentView('LIST');
                  }
              }
          })
      }
  };

  const handleRecordToggle = async () => {
      if (isRecording) {
          clearInterval(recordTimer);
          setIsRecording(false);
          setRecordDuration(0);
          try {
              Taro.showLoading({ title: '保存录音...' });
              const res = await nativeRecorder.stop();
              Taro.hideLoading();
              
              if (res.base64Data) {
                  const newAtt: Attachment = {
                      id: Date.now().toString(),
                      name: `语音 ${new Date().toLocaleTimeString()}`,
                      type: 'document',
                      url: `data:audio/mp3;base64,${res.base64Data}`
                  };
                  setAttachments([...attachments, newAtt]);
                  setNotes(prev => prev + `\n[录音 ${Math.round(res.duration/1000)}s - 已就绪]`);
                  Taro.showToast({ title: '录音已保存，请点击 AI 分析进行转写', icon: 'none', duration: 3000 });
              } else {
                  Taro.showToast({ title: '录音数据为空', icon: 'none' });
              }
          } catch(e) {
              Taro.hideLoading();
              Taro.showToast({ title: '录音失败', icon: 'none' });
          }
      } else {
          const s = await Taro.getSetting({});
          if (!s.authSetting['scope.record']) await Taro.authorize({ scope: 'scope.record' });
          
          nativeRecorder.start(() => {
              setIsRecording(true);
              setRecordTimer(setInterval(() => setRecordDuration(p => p+1), 1000));
          }, (err) => {
              Taro.showToast({ title: '录音启动失败', icon:'none'});
          });
      }
  };

  const playAudio = (url: string) => {
      if (!audioCtxRef.current) audioCtxRef.current = Taro.createInnerAudioContext();
      if (playingUrl === url) {
          audioCtxRef.current.stop();
          setPlayingUrl(null);
      } else {
          audioCtxRef.current.stop();
          audioCtxRef.current.src = url;
          audioCtxRef.current.play();
          setPlayingUrl(url);
          audioCtxRef.current.onEnded(() => setPlayingUrl(null));
      }
  };

  const handleAI = async () => {
      const clientName = selectedClientIdx >= 0 ? clients[selectedClientIdx].name : 'Client';
      // Find the last VALID audio attachment (must contain base64)
      const lastAudio = [...attachments].reverse().find(a => a.url && a.url.startsWith('data:audio'));
      
      if (!notes && !lastAudio) return Taro.showToast({title: '无内容可分析', icon:'none'});

      setIsAnalyzing(true);
      Taro.showLoading({ title: `${activeModel} 正在分析音频/笔记...` });
      
      try {
          let res;
          if (lastAudio && activeModel === 'Gemini') {
               // Robustly extracting base64
               const parts = lastAudio.url.split(',');
               if (parts.length === 2) {
                   const b64 = parts[1];
                   res = await analyzeVisitAudio(clientName, b64);
               } else {
                   // Fallback to text analysis if audio is invalid
                   res = await analyzeVisitNotes(clientName, notes);
               }
          } else {
               res = await analyzeVisitNotes(clientName, notes);
          }
          
          setAiResult(res);
          
          // CRITICAL FIX: Ensure transcription is appended to notes clearly
          if (res.transcription) {
              setNotes(prev => {
                  // Avoid duplicating transcription if already present
                  if (prev.includes(res.transcription)) return prev;
                  return (prev ? prev + "\n\n" : "") + "【AI 转写】:\n" + res.transcription;
              });
          }
          
          Taro.hideLoading();
      } catch (e: any) {
          Taro.hideLoading();
          console.error(e);
          Taro.showModal({ title: 'AI 错误', content: e.message || '未知错误', showCancel: false });
      } finally {
          setIsAnalyzing(false);
      }
  };

  const saveAISettings = () => {
      updateSettings({
          aiConfig: { activeModel: activeModel, deepSeekApiKey: tempDeepSeekKey }
      });
      setShowAIConfig(false);
      loadData();
  };

  const saveEmailSettings = () => {
      updateSettings({ emailConfig: tempEmailConfig });
      setShowEmailConfig(false);
      Taro.showToast({title: '邮件配置已保存', icon:'success'});
  };

  const filteredVisits = visits.filter(v => {
      if (filterOutcome !== 'All' && v.outcome !== filterOutcome) return false;
      if (searchTerm && !v.clientName.includes(searchTerm) && !v.summary.includes(searchTerm)) return false;
      return true;
  });

  const renderListOrCalendar = () => {
      if (currentView === 'CALENDAR') {
          // Simplified Calendar: Group by Date
          const grouped = filteredVisits.reduce((acc, v) => {
              const d = v.date.split('T')[0];
              if(!acc[d]) acc[d] = [];
              acc[d].push(v);
              return acc;
          }, {});
          const sortedDates = Object.keys(grouped).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());

          return (
              <ScrollView scrollY className="flex-1 p-4 pb-safe">
                  {sortedDates.map(d => (
                      <View key={d} className="mb-4">
                          <Text className="text-gray-500 font-bold mb-2 block">{d}</Text>
                          {grouped[d].map((v: Visit) => (
                              <View key={v.id} className="bg-white p-3 rounded-xl border border-gray-100 mb-2 flex items-center shadow-sm" onClick={() => openEdit(v.id)}>
                                  <View className={`w-1 h-8 rounded-full mr-3 ${v.category==='Inbound'?'bg-purple-500':'bg-blue-500'}`}></View>
                                  <View className="flex-1">
                                      <Text className="font-bold text-gray-800 text-sm block">{v.clientName}</Text>
                                      <Text className="text-xs text-gray-500 line-clamp-1">{v.summary}</Text>
                                  </View>
                                  <Text className="text-xs text-gray-400">{v.date.split('T')[1].substring(0,5)}</Text>
                              </View>
                          ))}
                      </View>
                  ))}
                  {sortedDates.length === 0 && <View className="p-10 text-center text-gray-400">暂无日历安排</View>}
                  <View className="h-20"></View>
              </ScrollView>
          )
      }

      return (
          <ScrollView scrollY className="flex-1 p-4 pb-safe">
              {filteredVisits.map(v => (
                  <View key={v.id} className="bg-white p-4 rounded-2xl shadow-sm mb-3 active:bg-gray-50" onClick={() => openEdit(v.id)}>
                       <View className="flex justify-between items-start">
                           <View>
                               <Text className="font-bold text-gray-900 block text-base">{v.clientName}</Text>
                               <Text className="text-xs text-gray-400 block mt-1">{new Date(v.date).toLocaleDateString()}</Text>
                           </View>
                           <Text className={`text-[10px] px-2 py-1 rounded-md font-bold ${
                               v.outcome === 'Positive' ? 'bg-green-50 text-green-700' : 
                               v.outcome === 'Negative' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                           }`}>
                               {v.outcome}
                           </Text>
                       </View>
                       <Text className="text-sm text-gray-600 mt-2 line-clamp-2">{v.summary}</Text>
                  </View>
              ))}
              <View className="h-20"></View>
          </ScrollView>
      );
  };

  if (currentView === 'LIST' || currentView === 'CALENDAR') {
      return (
          <View className="page-container h-screen flex flex-col bg-gray-50">
              <View className="bg-white p-4 pb-2 border-b border-gray-100 pt-safe">
                  <View className="flex justify-between items-center mb-4">
                      <View className="flex bg-gray-100 rounded-lg p-1">
                          <View onClick={() => setCurrentView('LIST')} className={`px-4 py-1 rounded-md text-xs font-bold ${currentView==='LIST'?'bg-white shadow text-blue-600':'text-gray-500'}`}>列表</View>
                          <View onClick={() => setCurrentView('CALENDAR')} className={`px-4 py-1 rounded-md text-xs font-bold ${currentView==='CALENDAR'?'bg-white shadow text-blue-600':'text-gray-500'}`}>日历</View>
                      </View>
                      <View className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-200" onClick={() => openEdit()}>
                          <Text className="text-xl font-light">+</Text>
                      </View>
                  </View>
                  <View className="flex space-x-3 mb-2">
                      <Input className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm" placeholder="搜索客户..." value={searchTerm} onInput={e => setSearchTerm(e.detail.value)} />
                      <Picker mode="selector" range={['All', 'Positive', 'Negative', 'Pending']} onChange={e => setFilterOutcome(['All', 'Positive', 'Negative', 'Pending'][e.detail.value])}>
                          <View className="bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-600 flex items-center">
                              {filterOutcome} <Text className="ml-1 text-xs">▼</Text>
                          </View>
                      </Picker>
                  </View>
              </View>

              {renderListOrCalendar()}
          </View>
      );
  }

  // Edit View
  return (
      <View className="page-container h-screen flex flex-col bg-gray-50 animate-slide-up">
          <View className="bg-white px-4 py-3 border-b border-gray-100 flex justify-between items-center pt-safe sticky top-0 z-10">
              <Text className="text-blue-600" onClick={() => setCurrentView('LIST')}>取消</Text>
              <Text className="font-bold text-lg">{editingId ? '编辑' : '新建'}拜访</Text>
              <Text className="text-blue-600 font-bold" onClick={handleSave}>保存</Text>
          </View>

          <ScrollView scrollY className="flex-1 p-4">
              {/* Client & Date */}
              <View className="bg-white p-4 rounded-2xl shadow-sm mb-4">
                  <Picker mode="selector" range={clients} rangeKey="name" onChange={e => setSelectedClientIdx(parseInt(e.detail.value))}>
                      <View className="flex justify-between py-3 border-b border-gray-50">
                          <Text className="text-gray-600">客户</Text>
                          <Text className={selectedClientIdx >= 0 ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                              {selectedClientIdx >= 0 ? clients[selectedClientIdx].name : '选择客户 >'}
                          </Text>
                      </View>
                  </Picker>
                  
                  {/* Read-only Position Field */}
                  {selectedClientIdx >= 0 && (
                      <View className="flex justify-between py-3 border-b border-gray-50 bg-gray-50/50 px-2 rounded">
                          <Text className="text-gray-500 text-sm">客户职位</Text>
                          <Text className="text-gray-700 font-medium text-sm">{clientPosition || '未录入'}</Text>
                      </View>
                  )}
                  
                  <Picker mode="date" value={date} onChange={e => setDate(e.detail.value)}>
                      <View className="flex justify-between py-3 border-b border-gray-50">
                          <Text className="text-gray-600">日期</Text>
                          <Text className="text-gray-900 font-medium">{date}</Text>
                      </View>
                  </Picker>

                  <View className="flex justify-between py-3 items-center">
                      <Text className="text-gray-600">类型</Text>
                      <View className="flex bg-gray-100 rounded-lg p-0.5">
                          <View onClick={() => setCategory('Outbound')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${category === 'Outbound' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>外出</View>
                          <View onClick={() => setCategory('Inbound')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${category === 'Inbound' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>来访</View>
                      </View>
                  </View>

                   <View className="py-3 border-t border-gray-50">
                      <Text className="text-gray-600 text-xs mb-1 block">参与人</Text>
                      <Input className="text-gray-900 text-sm w-full" placeholder="输入姓名..." value={participants} onInput={e => setParticipants(e.detail.value)} />
                  </View>
                  
                  {/* Custom Fields */}
                  {customFields.map(cf => (
                      <View key={cf.id} className="py-3 border-t border-gray-50">
                          <Text className="text-gray-600 text-xs mb-1 block">{cf.label}</Text>
                          <Input 
                            className="text-gray-900 text-sm w-full" 
                            type={cf.type === 'number' ? 'number' : 'text'}
                            value={customFieldValues[cf.id] || ''} 
                            onInput={e => setCustomFieldValues({...customFieldValues, [cf.id]: e.detail.value})} 
                          />
                      </View>
                  ))}
              </View>

              {/* Content & AI */}
              <View className="bg-white p-4 rounded-2xl shadow-sm mb-4">
                  <View className="flex justify-between items-center mb-2">
                      <View className="flex items-center space-x-2">
                          <Text className="font-bold text-gray-800">拜访纪要</Text>
                          <View className="bg-gray-100 rounded px-1.5 py-0.5" onClick={() => setShowAIConfig(true)}>
                               <Text className="text-[10px] text-gray-500">{activeModel}</Text>
                          </View>
                      </View>
                      <View className="flex items-center space-x-2">
                          <View 
                            onClick={handleRecordToggle}
                            className={`flex items-center space-x-1 px-2 py-1 rounded-full ${isRecording ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                          >
                              <Text className="text-xs font-bold">{isRecording ? `停止 ${recordDuration}s` : '录音'}</Text>
                          </View>
                          <View onClick={handleAI} className="bg-indigo-600 px-3 py-1 rounded-full shadow-md shadow-indigo-200">
                               <Text className="text-xs font-bold text-white">{isAnalyzing ? '...' : 'AI 分析 & 转写'}</Text>
                          </View>
                      </View>
                  </View>

                  <Textarea 
                      className="w-full bg-gray-50 rounded-xl p-3 text-sm h-32 mb-3" 
                      placeholder="输入笔记或使用语音录入..." 
                      value={notes} 
                      onInput={e => setNotes(e.detail.value)} 
                      maxlength={-1} 
                  />

                  {attachments.length > 0 && (
                      <View className="flex flex-wrap gap-2 mb-2">
                          {attachments.map(att => (
                              <View key={att.id} className={`px-3 py-1.5 rounded-lg border flex items-center ${playingUrl === att.url ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-600'}`} onClick={() => playAudio(att.url)}>
                                  <Text className="text-xs truncate max-w-[120px] mr-1">{att.name}</Text>
                                  <Text className="text-xs font-bold">{playingUrl === att.url ? '❚❚' : '▶'}</Text>
                              </View>
                          ))}
                      </View>
                  )}

                  {aiResult && (
                      <View className="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
                          <View className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-3">
                              <Text className="text-xs font-bold text-indigo-400 mb-1 uppercase tracking-wider">Summary</Text>
                              <Text className="text-sm text-indigo-900 leading-relaxed">{aiResult.summary}</Text>
                          </View>
                          
                          <View className="flex gap-2 mb-3">
                              <View className="flex-1 bg-green-50 p-3 rounded-xl border border-green-100">
                                  <Text className="text-[10px] font-bold text-green-500 uppercase">Sentiment</Text>
                                  <Text className="text-sm font-bold text-green-800">{aiResult.sentiment}</Text>
                              </View>
                              <View className="flex-1 bg-orange-50 p-3 rounded-xl border border-orange-100">
                                  <Text className="text-[10px] font-bold text-orange-500 uppercase">Action Items</Text>
                                  <Text className="text-sm font-bold text-orange-800">{aiResult.actionItems?.length || 0} items</Text>
                              </View>
                          </View>

                          {aiResult.actionItems?.map((item, i) => (
                              <View key={i} className="flex items-start mb-1">
                                  <Text className="text-indigo-500 mr-2">•</Text>
                                  <Text className="text-sm text-gray-700">{item}</Text>
                              </View>
                          ))}
                          
                          {aiResult.followUpEmailDraft && (
                              <View className="mt-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                  <View className="flex justify-between items-center mb-1">
                                    <Text className="text-xs font-bold text-gray-400">DRAFT EMAIL</Text>
                                    <Text className="text-blue-600 text-xs font-bold" onClick={() => setShowEmailConfig(true)}>配置邮件</Text>
                                  </View>
                                  <Text className="text-xs text-gray-600">{aiResult.followUpEmailDraft}</Text>
                                  <Button className="mt-2 bg-blue-100 text-blue-600 text-xs m-0" onClick={() => Taro.showToast({title:'模拟发送成功', icon:'success'})}>发送邮件 (模拟)</Button>
                              </View>
                          )}
                      </View>
                  )}
              </View>

              {editingId && (
                  <Button className="bg-white text-red-500 border border-gray-200 mt-6 mb-12 rounded-xl" onClick={handleDelete}>删除记录</Button>
              )}
              <View className="h-10"></View>
          </ScrollView>

          {/* AI Config Modal */}
          {showAIConfig && (
              <View className="fixed inset-0 z-50 flex items-center justify-center">
                  <View className="absolute inset-0 bg-black opacity-50" onClick={() => setShowAIConfig(false)}></View>
                  <View className="bg-white rounded-xl p-6 w-80 z-10">
                      <Text className="font-bold text-lg mb-4 block">AI 模型配置</Text>
                      <View className="flex bg-gray-100 p-1 rounded-lg mb-4">
                          <View onClick={() => setActiveModel('Gemini')} className={`flex-1 text-center py-2 text-xs font-bold rounded ${activeModel==='Gemini'?'bg-white shadow text-blue-600':'text-gray-500'}`}>Gemini</View>
                          <View onClick={() => setActiveModel('DeepSeek')} className={`flex-1 text-center py-2 text-xs font-bold rounded ${activeModel==='DeepSeek'?'bg-white shadow text-blue-600':'text-gray-500'}`}>DeepSeek</View>
                      </View>
                      {activeModel === 'DeepSeek' && (
                          <Input className="bg-gray-50 border border-gray-200 p-2 rounded text-sm mb-4" placeholder="DeepSeek API Key" value={tempDeepSeekKey} onInput={e => setTempDeepSeekKey(e.detail.value)} />
                      )}
                      <Button className="bg-blue-600 text-white" onClick={saveAISettings}>保存</Button>
                  </View>
              </View>
          )}

          {/* Email Config Modal */}
           {showEmailConfig && (
              <View className="fixed inset-0 z-50 flex items-center justify-center">
                  <View className="absolute inset-0 bg-black opacity-50" onClick={() => setShowEmailConfig(false)}></View>
                  <View className="bg-white rounded-xl p-6 w-80 z-10">
                      <Text className="font-bold text-lg mb-4 block">邮件服务器配置</Text>
                      <Input className="bg-gray-50 border border-gray-200 p-2 rounded text-sm mb-2" placeholder="SMTP Host" value={tempEmailConfig.smtpHost} onInput={e => setTempEmailConfig({...tempEmailConfig, smtpHost: e.detail.value})} />
                      <Input className="bg-gray-50 border border-gray-200 p-2 rounded text-sm mb-2" placeholder="Port" value={tempEmailConfig.smtpPort} onInput={e => setTempEmailConfig({...tempEmailConfig, smtpPort: e.detail.value})} />
                      <Input className="bg-gray-50 border border-gray-200 p-2 rounded text-sm mb-2" placeholder="Sender Email" value={tempEmailConfig.senderEmail} onInput={e => setTempEmailConfig({...tempEmailConfig, senderEmail: e.detail.value})} />
                      <Button className="bg-blue-600 text-white" onClick={saveEmailSettings}>保存配置</Button>
                  </View>
              </View>
          )}
      </View>
  );
};

export default VisitPage;
