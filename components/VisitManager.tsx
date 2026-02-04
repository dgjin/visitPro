
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Visit, Client, CustomFieldDefinition, StorageSettings, Attachment, AIAnalysisResult, CustomFieldData, VisitCategory, AIModelProvider, User, Department } from '../types';
import { analyzeVisitNotes, analyzeVisitAudio } from '../services/geminiService';
import { startLiveTranscription, stopLiveTranscription, isSpeechRecognitionSupported } from '../services/webSpeechService';
import { 
  Mic, Square, Play, Pause, Paperclip, X, Loader2, Sparkles, 
  Calendar, User as UserIcon, AlertCircle, Save, Trash2, ChevronLeft, 
  Clock, FileText, ImageIcon, Headphones, MoreHorizontal, Plus, Briefcase, Settings, Check, Key,
  Building, Lock, Shield, UserCheck
} from 'lucide-react';

interface VisitManagerProps {
  clients: Client[];
  visits: Visit[];
  users?: User[]; // Optional for backward compatibility, but needed for displaying names
  departments?: Department[];
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
  clients, visits, users = [], departments = [], onAddVisit, onUpdateVisit, onDeleteVisit, 
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
  
  // AI Config Local State (for Modal)
  const [tempAIModel, setTempAIModel] = useState<AIModelProvider>('Gemini');
  const [tempDeepSeekKey, setTempDeepSeekKey] = useState('');

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const notesBeforeRecordingRef = useRef<string>('');
  const tempTranscriptRef = useRef<string>('');

  // Permission Logic
  const currentUserObj = users.find(u => u.id === currentUserId);
  const editingVisitObj = editingId ? visits.find(v => v.id === editingId) : null;
  
  const canEdit = useMemo(() => {
    // If creating new, allow edit
    if (!editingId) return true;
    
    // If Admin or TeamLeader, allow edit (Team Leader has elevated permissions)
    if (currentUserObj?.role === 'Admin' || currentUserObj?.role === 'TeamLeader') return true;

    // If Creator (Visit User ID matches Current User ID), allow edit
    if (editingVisitObj && editingVisitObj.userId === currentUserId) return true;

    // Otherwise, read-only
    return false;
  }, [editingId, currentUserObj, editingVisitObj, currentUserId]);

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

  // Cleanup audio player on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

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

  // Helper for department hierarchy display
  const getDepartmentPath = (deptIdOrName: string | undefined) => {
    if (!deptIdOrName) return '';
    
    // 1. Try to find by ID
    let current = departments.find(d => d.id === deptIdOrName);
    
    // 2. If not found, handle fallback logic
    if (!current) {
        // If it looks like a UUID, hide it (don't show ID to user)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deptIdOrName || '');
        if (isUUID) {
             return '未知部门'; 
        }
        // It's likely a legacy name string (e.g. "Sales"), try to find object for hierarchy, else return string
        current = departments.find(d => d.name === deptIdOrName);
        if (!current) return deptIdOrName || '';
    }

    const path = [current.name];
    let parentId = current.parentId;
    let depth = 0;

    // Traverse up to 2 parent levels
    while (parentId && depth < 2) {
        const parent = departments.find(d => d.id === parentId);
        if (parent) {
            path.unshift(parent.name);
            parentId = parent.parentId;
            depth++;
        } else {
            break;
        }
    }
    return path.join(' / ');
  };

  const getUserName = (id: string | undefined) => {
      if (!id) return '未知';
      const u = users.find(user => user.id === id);
      return u ? u.name : '未知';
  };

  const startRecording = async () => {
    if (!canEdit) return;
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
    if (!canEdit) return;
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

  const toggleAudio = (attachment: Attachment) => {
    if (playingAudioId === attachment.id) {
      // Pause if currently playing this audio
      audioPlayerRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      // Setup new audio
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
        audioPlayerRef.current.onended = () => setPlayingAudioId(null);
        audioPlayerRef.current.onerror = (e) => {
            console.error("Audio playback error", e);
            alert("无法播放该音频");
            setPlayingAudioId(null);
        };
      }
      audioPlayerRef.current.src = attachment.url;
      audioPlayerRef.current.play().catch(e => {
          console.error("Play error", e);
          setPlayingAudioId(null);
      });
      setPlayingAudioId(attachment.id);
    }
  };

  const handleAIAnalysis = async () => {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
      userId: editingId && editingVisitObj ? editingVisitObj.userId : currentUserId, // Preserve original creator or use current if new
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

  const handleOpenAIConfig = () => {
    setTempAIModel(storageSettings.aiConfig.activeModel);
    setTempDeepSeekKey(storageSettings.aiConfig.deepSeekApiKey || '');
    setShowAIConfig(true);
  };

  const handleSaveAIConfig = () => {
    onUpdateStorageSettings({
        ...storageSettings,
        aiConfig: {
            ...storageSettings.aiConfig,
            activeModel: tempAIModel,
            deepSeekApiKey: tempDeepSeekKey
        }
    });
    setShowAIConfig(false);
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
                  {filteredVisits.map(visit => {
                      const visitor = users.find(u => u.id === visit.userId);
                      const client = clients.find(c => c.id === visit.clientId);
                      const visitorDept = visitor ? getDepartmentPath(visitor.department) : '';

                      return (
                          <div key={visit.id} onClick={() => handleEditVisit(visit.id)} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                              <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1">
                                      <h3 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">{visit.clientName}</h3>
                                      {client && <div className="text-sm text-gray-500 font-medium mb-1">{client.company}</div>}
                                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                                          <span className="flex items-center" title={new Date(visit.date).toLocaleString('zh-CN')}>
                                              <Calendar className="w-3 h-3 mr-1" /> 
                                              {/* Ensure readable full date time if available, simplified logic */}
                                              {visit.date.includes('T') 
                                                ? new Date(visit.date).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})
                                                : visit.date
                                              }
                                          </span>
                                          <span className="flex items-center text-gray-700 font-medium bg-gray-100 px-2 py-1 rounded max-w-[250px] truncate" title={visitorDept ? `${visitor?.name} - ${visitorDept}` : visitor?.name}>
                                              <UserIcon className="w-3 h-3 mr-1 flex-shrink-0" /> 
                                              <span className="truncate">{visitor ? visitor.name : '未知用户'}</span>
                                              {visitorDept && <span className="text-gray-400 ml-1 font-normal truncate max-w-[150px]"> - {visitorDept}</span>}
                                          </span>
                                          <span className={`px-1.5 py-0.5 rounded font-bold ${visit.category === 'Inbound' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{visit.category === 'Inbound' ? '来访' : '外出'}</span>
                                      </div>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap ml-2 ${
                                      visit.outcome === 'Positive' ? 'bg-green-100 text-green-700' : 
                                      visit.outcome === 'Negative' ? 'bg-red-100 text-red-700' : 
                                      'bg-gray-100 text-gray-600'
                                  }`}>
                                      {visit.outcome}
                                  </span>
                              </div>
                              <p className="text-gray-600 text-sm line-clamp-2">{visit.summary}</p>
                          </div>
                      );
                  })}
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
                  <div className="flex items-center space-x-2">
                     <h2 className="text-xl font-bold text-gray-900">{editingId ? '编辑拜访记录' : '新拜访记录'}</h2>
                     {!canEdit && <span className="flex items-center text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium"><Lock className="w-3 h-3 mr-1"/> 只读模式</span>}
                  </div>
              </div>
              <div className="flex items-center space-x-3">
                   {hasUnsavedChanges && canEdit && <span className="text-xs text-orange-500 font-medium animate-pulse">未保存</span>}
                   {editingId && canEdit && (
                      <button onClick={() => { if(confirm('确定删除?')) { onDeleteVisit(editingId); setView('LIST'); } }} className="text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                   )}
                   {canEdit && (
                       <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-all flex items-center">
                           <Save className="w-4 h-4 mr-2" /> 保存
                       </button>
                   )}
              </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: Details */}
                  <div className="space-y-6">
                      <div className="space-y-4">
                          <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">基础信息</label>
                          
                          {/* Visitor Info Display (For existing visits) */}
                          {editingId && (
                              <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                  <label className="text-xs font-semibold text-indigo-500 mb-1 block flex items-center">
                                      <UserIcon className="w-3 h-3 mr-1" /> 拜访人
                                  </label>
                                  {(() => {
                                      const visit = visits.find(v => v.id === editingId);
                                      const visitor = users.find(u => u.id === visit?.userId);
                                      const deptPath = visitor ? getDepartmentPath(visitor.department) : '';
                                      return (
                                          <div className="flex flex-col">
                                              <span className="font-bold text-indigo-900 text-sm">{visitor ? visitor.name : '未知用户'}</span>
                                              {deptPath && (
                                                  <span className="text-xs text-indigo-700 flex items-center mt-0.5">
                                                      <Building className="w-3 h-3 mr-1" />
                                                      {deptPath}
                                                  </span>
                                              )}
                                          </div>
                                      );
                                  })()}
                              </div>
                          )}

                          <div>
                              <label className="text-xs font-semibold text-gray-500 mb-1 block">客户</label>
                              <select 
                                  className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                                  value={selectedClientId}
                                  onChange={e => setSelectedClientId(e.target.value)}
                                  disabled={!canEdit}
                              >
                                  <option value="">选择客户...</option>
                                  {clients.map(c => (
                                      <option key={c.id} value={c.id}>
                                          {c.name} - {c.company} (负责人: {getUserName(c.userId)})
                                      </option>
                                  ))}
                              </select>
                              
                              {/* Client Details Display */}
                              {selectedClientId && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                      {clientPosition && (
                                          <div className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg inline-block border border-blue-100">
                                              <span className="font-bold">当前职位:</span> {clientPosition}
                                          </div>
                                      )}
                                      <div className="text-xs text-purple-600 bg-purple-50 px-3 py-2 rounded-lg inline-block border border-purple-100 flex items-center">
                                          <UserCheck className="w-3 h-3 mr-1" />
                                          <span className="font-bold mr-1">负责人:</span> 
                                          {(() => {
                                              const client = clients.find(c => c.id === selectedClientId);
                                              return getUserName(client?.userId);
                                          })()}
                                      </div>
                                  </div>
                              )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="text-xs font-semibold text-gray-500 mb-1 block">日期</label>
                                  <input type="date" disabled={!canEdit} className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500" value={date} onChange={e => setDate(e.target.value)} />
                              </div>
                              <div>
                                  <label className="text-xs font-semibold text-gray-500 mb-1 block">类型</label>
                                  <select disabled={!canEdit} className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500" value={category} onChange={e => setCategory(e.target.value as VisitCategory)}>
                                      <option value="Outbound">外出拜访</option>
                                      <option value="Inbound">客户来访</option>
                                  </select>
                              </div>
                          </div>

                          <div>
                              <label className="text-xs font-semibold text-gray-500 mb-1 block">参与人员</label>
                              <input type="text" disabled={!canEdit} className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500" placeholder="如：张经理, 李工" value={participants} onChange={e => setParticipants(e.target.value)} />
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
                                          disabled={!canEdit}
                                          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
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
                               {existingAttachments.map((att, idx) => {
                                   const isAudio = att.url.startsWith('data:audio') || att.name.includes('语音') || att.name.endsWith('.webm') || att.name.endsWith('.mp3');
                                   const isPlaying = playingAudioId === att.id;
                                   
                                   return (
                                       <div key={att.id} className={`relative group border rounded-lg p-2 pr-8 flex items-center transition-all ${isAudio ? (isPlaying ? 'bg-indigo-100 border-indigo-300 ring-2 ring-indigo-200' : 'bg-indigo-50 border-indigo-200') : 'bg-gray-50 border-gray-200'}`}>
                                           {isAudio ? (
                                               <button 
                                                   onClick={(e) => { e.preventDefault(); toggleAudio(att); }}
                                                   className={`mr-2 p-1 rounded-full transition-colors ${isPlaying ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 hover:bg-indigo-100'}`}
                                               >
                                                   {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                                               </button>
                                           ) : (
                                               att.type === 'image' ? <ImageIcon className="w-4 h-4 mr-2 text-blue-500" /> : <FileText className="w-4 h-4 mr-2 text-gray-500" />
                                           )}
                                           <span className={`text-xs truncate max-w-[120px] font-medium ${isAudio ? 'text-indigo-900' : 'text-gray-700'}`}>{att.name}</span>
                                           {isAudio && isPlaying && (
                                                <span className="flex space-x-0.5 ml-2 h-3 items-end">
                                                   <span className="w-0.5 bg-indigo-500 animate-[bounce_1s_infinite] h-2"></span>
                                                   <span className="w-0.5 bg-indigo-500 animate-[bounce_1.2s_infinite] h-3"></span>
                                                   <span className="w-0.5 bg-indigo-500 animate-[bounce_0.8s_infinite] h-1.5"></span>
                                                </span>
                                           )}
                                           {canEdit && (
                                                <button onClick={() => setExistingAttachments(prev => prev.filter(a => a.id !== att.id))} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1"><X className="w-3 h-3" /></button>
                                           )}
                                       </div>
                                   );
                               })}
                           </div>
                           {canEdit && (
                               <>
                                   <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                                   <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-lg p-3 text-sm font-medium transition-all flex items-center justify-center">
                                       <Paperclip className="w-4 h-4 mr-2" /> 上传图片/文档
                                   </button>
                               </>
                           )}
                       </div>
                  </div>

                  {/* Middle & Right: Notes & AI */}
                  <div className="lg:col-span-2 flex flex-col h-[800px]">
                      {/* Toolbar - Only visible if can edit */}
                      {canEdit && (
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
                                       onClick={handleOpenAIConfig}
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
                      )}

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
                                  className="flex-1 w-full border border-gray-300 rounded-xl p-4 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500"
                                  placeholder={canEdit ? "在此输入会议纪要，或使用语音录入..." : "暂无笔记内容"}
                                  disabled={!canEdit}
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
                                                       <input type="checkbox" disabled={!canEdit} className="mt-1 mr-2 rounded text-indigo-600 focus:ring-indigo-500" />
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
                                           readOnly={!canEdit}
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-all">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in ring-1 ring-gray-200">
                <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center">
                        <Settings className="w-5 h-5 mr-2 text-blue-600" />
                        AI 模型配置
                    </h3>
                    <button onClick={() => setShowAIConfig(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-3">选择分析模型</label>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setTempAIModel('Gemini')}
                                className={`relative p-4 rounded-xl border-2 transition-all text-left flex flex-col gap-1 ${tempAIModel === 'Gemini' ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                            >
                                <span className="font-bold text-gray-900 text-base">Gemini</span>
                                <span className="text-xs text-gray-500">Google GenAI (多模态)</span>
                                {tempAIModel === 'Gemini' && <div className="absolute top-3 right-3 text-blue-600"><Check className="w-5 h-5" /></div>}
                            </button>
                            <button 
                                onClick={() => setTempAIModel('DeepSeek')}
                                className={`relative p-4 rounded-xl border-2 transition-all text-left flex flex-col gap-1 ${tempAIModel === 'DeepSeek' ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                            >
                                <span className="font-bold text-gray-900 text-base">DeepSeek</span>
                                <span className="text-xs text-gray-500">DeepSeek V3/R1 (文本)</span>
                                {tempAIModel === 'DeepSeek' && <div className="absolute top-3 right-3 text-blue-600"><Check className="w-5 h-5" /></div>}
                            </button>
                        </div>
                    </div>

                    {tempAIModel === 'DeepSeek' && (
                        <div className="animate-fade-in bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <label className="block text-sm font-bold text-gray-700 mb-2">DeepSeek API Key</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input 
                                    type="password"
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm bg-white"
                                    placeholder="sk-..."
                                    value={tempDeepSeekKey}
                                    onChange={(e) => setTempDeepSeekKey(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2 flex items-center">
                                <Shield className="w-3 h-3 mr-1" />
                                Key 仅保存在本地浏览器，不上传服务器。
                            </p>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button onClick={() => setShowAIConfig(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm transition-colors">
                        取消
                    </button>
                    <button onClick={handleSaveAIConfig} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm text-sm">
                        保存配置
                    </button>
                </div>
              </div>
            </div>
          )}
      </div>
  );
};

export default VisitManager;
