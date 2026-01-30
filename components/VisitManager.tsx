import React, { useState, useRef, useEffect } from 'react';
import { Visit, Client, AIAnalysisResult, CustomFieldDefinition, Attachment, CustomFieldData, StorageSettings, EmailConfig, AIModelProvider, VisitCategory } from '../types';
import { analyzeVisitNotes, analyzeVisitAudio } from '../services/geminiService';
import { transcribeAudio } from '../services/iflytekService';
import { Sparkles, Calendar, CheckCircle, Clock, FileText, Send, ChevronRight, ChevronLeft, Loader2, Copy, LayoutList, Calendar as CalendarIcon, Mic, Square, StopCircle, Paperclip, Image as ImageIcon, File, Pencil, Trash2, Headphones, Plus, AlertCircle, Search, Filter, X, Play, Pause, History, Maximize2, Minimize2, ChevronsUpDown, Save, Mail, Settings, Server, BrainCircuit, Key, Users, Volume2, MapPin, Home, Info, Lock, User as UserIcon } from 'lucide-react';

interface VisitManagerProps {
  clients: Client[];
  visits: Visit[];
  onAddVisit: (visit: Visit) => void;
  onUpdateVisit: (visit: Visit) => void;
  onDeleteVisit: (id: string) => void;
  onUpdateClient: (client: Client) => void;
  fieldDefinitions: CustomFieldDefinition[];
  initialEditingVisitId?: string | null;
  onClearInitialEditingVisitId?: () => void;
  currentUserId: string;
  storageSettings: StorageSettings;
  onUpdateStorageSettings: (settings: StorageSettings) => void;
}

const DRAFT_KEY = 'visit_pro_form_draft';

interface DraftData {
  editingVisitId: string | null;
  selectedClientId: string;
  visitClientName: string;
  participants: string;
  date: string;
  category: VisitCategory;
  rawNotes: string;
  customFieldInputs: Record<string, string>;
  analysisResult: AIAnalysisResult | null;
  timestamp: number;
}

const VisitManager: React.FC<VisitManagerProps> = ({ 
    clients, 
    visits, 
    onAddVisit, 
    onUpdateVisit, 
    onDeleteVisit, 
    onUpdateClient,
    fieldDefinitions,
    initialEditingVisitId,
    onClearInitialEditingVisitId,
    currentUserId,
    storageSettings,
    onUpdateStorageSettings
}) => {
  const [view, setView] = useState<'LIST' | 'CREATE' | 'CALENDAR'>('LIST');
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Form State
  const [selectedClientId, setSelectedClientId] = useState('');
  const [visitClientName, setVisitClientName] = useState('');
  const [participants, setParticipants] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<VisitCategory>('Outbound');
  const [rawNotes, setRawNotes] = useState('');
  const [customFieldInputs, setCustomFieldInputs] = useState<Record<string, string>>({});
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullScreenField, setFullScreenField] = useState<'notes' | 'summary' | null>(null);
  const [expandedSections, setExpandedSections] = useState<{ notes: boolean; summary: boolean }>({ notes: false, summary: false });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [missingClientEmail, setMissingClientEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false);
  const [tempEmailConfig, setTempEmailConfig] = useState<EmailConfig>(storageSettings.emailConfig);
  const [isAIConfigOpen, setIsAIConfigOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<AIModelProvider>(storageSettings.aiConfig?.activeModel || 'Gemini');
  // Local state for model selection within the modal before saving
  const [modalActiveModel, setModalActiveModel] = useState<AIModelProvider>(activeModel);

  const visitDefinitions = fieldDefinitions.filter(d => d.target === 'Visit');
  const latestAudio = existingAttachments.filter(a => a.name.startsWith('语音录音_')).sort((a, b) => b.name.localeCompare(a.name))[0];

  const filteredVisits = visits.filter(visit => {
    const matchesSearch = visit.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || visit.summary.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOutcome = filterOutcome === 'ALL' || visit.outcome === filterOutcome;
    const visitDateStr = new Date(visit.date).toISOString().split('T')[0];
    const matchesStartDate = !filterStartDate || visitDateStr >= filterStartDate;
    const matchesEndDate = !filterEndDate || visitDateStr <= filterEndDate;
    return matchesSearch && matchesOutcome && matchesStartDate && matchesEndDate;
  });

  useEffect(() => {
    if (view === 'CREATE' && hasUnsavedChanges) {
        const timer = setTimeout(() => {
            const dataToSave: DraftData = { editingVisitId, selectedClientId, visitClientName, participants, date, category, rawNotes, customFieldInputs, analysisResult, timestamp: Date.now() };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(dataToSave));
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [view, hasUnsavedChanges, editingVisitId, selectedClientId, visitClientName, participants, date, category, rawNotes, customFieldInputs, analysisResult]);

  useEffect(() => {
    if (view === 'CREATE') {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
            try {
                const parsed: DraftData = JSON.parse(savedDraft);
                if (parsed.editingVisitId === editingVisitId && !hasUnsavedChanges && (parsed.rawNotes || parsed.selectedClientId)) {
                    setDraftData(parsed);
                }
            } catch (e) { console.error("Failed to parse draft", e); }
        }
    } else { setDraftData(null); }
  }, [view, editingVisitId]); 

  useEffect(() => { if (isEmailSettingsOpen) setTempEmailConfig(storageSettings.emailConfig); }, [isEmailSettingsOpen, storageSettings.emailConfig]);

  useEffect(() => {
      // Sync local state with global storage settings when they change or modal opens
      if (storageSettings.aiConfig) {
          setActiveModel(storageSettings.aiConfig.activeModel);
          setModalActiveModel(storageSettings.aiConfig.activeModel);
      }
  }, [storageSettings.aiConfig, isAIConfigOpen]);

  const handleRestoreDraft = () => {
    if (!draftData) return;
    setEditingVisitId(draftData.editingVisitId);
    setSelectedClientId(draftData.selectedClientId);
    setVisitClientName(draftData.visitClientName);
    setParticipants(draftData.participants || '');
    setDate(draftData.date);
    setCategory(draftData.category || 'Outbound');
    setRawNotes(draftData.rawNotes);
    setCustomFieldInputs(draftData.customFieldInputs);
    setAnalysisResult(draftData.analysisResult);
    setHasUnsavedChanges(true); 
    setDraftData(null);
  };

  const startEdit = (visit: Visit) => {
    setEditingVisitId(visit.id);
    setSelectedClientId(visit.clientId);
    setVisitClientName(visit.clientName);
    setParticipants(visit.participants || '');
    setDate(visit.date.split('T')[0]);
    setCategory(visit.category || 'Outbound');
    setRawNotes(visit.rawNotes);
    setExistingAttachments(visit.attachments || []);
    setAnalysisResult({
      summary: visit.summary,
      sentiment: visit.outcome === 'Pending' ? 'Neutral' : visit.outcome,
      painPoints: visit.customFields?.find(f => f.fieldId === 'painPoints')?.value?.split(',') || [],
      actionItems: visit.actionItems,
      followUpEmailDraft: visit.followUpEmailDraft || ''
    });
    const inputs: Record<string, string> = {};
    visit.customFields?.forEach(f => inputs[f.fieldId] = f.value);
    setCustomFieldInputs(inputs);
    setHasUnsavedChanges(false);
    setView('CREATE');
  };

  useEffect(() => {
    if (initialEditingVisitId) {
        const visit = visits.find(v => v.id === initialEditingVisitId);
        if (visit) startEdit(visit);
        if (onClearInitialEditingVisitId) onClearInitialEditingVisitId();
    }
  }, [initialEditingVisitId, visits, onClearInitialEditingVisitId]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const handleAnalyze = async () => {
    if (!rawNotes.trim() || !selectedClientId) return;
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;
    
    // Check if DeepSeek is selected and env var is missing (process.env check logic should ideally be here or in service)
    // Here we rely on the service throwing an error if the key is missing

    setIsAnalyzing(true);
    try {
      const result = await analyzeVisitNotes(client.name, client.industry || '', rawNotes, activeModel);
      setAnalysisResult(result);
      setHasUnsavedChanges(true);
    } catch (e: any) { alert(e.message || "分析失败"); } finally { setIsAnalyzing(false); }
  };

  const startRecording = async () => {
    if (!selectedClientId) { alert("请先选择客户"); return; }
    setTranscriptionError(null);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some(device => device.kind === 'audioinput');
      if (!hasMic) { 
          setTranscriptionError("未检测到麦克风，请检查设备连接。"); 
          return; 
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      
      mediaRecorder.onstop = async () => {
         const mimeType = mediaRecorder.mimeType;
         const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
         
         stream.getTracks().forEach(track => track.stop());

         const reader = new FileReader();
         reader.readAsDataURL(audioBlob);
         reader.onloadend = async () => {
            const base64Url = reader.result as string;
            const base64Data = base64Url.split(',')[1];
            
            const newAttachment: Attachment = { id: crypto.randomUUID(), name: `语音录音_${Date.now()}.webm`, type: 'document', url: base64Url };
            setExistingAttachments(prev => [...prev, newAttachment]);
            setHasUnsavedChanges(true);
            
            setIsTranscribing(true);
            setTranscriptionError(null);
            try {
                let text = '';
                // Use Gemini Audio Analysis if active model is Gemini
                if (activeModel === 'Gemini') {
                     const client = clients.find(c => c.id === selectedClientId);
                     const cName = visitClientName || client?.name || 'Client';
                     
                     // Call analyzeVisitAudio directly
                     const result = await analyzeVisitAudio(cName, base64Data, mimeType);
                     setAnalysisResult(result); // Set full analysis
                     text = result.transcription || '';
                } else {
                     // Fallback to iFlytek transcription if DeepSeek is active
                     text = await transcribeAudio(audioBlob);
                }

                if (text) {
                     setRawNotes(prev => {
                        const timestamp = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit'});
                        return prev ? `${prev}\n\n[语音转写 ${timestamp}]\n${text}` : text;
                     });
                     setHasUnsavedChanges(true);
                }
            } catch (error: any) { 
                console.error("Transcription/Analysis error:", error);
                let msg = error.message || "未知错误";
                
                // Friendly error messages
                if (msg.includes("400") || msg.includes("INVALID_ARGUMENT") || msg.includes("mime")) {
                    msg = `音频格式不支持 (${mimeType})。请尝试使用 Chrome 桌面版录制。`;
                } else if (msg.includes("API Key")) {
                    msg = "AI 服务连接失败：请检查 API Key 配置。";
                } else if (msg.includes("Network") || msg.includes("fetch")) {
                    msg = "网络连接异常，无法上传音频。";
                }
                
                setTranscriptionError(`处理失败: ${msg}`);
            } finally { 
                setIsTranscribing(false); 
            }
        };
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) { 
        console.error(err);
        setTranscriptionError("无法访问麦克风，请检查浏览器权限设置。"); 
    }
  };

  const handleSave = () => {
    if (!selectedClientId) { alert("请选择客户"); return; }
    const client = clients.find(c => c.id === selectedClientId)!;
    const customFieldsData: CustomFieldData[] = Object.entries(customFieldInputs).map(([fieldId, value]) => ({ fieldId, value: value as string }));
    const visitData: Visit = {
      id: editingVisitId || crypto.randomUUID(),
      userId: editingVisitId ? (visits.find(v => v.id === editingVisitId)?.userId || currentUserId) : currentUserId,
      clientId: client.id,
      clientName: visitClientName || client.name,
      participants,
      date: new Date(date).toISOString(),
      category,
      rawNotes,
      summary: analysisResult?.summary || rawNotes || '（暂无摘要）',
      outcome: analysisResult ? (analysisResult.sentiment as any) : 'Pending',
      actionItems: analysisResult?.actionItems || [],
      sentimentScore: analysisResult ? (analysisResult.sentiment === 'Positive' ? 80 : 30) : 50,
      customFields: customFieldsData,
      attachments: existingAttachments,
      followUpEmailDraft: analysisResult?.followUpEmailDraft
    };
    if (editingVisitId) onUpdateVisit(visitData); else onAddVisit(visitData);
    localStorage.removeItem(DRAFT_KEY);
    resetForm();
    setView('LIST'); 
  };

  const resetForm = () => {
    setEditingVisitId(null); setSelectedClientId(''); setVisitClientName(''); setParticipants('');
    setDate(new Date().toISOString().split('T')[0]); setCategory('Outbound'); setRawNotes('');
    setAnalysisResult(null); setExistingAttachments([]); setHasUnsavedChanges(false);
    setShowDiscardConfirm(false); setDraftData(null); setFullScreenField(null);
    setTranscriptionError(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (view === 'CREATE') {
    return (
      <>
        <div className="max-w-4xl mx-auto animate-fade-in relative pb-10">
          <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{editingVisitId ? '编辑拜访记录' : '记录新拜访'}</h2>
              <button onClick={() => { if (hasUnsavedChanges) { setShowDiscardConfirm(true); } else { resetForm(); setView('LIST'); } }} className="text-sm text-gray-500 hover:text-gray-900">取消</button>
          </div>

          {draftData && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center space-x-3">
                      <div className="p-2 bg-amber-100 rounded-full"><History className="w-5 h-5 text-amber-600" /></div>
                      <div><p className="text-sm font-bold text-gray-800">发现未保存的草稿</p><p className="text-xs text-gray-600">系统检测到您在 {new Date(draftData.timestamp).toLocaleString('zh-CN')} 有未保存的内容。</p></div>
                  </div>
                  <div className="flex items-center space-x-2">
                      <button onClick={handleRestoreDraft} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm">恢复草稿</button>
                      <button onClick={() => { localStorage.removeItem(DRAFT_KEY); setDraftData(null); }} className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 text-xs font-bold rounded-md transition-colors">忽略</button>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">拜访分类</label>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            type="button"
                            onClick={() => { setCategory('Outbound'); setHasUnsavedChanges(true); }}
                            className={`flex-1 flex items-center justify-center py-2 px-3 rounded-md text-sm font-bold transition-all ${category === 'Outbound' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <MapPin className="w-4 h-4 mr-2" /> 外出拜访
                        </button>
                        <button 
                            type="button"
                            onClick={() => { setCategory('Inbound'); setHasUnsavedChanges(true); }}
                            className={`flex-1 flex items-center justify-center py-2 px-3 rounded-md text-sm font-bold transition-all ${category === 'Inbound' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Home className="w-4 h-4 mr-2" /> 客户到访
                        </button>
                    </div>
                </div>

                <label className="block text-sm font-medium text-gray-700 mb-2">选择客户</label>
                <select className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={selectedClientId} onChange={(e) => { const id = e.target.value; setSelectedClientId(id); const client = clients.find(c => c.id === id); setVisitClientName(client ? client.name : ''); setHasUnsavedChanges(true); }}>
                  <option value="">-- 请选择客户 --</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.company})</option>)}
                </select>
                
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">拜访对象</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" value={visitClientName} onChange={(e) => { setVisitClientName(e.target.value); setHasUnsavedChanges(true); }} placeholder="例如：张经理" disabled={!selectedClientId} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">拜访日期</label>
                        <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" value={date} onChange={(e) => { setDate(e.target.value); setHasUnsavedChanges(true); }} />
                    </div>
                </div>

                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><Users className="w-4 h-4 mr-2 text-gray-400" />参加人员情况</label>
                    <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" value={participants} onChange={(e) => { setParticipants(e.target.value); setHasUnsavedChanges(true); }} placeholder="请输入参会人员姓名、职务等..." disabled={!selectedClientId} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-auto relative overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                   <label className="block text-sm font-medium text-gray-700">原始笔记</label>
                   <div className="flex items-center space-x-3">
                      <span className={`text-xs ${rawNotes.length > 500 ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>{rawNotes.length} 字</span>
                      <button type="button" onClick={() => setExpandedSections(p => ({ ...p, notes: !p.notes }))} className="text-xs text-blue-600 hover:text-blue-700 font-medium">{expandedSections.notes ? '收起' : '展开'}</button>
                      <button type="button" onClick={() => setFullScreenField('notes')} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><Maximize2 className="w-4 h-4" /></button>
                   </div>
                </div>
                <textarea className="w-full border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 outline-none resize-none custom-scrollbar transition-all duration-300" style={{ height: expandedSections.notes ? '500px' : '160px' }} placeholder="输入会议核心点，或使用语音录制..." value={rawNotes} onChange={(e) => { setRawNotes(e.target.value); setHasUnsavedChanges(true); }} />
                
                {isTranscribing && (
                    <div className="mt-3 bg-blue-50 rounded-lg p-4 border border-blue-100 flex flex-col space-y-3 animate-fade-in shadow-inner">
                        <div className="flex items-center justify-between text-blue-700">
                            <div className="flex items-center space-x-3"><div className="p-2 bg-blue-600 rounded-full animate-pulse"><Loader2 className="w-4 h-4 text-white animate-spin" /></div><span className="text-sm font-bold">AI 正在处理音频并生成摘要...</span></div>
                        </div>
                        <div className="relative w-full h-2 bg-blue-100 rounded-full overflow-hidden"><div className="absolute inset-0 bg-blue-600 animate-[shimmer_2s_infinite]"></div></div>
                    </div>
                )}

                {isRecording && (
                    <div className="mt-3 bg-red-50 rounded-lg p-4 border border-red-100 flex items-center justify-between animate-fade-in">
                        <div className="flex items-center space-x-3 text-red-600"><Volume2 className="w-4 h-4" /><span className="text-sm font-bold">录音中: {formatTime(recordingTime)}</span></div>
                        <div className="flex items-center space-x-1">{[1,2,3,4,3,2,1].map((s, i) => (<div key={i} className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: `${s * 4}px` }}></div>))}</div>
                    </div>
                )}

                {transcriptionError && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-3 animate-fade-in">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                        <div className="flex-1">
                            <h4 className="text-sm font-bold text-red-800 mb-1">语音处理提示</h4>
                            <p className="text-xs text-red-700 leading-relaxed">{transcriptionError}</p>
                        </div>
                        <button onClick={() => setTranscriptionError(null)} className="text-red-400 hover:text-red-600 p-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className="mt-4 flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                   <div className="flex items-center space-x-3">
                      {!isRecording ? (
                           <>
                           <button onClick={startRecording} disabled={isAnalyzing || isTranscribing || !selectedClientId} className={`p-3 rounded-full shadow-sm transition-all ${isAnalyzing || isTranscribing || !selectedClientId ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}><Mic className="w-5 h-5" /></button>
                           {latestAudio && (
                               <button 
                                   onClick={() => {
                                       if (playingAudioId === latestAudio.id) {
                                           audioPlayerRef.current?.pause();
                                           setPlayingAudioId(null);
                                       } else {
                                           if (audioPlayerRef.current) {
                                               audioPlayerRef.current.src = latestAudio.url;
                                               audioPlayerRef.current.play();
                                               setPlayingAudioId(latestAudio.id);
                                               audioPlayerRef.current.onended = () => setPlayingAudioId(null);
                                           }
                                       }
                                   }}
                                   className={`p-3 rounded-full shadow-sm transition-all border ${playingAudioId === latestAudio.id ? 'bg-blue-100 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                   title="播放录音"
                               >
                                   {playingAudioId === latestAudio.id ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                               </button>
                           )}
                           </>
                      ) : (
                          <button onClick={() => { mediaRecorderRef.current?.stop(); setIsRecording(false); }} className="p-3 rounded-full bg-red-600 text-white animate-pulse shadow-md"><Square className="w-5 h-5 fill-current" /></button>
                      )}
                   </div>
                   <div className="flex items-center space-x-2">
                      <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 p-1">
                          <button 
                             onClick={() => setIsAIConfigOpen(true)}
                             className="flex items-center space-x-1 px-2 py-1.5 hover:bg-gray-100 rounded text-xs font-bold text-gray-700 transition-colors mr-1"
                             title="配置 AI 模型"
                          >
                              {activeModel === 'Gemini' ? <Sparkles className="w-3.5 h-3.5 text-blue-500" /> : <BrainCircuit className="w-3.5 h-3.5 text-purple-500" />}
                              <span>{activeModel === 'Gemini' ? 'Gemini' : 'DeepSeek'}</span>
                          </button>
                          
                          <button onClick={handleAnalyze} disabled={!rawNotes || isAnalyzing || isRecording} className={`flex items-center space-x-2 px-3 py-2 rounded-md font-medium text-white text-sm ${!rawNotes || isAnalyzing || isRecording ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}<span>分析</span>
                          </button>
                      </div>
                   </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {!analysisResult ? (
                <div className="h-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 p-8 text-center min-h-[400px]">
                    <Sparkles className="w-12 h-12 mb-4 opacity-30" />
                    <p className="text-lg font-medium">等待 AI 见解</p>
                    <button onClick={handleSave} disabled={!selectedClientId || !rawNotes} className="mt-6 px-6 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-white transition-all disabled:opacity-50"><Save className="w-4 h-4 inline mr-2" />直接保存</button>
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center"><FileText className="w-5 h-5 mr-2 text-blue-600" /> 摘要</h3>
                    </div>
                    <textarea className="w-full text-gray-700 leading-relaxed mb-4 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none bg-white min-h-[160px]" value={analysisResult.summary} onChange={(e) => { setAnalysisResult({...analysisResult, summary: e.target.value}); setHasUnsavedChanges(true); }} />
                    <h4 className="font-semibold text-gray-800 mb-2">行动项:</h4>
                    <ul className="space-y-2">
                      {analysisResult.actionItems.map((item, idx) => (
                        <li key={idx} className="flex items-start text-sm text-gray-600">
                          <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 shrink-0" />
                          <input className="w-full bg-transparent border-none p-0 focus:ring-0" value={item} onChange={(e) => { const items = [...analysisResult.actionItems]; items[idx] = e.target.value; setAnalysisResult({...analysisResult, actionItems: items}); setHasUnsavedChanges(true); }} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center"><Mail className="w-5 h-5 mr-2 text-indigo-600" /> 邮件草稿</h3>
                      <button onClick={() => setIsEmailSettingsOpen(true)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><Settings className="w-4 h-4" /></button>
                    </div>
                    <textarea className="w-full bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm text-gray-700 h-40 outline-none mb-4" value={analysisResult.followUpEmailDraft} onChange={(e) => { setAnalysisResult({...analysisResult, followUpEmailDraft: e.target.value}); setHasUnsavedChanges(true); }} />
                    <button onClick={handleSave} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-md transition-all flex items-center justify-center space-x-2"><CheckCircle className="w-5 h-5" /><span>保存记录</span></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden Audio Element */}
        <audio ref={audioPlayerRef} className="hidden" />
        
        {isAIConfigOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                    <div className="bg-gray-900 px-6 py-4 flex justify-between items-center text-white">
                        <h3 className="text-lg font-bold flex items-center"><BrainCircuit className="w-5 h-5 mr-2 text-indigo-400" /> AI 模型配置</h3>
                        <button onClick={() => setIsAIConfigOpen(false)}><X className="w-6 h-6" /></button>
                    </div>
                    <form onSubmit={(e) => { 
                        e.preventDefault(); 
                        onUpdateStorageSettings({
                            ...storageSettings, 
                            aiConfig: { 
                                activeModel: modalActiveModel,
                                deepSeekApiKey: storageSettings.aiConfig?.deepSeekApiKey || '' // Preserve existing or empty
                            }
                        }); 
                        // Update local state to reflect saved changes
                        setActiveModel(modalActiveModel);
                        setIsAIConfigOpen(false); 
                        alert("AI 模型首选项已更新"); 
                    }} className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">选择分析模型</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setModalActiveModel('Gemini')}
                                    className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${modalActiveModel === 'Gemini' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                                >
                                    <Sparkles className="w-6 h-6 mb-1" />
                                    <span className="font-bold text-sm">Gemini AI</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setModalActiveModel('DeepSeek')}
                                    className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${modalActiveModel === 'DeepSeek' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                                >
                                    <BrainCircuit className="w-6 h-6 mb-1" />
                                    <span className="font-bold text-sm">DeepSeek</span>
                                </button>
                            </div>
                        </div>

                        <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs flex items-start space-x-2 animate-fade-in">
                            <Info className="w-4 h-4 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-bold mb-1">系统环境配置说明</p>
                                <p>为确保安全性，{modalActiveModel === 'Gemini' ? 'Gemini' : 'DeepSeek'} API Key 均须通过系统环境变量配置，不再支持前端手动输入。</p>
                                <ul className="list-disc list-inside mt-1 space-y-0.5 opacity-80">
                                    <li>Gemini: <code>API_KEY</code></li>
                                    <li>DeepSeek: <code>DEEPSEEK_API_KEY</code></li>
                                </ul>
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors mt-2">保存配置</button>
                    </form>
                </div>
            </div>
        )}

        {isEmailSettingsOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                    <div className="bg-gray-900 px-6 py-4 flex justify-between items-center text-white">
                        <h3 className="text-lg font-bold flex items-center"><Server className="w-5 h-5 mr-2 text-indigo-400" /> 邮件服务器配置</h3>
                        <button onClick={() => setIsEmailSettingsOpen(false)}><X className="w-6 h-6" /></button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); onUpdateStorageSettings({...storageSettings, emailConfig: tempEmailConfig}); setIsEmailSettingsOpen(false); alert("设置已更新"); }} className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                             <div className="col-span-2">
                                 <label className="block text-xs font-bold text-gray-500 mb-1">SMTP 服务器</label>
                                 <input required className="w-full border border-gray-300 rounded-lg p-2.5 outline-none text-sm" value={tempEmailConfig.smtpHost} onChange={e => setTempEmailConfig({...tempEmailConfig, smtpHost: e.target.value})} placeholder="smtp.example.com" />
                             </div>
                             <div>
                                 <label className="block text-xs font-bold text-gray-500 mb-1">端口</label>
                                 <input required className="w-full border border-gray-300 rounded-lg p-2.5 outline-none text-sm" value={tempEmailConfig.smtpPort} onChange={e => setTempEmailConfig({...tempEmailConfig, smtpPort: e.target.value})} placeholder="587" />
                             </div>
                             <div className="col-span-1">
                                 <label className="block text-xs font-bold text-gray-500 mb-1">发件人姓名</label>
                                 <input required className="w-full border border-gray-300 rounded-lg p-2.5 outline-none text-sm" value={tempEmailConfig.senderName} onChange={e => setTempEmailConfig({...tempEmailConfig, senderName: e.target.value})} />
                             </div>
                             <div className="col-span-2">
                                 <label className="block text-xs font-bold text-gray-500 mb-1">发件邮箱</label>
                                 <input required type="email" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none text-sm" value={tempEmailConfig.senderEmail} onChange={e => setTempEmailConfig({...tempEmailConfig, senderEmail: e.target.value})} />
                             </div>
                             
                             <div className="col-span-2 pt-2">
                                 <label className="flex items-center space-x-2 cursor-pointer">
                                     <input type="checkbox" checked={tempEmailConfig.authEnabled} onChange={e => setTempEmailConfig({...tempEmailConfig, authEnabled: e.target.checked})} className="rounded text-indigo-600" />
                                     <span className="text-sm font-bold text-gray-700">启用身份验证</span>
                                 </label>
                             </div>

                             {tempEmailConfig.authEnabled && (
                                 <>
                                     <div className="col-span-2 animate-fade-in">
                                         <label className="block text-xs font-bold text-gray-500 mb-1">用户名 / 账号</label>
                                         <div className="relative">
                                             <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                             <input required className="w-full pl-10 border border-gray-300 rounded-lg p-2.5 outline-none text-sm" value={tempEmailConfig.authUsername || ''} onChange={e => setTempEmailConfig({...tempEmailConfig, authUsername: e.target.value})} />
                                         </div>
                                     </div>
                                     <div className="col-span-2 animate-fade-in">
                                         <label className="block text-xs font-bold text-gray-500 mb-1">密码 / 授权码</label>
                                         <div className="relative">
                                             <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                             <input required type="password" className="w-full pl-10 border border-gray-300 rounded-lg p-2.5 outline-none text-sm" value={tempEmailConfig.authPassword || ''} onChange={e => setTempEmailConfig({...tempEmailConfig, authPassword: e.target.value})} />
                                         </div>
                                     </div>
                                 </>
                             )}
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors mt-4">保存配置</button>
                    </form>
                </div>
            </div>
        )}

        {showDiscardConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4"><AlertCircle className="h-6 w-6 text-red-600" /></div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">未保存的更改</h3>
                    <p className="text-sm text-gray-500 mb-6">您有未保存的更改，确定要放弃吗？</p>
                    <div className="flex space-x-3">
                        <button onClick={() => setShowDiscardConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">继续编辑</button>
                        <button onClick={() => { localStorage.removeItem(DRAFT_KEY); resetForm(); setView('LIST'); }} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">放弃</button>
                    </div>
                </div>
            </div>
        )}

        {/* New Full Screen Modal */}
        {fullScreenField === 'notes' && (
            <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-scale-in">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                             <h3 className="text-lg font-bold text-gray-900">原始笔记编辑器</h3>
                             <p className="text-xs text-gray-500">全屏专注模式</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                         <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded border border-gray-200">
                            {rawNotes.length} 字
                         </span>
                        <button 
                            onClick={() => setFullScreenField(null)} 
                            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                            title="退出全屏"
                        >
                            <Minimize2 className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 p-6 md:p-10 bg-gray-50/50 overflow-hidden flex flex-col">
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
                        <textarea 
                            className="flex-1 w-full h-full resize-none outline-none text-lg leading-relaxed text-gray-800 p-8 custom-scrollbar pb-24"
                            placeholder="在此输入详细会议笔记..."
                            value={rawNotes}
                            onChange={(e) => { setRawNotes(e.target.value); setHasUnsavedChanges(true); }}
                            autoFocus
                        />
                        
                        {(isRecording || isTranscribing) && (
                            <div className="absolute top-6 right-6 flex flex-col items-end space-y-2 pointer-events-none">
                                {isRecording && (
                                    <div className="bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 shadow-sm flex items-center space-x-2 animate-pulse">
                                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                        <span className="text-xs font-bold">录音中 {formatTime(recordingTime)}</span>
                                    </div>
                                )}
                                {isTranscribing && (
                                    <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-full border border-blue-100 shadow-sm flex items-center space-x-2">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span className="text-xs font-bold">AI 转写中...</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Full Screen Toolbar */}
                        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                             <div className="flex items-center space-x-3">
                                {!isRecording ? (
                                    <>
                                        <button 
                                            onClick={startRecording} 
                                            disabled={isAnalyzing || isTranscribing || !selectedClientId} 
                                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${isAnalyzing || isTranscribing || !selectedClientId ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                                        >
                                            <Mic className="w-5 h-5" />
                                            <span>开始录音</span>
                                        </button>
                                        
                                        {latestAudio && (
                                           <button 
                                               onClick={() => {
                                                   if (playingAudioId === latestAudio.id) {
                                                       audioPlayerRef.current?.pause();
                                                       setPlayingAudioId(null);
                                                   } else {
                                                       if (audioPlayerRef.current) {
                                                           audioPlayerRef.current.src = latestAudio.url;
                                                           audioPlayerRef.current.play();
                                                           setPlayingAudioId(latestAudio.id);
                                                           audioPlayerRef.current.onended = () => setPlayingAudioId(null);
                                                       }
                                                   }
                                               }}
                                               className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all ${playingAudioId === latestAudio.id ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                           >
                                               {playingAudioId === latestAudio.id ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                               <span>{playingAudioId === latestAudio.id ? '暂停' : '播放录音'}</span>
                                           </button>
                                       )}
                                    </>
                                ) : (
                                    <button 
                                        onClick={() => { mediaRecorderRef.current?.stop(); setIsRecording(false); }} 
                                        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-md animate-pulse"
                                    >
                                        <Square className="w-5 h-5 fill-current" />
                                        <span>停止录音</span>
                                    </button>
                                )}
                             </div>

                             <div className="flex items-center space-x-3">
                                 <button 
                                     onClick={() => setIsAIConfigOpen(true)}
                                     className="flex items-center space-x-1.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 transition-colors border border-gray-200"
                                     title="配置 AI 模型"
                                 >
                                      {activeModel === 'Gemini' ? <Sparkles className="w-4 h-4 text-blue-500" /> : <BrainCircuit className="w-4 h-4 text-purple-500" />}
                                      <span>{activeModel === 'Gemini' ? 'Gemini' : 'DeepSeek'}</span>
                                 </button>
                                 <button 
                                    onClick={handleAnalyze} 
                                    disabled={!rawNotes || isAnalyzing || isRecording} 
                                    className={`flex items-center space-x-2 px-5 py-2 rounded-lg font-medium text-white shadow-sm transition-all ${!rawNotes || isAnalyzing || isRecording ? 'bg-gray-300 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}`}
                                 >
                                    {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                    <span>智能分析</span>
                                 </button>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-4 w-full md:w-auto">
             <h2 className="text-2xl font-bold text-gray-800">拜访管理</h2>
             <div className="flex bg-gray-200 rounded-lg p-1">
                <button onClick={() => setView('LIST')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'LIST' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>列表</button>
                <button onClick={() => setView('CALENDAR')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'CALENDAR' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>日历</button>
            </div>
        </div>
        <button onClick={() => { resetForm(); setView('CREATE'); }} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium flex items-center justify-center space-x-2 shadow-md">
          <Calendar className="w-5 h-5" /><span>记录新拜访</span>
        </button>
      </div>

      {view === 'LIST' && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input type="text" placeholder="搜索客户..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)}>
                    <option value="ALL">全部结果</option><option value="Positive">积极</option><option value="Neutral">中立</option><option value="Negative">消极</option>
                </select>
                <button onClick={() => { setSearchTerm(''); setFilterOutcome('ALL'); setFilterStartDate(''); setFilterEndDate(''); }} className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium">重置</button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50/50">
                        <tr className="border-b text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                            <th className="py-3 pl-6">客户/类型</th><th className="py-3">日期</th><th className="py-3">摘要</th><th className="py-3">结果</th><th className="py-3 text-right pr-6">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredVisits.map(visit => (
                            <tr key={visit.id} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="py-3 pl-6">
                                    <div className="font-semibold text-gray-900">{visit.clientName}</div>
                                    <div className={`text-[10px] inline-flex items-center mt-1 px-1.5 py-0.5 rounded font-bold ${visit.category === 'Inbound' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                                        {visit.category === 'Inbound' ? <Home className="w-2.5 h-2.5 mr-1"/> : <MapPin className="w-2.5 h-2.5 mr-1"/>}
                                        {visit.category === 'Inbound' ? '客户到访' : '外出拜访'}
                                    </div>
                                </td>
                                <td className="py-3 text-gray-500 tabular-nums text-xs">{new Date(visit.date).toLocaleDateString('zh-CN')}</td>
                                <td className="py-3 text-gray-500 max-w-md truncate">{visit.summary}</td>
                                <td className="py-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${visit.outcome === 'Positive' ? 'bg-green-50 text-green-600 border border-green-100' : visit.outcome === 'Negative' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-50 text-gray-500'}`}>
                                        {visit.outcome === 'Positive' ? '积极' : visit.outcome === 'Negative' ? '消极' : '中立'}
                                    </span>
                                </td>
                                <td className="py-3 text-right pr-6"><div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => startEdit(visit)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Pencil className="w-4 h-4"/></button><button onClick={() => onDeleteVisit(visit.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
      )}
    </div>
  );
};

export default VisitManager;