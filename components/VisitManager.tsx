
import React, { useState, useRef, useEffect } from 'react';
import { Visit, Client, CustomFieldDefinition, StorageSettings, Attachment, AIAnalysisResult, CustomFieldData, VisitCategory, AIModelProvider } from '../types';
import { analyzeVisitNotes, analyzeVisitAudio } from '../services/geminiService';
import { startLiveTranscription, stopLiveTranscription, isSpeechRecognitionSupported } from '../services/webSpeechService';
import { 
  Mic, Square, Play, Pause, Paperclip, X, Loader2, Sparkles, 
  Calendar, User, AlertCircle, Save, Trash2, ChevronLeft, 
  Clock, FileText, ImageIcon, Headphones, MoreHorizontal, Plus, Briefcase, Settings, Check, Key
} from 'lucide-react';

interface VisitManagerProps {
  clients: Client[];
  visits: Visit[];
  onAddVisit: (visit: Visit) => void;
  onUpdateVisit: (visit: Visit) => void;
  onDeleteVisit: (id: string) => void;
  onUpdateClient: (client: Client) => void;
  fieldDefinitions: CustomFieldDefinition[];
  initialEditingVisitId: string | null;
  onClearInitialEditingVisitId: () => void;
  currentUserId: string;
  storageSettings: StorageSettings;
  onUpdateStorageSettings: (settings: StorageSettings) => void;
}

const VisitManager: React.FC<VisitManagerProps> = ({
  clients, visits, onAddVisit, onUpdateVisit, onDeleteVisit, 
  fieldDefinitions, initialEditingVisitId, onClearInitialEditingVisitId,
  currentUserId, storageSettings, onUpdateStorageSettings
}) => {
  const [view, setView] = useState<'LIST' | 'EDIT'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientPosition, setClientPosition] = useState<string>(''); // Read-only position
  
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [category, setCategory] = useState<VisitCategory>('Outbound');
  const [summary, setSummary] = useState('');
  const [rawNotes, setRawNotes] = useState('');
  const [participants, setParticipants] = useState('');
  const [outcome, setOutcome] = useState<'Positive' | 'Neutral' | 'Negative' | 'Pending'>('Pending');
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [sentimentScore, setSentimentScore] = useState<number>(50);
  const [followUpEmailDraft, setFollowUpEmailDraft] = useState('');
  const [customFieldsValues, setCustomFieldsValues] = useState<Record<string, string>>({});
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  
  // Interaction State
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showAIConfig, setShowAIConfig] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const notesBeforeRecordingRef = useRef<string>('');
  const tempTranscriptRef = useRef<string>('');

  useEffect(() => {
    if (initialEditingVisitId) {
      handleEditVisit(initialEditingVisitId);
      onClearInitialEditingVisitId();
    }
  }, [initialEditingVisitId]);

  // Update read-only position when client is selected
  useEffect(() => {
    if (selectedClientId) {
        const client = clients.find(c => c.id === selectedClientId);
        if (client) {
            // Try to find a field labeled '职位' or 'Position' in the client definition
            const positionFieldDef = fieldDefinitions.find(f => 
                f.target === 'Client' && (f.label.includes('职位') || f.label.toLowerCase().includes('position'))
            );
            
            if (positionFieldDef) {
                const val = client.customFields?.find(cf => cf.fieldId === positionFieldDef.id)?.value;
                setClientPosition(val || '未录入');
            } else {
                setClientPosition('未配置职位字段');
            }
        }
    } else {
        setClientPosition('');
    }
  }, [selectedClientId, clients, fieldDefinitions]);

  const handleEditVisit = (id: string) => {
    const visit = visits.find(v => v.id === id);
    if (visit) {
      setEditingId(visit.id);
      setSelectedClientId(visit.clientId);
      setDate(new Date(visit.date).toISOString().split('T')[0]);
      setCategory(visit.category);
      setSummary(visit.summary);
      setRawNotes(visit.rawNotes);
      setParticipants(visit.participants || '');
      setOutcome(visit.outcome);
      setActionItems(visit.actionItems || []);
      setSentimentScore(visit.sentimentScore);
      setFollowUpEmailDraft(visit.followUpEmailDraft || '');
      setExistingAttachments(visit.attachments || []);
      
      const cf: Record<string, string> = {};
      visit.customFields?.forEach(f => {
        cf[f.fieldId] = f.value;
      });
      setCustomFieldsValues(cf);
      
      setView('EDIT');
      setHasUnsavedChanges(false);
    }
  };

  const handleCreateVisit = () => {
    setEditingId(null);
    setSelectedClientId('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('Outbound');
    setSummary('');
    setRawNotes('');
    setParticipants('');
    setOutcome('Pending');
    setActionItems([]);
    setSentimentScore(50);
    setFollowUpEmailDraft('');
    setExistingAttachments([]);
    setCustomFieldsValues({});
    
    setView('EDIT');
    setHasUnsavedChanges(false);
  };

  const startRecording = async () => {
    if (!isSpeechRecognitionSupported()) {
      alert("您的浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器。");
      return;
    }

    try {
      // 1. Start Audio Recording (for File Attachment)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
         const mimeType = mediaRecorder.mimeType || 'audio/webm';
         const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
         stream.getTracks().forEach(track => track.stop());

         const reader = new FileReader();
         reader.readAsDataURL(audioBlob);
         reader.onloadend = async () => {
            const base64Url = reader.result as string;
            const newAttachment: Attachment = { id: crypto.randomUUID(), name: `语音录音_${Date.now()}.webm`, type: 'document', url: base64Url };
            setExistingAttachments(prev => [...prev, newAttachment]);
            setHasUnsavedChanges(true);
        };
      };
      mediaRecorder.start();
      
      // 2. Start Live Transcription (Web Speech API)
      notesBeforeRecordingRef.current = rawNotes;
      tempTranscriptRef.current = '';
      
      startLiveTranscription(
        (text, isFinal) => {
            const newContent = notesBeforeRecordingRef.current 
                  ? `${notesBeforeRecordingRef.current}\n\n[实时转写]: ${text}`
                  : `[实时转写]: ${text}`;
            setRawNotes(newContent);
            setHasUnsavedChanges(true);
        },
        (err) => {
          setTranscriptionError(err);
        },
        () => {
          setIsRecording(false);
        }
      );

      setIsRecording(true);
      setTranscriptionError(null);

    } catch (err: any) {
      console.error("Error starting recording:", err);
      setTranscriptionError("无法启动录音: " + err.message);
    }
  };

  const stopRecording = () => {
    // Stop Media Recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Stop Web Speech API
    stopLiveTranscription();
    setIsRecording(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const newAttachment: Attachment = {
            id: Date.now().toString(),
            name: file.name,
            type: file.type.startsWith('image/') ? 'image' : 'document',
            url: event.target.result as string
          };
          setExistingAttachments(prev => [...prev, newAttachment]);
          setHasUnsavedChanges(true);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAIAnalysis = async () => {
    if (!selectedClientId) {
        alert("请先选择客户");
        return;
    }
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    const audioAttachment = existingAttachments.slice().reverse().find(a => a.url.startsWith('data:audio') || a.name.includes('语音'));
    
    setIsAnalyzing(true);
    setTranscriptionError(null);
    
    try {
        let result: AIAnalysisResult;
        
        // Pass model settings
        const activeModel = storageSettings.aiConfig.activeModel;
        const deepSeekKey = storageSettings.aiConfig.deepSeekApiKey;

        if (audioAttachment) {
            const base64Data = audioAttachment.url.split(',')[1];
            const mimeType = audioAttachment.url.split(';')[0].split(':')[1];
            // Audio analysis typically uses Gemini as it has native multimodal support
            result = await analyzeVisitAudio(client.name, base64Data, mimeType);
        } else if (rawNotes.trim().length > 0) {
            result = await analyzeVisitNotes(
                client.name, 
                client.industry || '', 
                rawNotes, 
                activeModel, // Use configured model
                'Formal',
                deepSeekKey // Pass configured key
            );
        } else {
            throw new Error("请先输入笔记或录制语音");
        }

        if (result.summary) setSummary(result.summary);
        if (result.sentiment) setOutcome(result.sentiment === 'Positive' ? 'Positive' : result.sentiment === 'Negative' ? 'Negative' : 'Neutral');
        if (result.actionItems) setActionItems(result.actionItems);
        if (result.followUpEmailDraft) setFollowUpEmailDraft(result.followUpEmailDraft);
        
        // Use AI transcription if it's better/different, but append nicely.
        if (result.transcription && !rawNotes.includes(result.transcription)) {
             setRawNotes(prev => (prev ? prev + '\n\n' : '') + `[AI精修]: ${result.transcription}`);
        }
        
        setSentimentScore(result.sentiment === 'Positive' ? 85 : result.sentiment === 'Negative' ? 30 : 60);
        setHasUnsavedChanges(true);
    } catch (e: any) {
        console.error("Analysis failed", e);
        setTranscriptionError(e.message || "AI 分析失败，请检查配置");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleSave = () => {
    if (!selectedClientId) {
      alert("必须选择客户");
      return;
    }
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    const customFieldsData: CustomFieldData[] = Object.entries(customFieldsValues).map(([k, v]) => ({ fieldId: k, value: v }));

    const visitData: Visit = {
      id: editingId || crypto.randomUUID(),
      clientId: client.id,
      clientName: client.name,
      userId: currentUserId,
      date: new Date(date).toISOString(),
      category,
      summary: summary || '暂无摘要',
      rawNotes: rawNotes,
      participants,
      outcome,
      actionItems,
      sentimentScore,
      followUpEmailDraft,
      attachments: existingAttachments,
      customFields: customFieldsData
    };

    if (editingId) {
      onUpdateVisit(visitData);
    } else {
      onAddVisit(visitData);
    }
    setView('LIST');
  };

  const handleUpdateModel = (model: AIModelProvider) => {
    onUpdateStorageSettings({
        ...storageSettings,
        aiConfig: {
            ...storageSettings.aiConfig,
            activeModel: model
        }
    });
  };

  const handleUpdateDeepSeekKey = (key: string) => {
    onUpdateStorageSettings({
        ...storageSettings,
        aiConfig: {
            ...storageSettings.aiConfig,
            deepSeekApiKey: key
        }
    });
  };

  const visitDefinitions = fieldDefinitions.filter(d => d.target === 'Visit');

  if (view === 'LIST') {
      const filteredVisits = visits.filter(v => 
          v.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.summary.toLowerCase().includes(searchTerm.toLowerCase())
      );

      return (
          <div className="h-full flex flex-col space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="relative w-full sm:w-96">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                          <Clock className="w-5 h-5" />
                      </div>
                      <input 
                          type="text" 
                          placeholder="搜索拜访记录..." 
                          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
                  <button 
                      onClick={handleCreateVisit}
                      className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
                  >
                      <Plus className="w-5 h-5" />
                      <span>记录新拜访</span>
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                  {filteredVisits.map(visit => (
                      <div key={visit.id} onClick={() => handleEditVisit(visit.id)} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                          <div className="flex justify-between items-start mb-2">
                              <div>
                                  <h3 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">{visit.clientName}</h3>
                                  <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                                      <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {new Date(visit.date).toLocaleDateString('zh-CN')}</span>
                                      <span className="flex items-center"><User className="w-3 h-3 mr-1" /> {clients.find(c => c.id === visit.clientId)?.company || 'Unknown Company'}</span>
                                      <span className={`px-1.5 py-0.5 rounded font-bold ${visit.category === 'Inbound' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{visit.category === 'Inbound' ? '来访' : '外出'}</span>
                                  </div>
                              </div>
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                  visit.outcome === 'Positive' ? 'bg-green-100 text-green-700' : 
                                  visit.outcome === 'Negative' ? 'bg-red-100 text-red-700' : 
                                  'bg-gray-100 text-gray-600'
                              }`}>
                                  {visit.outcome}
                              </span>
                          </div>
                          <p className="text-gray-600 text-sm line-clamp-2">{visit.summary}</p>
                      </div>
                  ))}
                  {filteredVisits.length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                          暂无拜访记录
                      </div>
                  )}
              </div>
          </div>
      );
  }

  // EDIT VIEW
  return (
      <div className="h-full flex flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="flex items-center space-x-4">
                  <button onClick={() => setView('LIST')} className="p-2 hover:bg-white rounded-full transition-colors text-gray-500">
                      <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-xl font-bold text-gray-900">{editingId ? '编辑拜访记录' : '新拜访记录'}</h2>
              </div>
              <div className="flex items-center space-x-3">
                   {hasUnsavedChanges && <span className="text-xs text-orange-500 font-medium animate-pulse">未保存</span>}
                   {editingId && (
                      <button onClick={() => { if(confirm('确定删除?')) { onDeleteVisit(editingId); setView('LIST'); } }} className="text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                   )}
                   <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-all flex items-center">
                       <Save className="w-4 h-4 mr-2" /> 保存
                   </button>
              </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: Details */}
                  <div className="space-y-6">
                      <div className="space-y-4">
                          <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">基础信息</label>
                          <div>
                              <label className="text-xs font-semibold text-gray-500 mb-1 block">客户</label>
                              <select 
                                  className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  value={selectedClientId}
                                  onChange={e => setSelectedClientId(e.target.value)}
                              >
                                  <option value="">选择客户...</option>
                                  {clients.map(c => <option key={c.id} value={c.id}>{c.name} - {c.company}</option>)}
                              </select>
                              {selectedClientId && clientPosition && (
                                  <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg inline-block border border-blue-100">
                                      <span className="font-bold">当前职位:</span> {clientPosition}
                                  </div>
                              )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="text-xs font-semibold text-gray-500 mb-1 block">日期</label>
                                  <input type="date" className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={date} onChange={e => setDate(e.target.value)} />
                              </div>
                              <div>
                                  <label className="text-xs font-semibold text-gray-500 mb-1 block">类型</label>
                                  <select className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={category} onChange={e => setCategory(e.target.value as VisitCategory)}>
                                      <option value="Outbound">外出拜访</option>
                                      <option value="Inbound">客户来访</option>
                                  </select>
                              </div>
                          </div>

                          <div>
                              <label className="text-xs font-semibold text-gray-500 mb-1 block">参与人员</label>
                              <input type="text" className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="如：张经理, 李工" value={participants} onChange={e => setParticipants(e.target.value)} />
                          </div>
                      </div>

                      {/* Custom Fields */}
                      {visitDefinitions.length > 0 && (
                          <div className="space-y-4 pt-4 border-t border-gray-100">
                              <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">其他信息</label>
                              {visitDefinitions.map(def => (
                                  <div key={def.id}>
                                      <label className="text-xs font-semibold text-gray-500 mb-1 block">{def.label}</label>
                                      <input 
                                          type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                                          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                          placeholder={`输入${def.label}...`}
                                          value={customFieldsValues[def.id] || ''}
                                          onChange={e => setCustomFieldsValues({...customFieldsValues, [def.id]: e.target.value})}
                                      />
                                  </div>
                              ))}
                          </div>
                      )}

                       <div className="pt-4 border-t border-gray-100">
                           <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">附件</label>
                           <div className="flex flex-wrap gap-2 mb-3">
                               {existingAttachments.map((att, idx) => (
                                   <div key={att.id} className="relative group bg-gray-50 border border-gray-200 rounded-lg p-2 pr-8 flex items-center">
                                       {att.type === 'image' ? <ImageIcon className="w-4 h-4 mr-2 text-blue-500" /> : <FileText className="w-4 h-4 mr-2 text-gray-500" />}
                                       <span className="text-xs truncate max-w-[100px]">{att.name}</span>
                                       <button onClick={() => setExistingAttachments(prev => prev.filter(a => a.id !== att.id))} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1"><X className="w-3 h-3" /></button>
                                   </div>
                               ))}
                           </div>
                           <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                           <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-lg p-3 text-sm font-medium transition-all flex items-center justify-center">
                               <Paperclip className="w-4 h-4 mr-2" /> 上传图片/文档
                           </button>
                       </div>
                  </div>

                  {/* Middle & Right: Notes & AI */}
                  <div className="lg:col-span-2 flex flex-col h-[800px]">
                      {/* Toolbar */}
                      <div className="flex items-center justify-between mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                           <div className="flex items-center space-x-2">
                               <button 
                                  onClick={isRecording ? stopRecording : startRecording}
                                  className={`flex items-center px-4 py-2 rounded-lg font-bold transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
                               >
                                   {isRecording ? <Square className="w-4 h-4 mr-2 fill-current" /> : <Mic className="w-4 h-4 mr-2" />}
                                   {isRecording ? '停止录音' : '语音录入'}
                               </button>
                               <span className="text-xs text-gray-400 hidden sm:inline-block">支持实时转写</span>
                           </div>
                           <div className="flex items-center space-x-2">
                               <button 
                                   onClick={() => setShowAIConfig(true)}
                                   className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
                                   title="AI 模型设置"
                               >
                                   <Settings className="w-5 h-5" />
                               </button>
                               <button 
                                  onClick={handleAIAnalysis}
                                  disabled={isAnalyzing || !rawNotes}
                                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold shadow-md shadow-indigo-100 flex items-center transition-all"
                               >
                                   {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                                   {isAnalyzing ? '分析中...' : 'AI 智能分析'}
                               </button>
                           </div>
                      </div>

                      {transcriptionError && (
                          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center">
                              <AlertCircle className="w-4 h-4 mr-2" />
                              {transcriptionError}
                          </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
                          {/* Raw Notes Area */}
                          <div className="flex flex-col h-full">
                              <label className="block text-sm font-bold text-gray-700 mb-2 flex justify-between">
                                  <span>原始笔记 / 语音转写</span>
                                  <span className="text-xs font-normal text-gray-400">{rawNotes.length} 字</span>
                              </label>
                              <textarea 
                                  className="flex-1 w-full border border-gray-300 rounded-xl p-4 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed text-sm bg-white"
                                  placeholder="在此输入会议纪要，或使用语音录入..."
                                  value={rawNotes}
                                  onChange={e => { setRawNotes(e.target.value); setHasUnsavedChanges(true); }}
                              />
                          </div>

                          {/* Analysis Result Area */}
                          <div className="flex flex-col h-full bg-indigo-50/50 rounded-xl border border-indigo-100 p-4 overflow-y-auto custom-scrollbar">
                               <div className="space-y-6">
                                   {/* Summary */}
                                   <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                       <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2 flex items-center"><FileText className="w-3 h-3 mr-1" /> 智能摘要</h4>
                                       {summary ? (
                                           <p className="text-sm text-gray-800 leading-relaxed">{summary}</p>
                                       ) : (
                                           <p className="text-sm text-gray-400 italic">点击 AI 分析生成摘要...</p>
                                       )}
                                   </div>

                                   {/* Sentiment & Action Items */}
                                   <div className="grid grid-cols-2 gap-4">
                                       <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                           <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2">客户情绪</h4>
                                           <div className="flex items-center space-x-2">
                                               <div className={`w-3 h-3 rounded-full ${outcome === 'Positive' ? 'bg-green-500' : outcome === 'Negative' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                                               <span className="font-bold text-gray-900">{outcome}</span>
                                           </div>
                                       </div>
                                       <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                            <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2">置信度</h4>
                                            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                                <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${sentimentScore}%` }}></div>
                                            </div>
                                            <div className="text-right text-xs text-gray-500 mt-1">{sentimentScore}%</div>
                                       </div>
                                   </div>

                                   {/* Action Items List */}
                                   <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                       <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-3">待办事项</h4>
                                       {actionItems.length > 0 ? (
                                           <ul className="space-y-2">
                                               {actionItems.map((item, i) => (
                                                   <li key={i} className="flex items-start text-sm text-gray-700">
                                                       <input type="checkbox" className="mt-1 mr-2 rounded text-indigo-600 focus:ring-indigo-500" />
                                                       <span className="flex-1">{item}</span>
                                                   </li>
                                               ))}
                                           </ul>
                                       ) : (
                                           <p className="text-sm text-gray-400 italic">暂无待办项</p>
                                       )}
                                   </div>

                                   {/* Email Draft */}
                                   <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                       <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider">跟进邮件草稿</h4>
                                            <button 
                                                onClick={() => { navigator.clipboard.writeText(followUpEmailDraft); alert('已复制邮件内容'); }}
                                                className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                                            >
                                                复制内容
                                            </button>
                                       </div>
                                       <textarea 
                                           className="w-full h-32 text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border-0 focus:ring-0 resize-none"
                                           value={followUpEmailDraft}
                                           onChange={e => setFollowUpEmailDraft(e.target.value)}
                                           placeholder="AI 将在此生成邮件草稿..."
                                       />
                                   </div>
                               </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          {/* AI Settings Modal */}
          {showAIConfig && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                <div className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center">
                        <Settings className="w-5 h-5 mr-2 text-blue-400" />
                        AI 模型配置
                    </h3>
                    <button onClick={() => setShowAIConfig(false)} className="text-gray-400 hover:text-white transition-colors hover:bg-gray-800 p-1 rounded-lg">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">选择分析模型</label>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => handleUpdateModel('Gemini')}
                                className={`relative p-4 rounded-xl border-2 transition-all text-left ${storageSettings.aiConfig.activeModel === 'Gemini' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                            >
                                <div className="font-bold text-gray-900 mb-1">Gemini</div>
                                <div className="text-xs text-gray-500">Google GenAI (推荐)</div>
                                {storageSettings.aiConfig.activeModel === 'Gemini' && <div className="absolute top-3 right-3 text-blue-600"><Check className="w-4 h-4" /></div>}
                            </button>
                            <button 
                                onClick={() => handleUpdateModel('DeepSeek')}
                                className={`relative p-4 rounded-xl border-2 transition-all text-left ${storageSettings.aiConfig.activeModel === 'DeepSeek' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                            >
                                <div className="font-bold text-gray-900 mb-1">DeepSeek</div>
                                <div className="text-xs text-gray-500">DeepSeek V3/R1</div>
                                {storageSettings.aiConfig.activeModel === 'DeepSeek' && <div className="absolute top-3 right-3 text-blue-600"><Check className="w-4 h-4" /></div>}
                            </button>
                        </div>
                    </div>

                    {storageSettings.aiConfig.activeModel === 'DeepSeek' && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">DeepSeek API Key</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input 
                                    type="password"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="sk-..."
                                    value={storageSettings.aiConfig.deepSeekApiKey || ''}
                                    onChange={(e) => handleUpdateDeepSeekKey(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">API Key 仅保存在您的本地浏览器中，不会上传至任何第三方服务器。</p>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button onClick={() => setShowAIConfig(false)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors">
                        完成配置
                    </button>
                </div>
              </div>
            </div>
          )}
      </div>
  );
};

export default VisitManager;
