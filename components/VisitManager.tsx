import React, { useState, useRef, useEffect } from 'react';
import { Visit, Client, AIAnalysisResult, CustomFieldDefinition, Attachment, CustomFieldData } from '../types';
import { analyzeVisitNotes, analyzeVisitAudio } from '../services/geminiService';
// Added AlertCircle to lucide-react imports to fix missing component error
import { Sparkles, Calendar, CheckCircle, Clock, FileText, Send, ChevronRight, ChevronLeft, Loader2, Copy, LayoutList, Calendar as CalendarIcon, Mic, Square, StopCircle, Paperclip, Image as ImageIcon, File, Pencil, Trash2, Headphones, Plus, AlertCircle, Search, Filter, X, Play, Pause, History, Maximize2, Minimize2, ChevronsUpDown } from 'lucide-react';

interface VisitManagerProps {
  clients: Client[];
  visits: Visit[];
  onAddVisit: (visit: Visit) => void;
  onUpdateVisit: (visit: Visit) => void;
  onDeleteVisit: (id: string) => void;
  fieldDefinitions: CustomFieldDefinition[];
  initialEditingVisitId?: string | null;
  onClearInitialEditingVisitId?: () => void;
  currentUserId: string;
}

const DRAFT_KEY = 'visit_pro_form_draft';

interface DraftData {
  editingVisitId: string | null;
  selectedClientId: string;
  visitClientName: string;
  date: string;
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
    fieldDefinitions,
    initialEditingVisitId,
    onClearInitialEditingVisitId,
    currentUserId
}) => {
  const [view, setView] = useState<'LIST' | 'CREATE' | 'CALENDAR'>('LIST');
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  
  // List Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Form State
  const [selectedClientId, setSelectedClientId] = useState('');
  const [visitClientName, setVisitClientName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rawNotes, setRawNotes] = useState('');
  const [customFieldInputs, setCustomFieldInputs] = useState<Record<string, string>>({});
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fullscreen Edit State
  const [fullScreenField, setFullScreenField] = useState<'notes' | 'summary' | null>(null);

  // Expand State for Textareas
  const [expandedSections, setExpandedSections] = useState<{ notes: boolean; summary: boolean }>({ notes: false, summary: false });

  // Dirty State & Confirmation
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  // AI & Recording State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Audio Playback State
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Auto-save Draft State
  const [draftData, setDraftData] = useState<DraftData | null>(null);

  const visitDefinitions = fieldDefinitions.filter(d => d.target === 'Visit');

  // Find the latest audio recording from attachments
  const latestAudio = existingAttachments
    .filter(a => a.name.startsWith('语音录音_'))
    .sort((a, b) => b.name.localeCompare(a.name))[0];

  // Filtering Logic
  const filteredVisits = visits.filter(visit => {
    // 1. Text Search (Client Name or Summary)
    const matchesSearch = 
        visit.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        visit.summary.toLowerCase().includes(searchTerm.toLowerCase());

    // 2. Outcome Filter
    const matchesOutcome = filterOutcome === 'ALL' || visit.outcome === filterOutcome;

    // 3. Date Range Filter
    const visitDateStr = new Date(visit.date).toISOString().split('T')[0];
    const matchesStartDate = !filterStartDate || visitDateStr >= filterStartDate;
    const matchesEndDate = !filterEndDate || visitDateStr <= filterEndDate;

    return matchesSearch && matchesOutcome && matchesStartDate && matchesEndDate;
  });

  // Auto-save Effect
  useEffect(() => {
    if (view === 'CREATE' && hasUnsavedChanges) {
        const timer = setTimeout(() => {
            const dataToSave: DraftData = {
                editingVisitId,
                selectedClientId,
                visitClientName,
                date,
                rawNotes,
                customFieldInputs,
                analysisResult,
                timestamp: Date.now()
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(dataToSave));
        }, 1000); // Debounce save by 1s
        return () => clearTimeout(timer);
    }
  }, [view, hasUnsavedChanges, editingVisitId, selectedClientId, visitClientName, date, rawNotes, customFieldInputs, analysisResult]);

  // Check for Draft on Mount/View Change
  useEffect(() => {
    if (view === 'CREATE') {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
            try {
                const parsed: DraftData = JSON.parse(savedDraft);
                // Only prompt if the draft matches the current context (same edit ID or both null for new)
                // and we haven't already loaded data (prevent prompt loop if we just restored)
                if (parsed.editingVisitId === editingVisitId && !hasUnsavedChanges && 
                    (parsed.rawNotes || parsed.selectedClientId)) {
                    setDraftData(parsed);
                }
            } catch (e) {
                console.error("Failed to parse draft", e);
            }
        }
    } else {
        setDraftData(null);
    }
  }, [view, editingVisitId]); // Removed hasUnsavedChanges to avoid hiding banner after typing 1 char

  const handleRestoreDraft = () => {
    if (!draftData) return;
    
    setEditingVisitId(draftData.editingVisitId);
    setSelectedClientId(draftData.selectedClientId);
    setVisitClientName(draftData.visitClientName);
    setDate(draftData.date);
    setRawNotes(draftData.rawNotes);
    setCustomFieldInputs(draftData.customFieldInputs);
    setAnalysisResult(draftData.analysisResult);
    setHasUnsavedChanges(true); // Restored draft is considered unsaved changes
    setDraftData(null);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftData(null);
  };

  const clearFilters = () => {
      setSearchTerm('');
      setFilterOutcome('ALL');
      setFilterStartDate('');
      setFilterEndDate('');
  };

  const startEdit = (visit: Visit) => {
    setEditingVisitId(visit.id);
    setSelectedClientId(visit.clientId);
    setVisitClientName(visit.clientName);
    setDate(visit.date.split('T')[0]);
    setRawNotes(visit.rawNotes);
    setExistingAttachments(visit.attachments || []);
    
    setAnalysisResult({
      summary: visit.summary,
      sentiment: visit.outcome === 'Pending' ? 'Neutral' : visit.outcome,
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
        if (visit) {
            startEdit(visit);
        }
        if (onClearInitialEditingVisitId) {
            onClearInitialEditingVisitId();
        }
    }
  }, [initialEditingVisitId, visits, onClearInitialEditingVisitId]);

  // Recording Timer Effect
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current = null;
        }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleExpand = (section: 'notes' | 'summary') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleAnalyze = async () => {
    if (!rawNotes.trim() || !selectedClientId) return;
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeVisitNotes(client.name, rawNotes);
      setAnalysisResult(result);
      setHasUnsavedChanges(true);
    } catch (e: any) {
      console.error(e);
      // Pass the specific error message if available
      alert(e.message || "分析笔记失败，请重试。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startRecording = async () => {
    if (!selectedClientId) {
      alert("请先选择客户，然后再开始录音。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine the best supported mime type
      let selectedMimeType = '';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          selectedMimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          selectedMimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          selectedMimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          selectedMimeType = 'audio/wav';
      }
      
      const options: MediaRecorderOptions = selectedMimeType ? { mimeType: selectedMimeType } : {};
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      // Define onstop immediately to avoid race conditions
      mediaRecorder.onstop = async () => {
         // Use the explicitly selected mime type if available, otherwise fallback to recorder's property or default
         const finalMimeType = selectedMimeType || mediaRecorder.mimeType || 'audio/webm';
         const audioBlob = new Blob(audioChunksRef.current, { type: finalMimeType });
         audioChunksRef.current = [];
         
         if (audioBlob.size === 0) {
             alert("录音为空，请重试。");
             return;
         }

         const reader = new FileReader();
         reader.readAsDataURL(audioBlob);
         reader.onloadend = async () => {
            const base64String = reader.result as string;
            
            // 1. Save Recording as Attachment
            // Determine extension from finalMimeType
            const ext = finalMimeType.split(';')[0].split('/')[1] || 'webm';
            const timestamp = new Date().toLocaleTimeString('zh-CN', {hour12: false}).replace(/:/g, '');
            
            const newAttachment: Attachment = {
                id: crypto.randomUUID(),
                name: `语音录音_${timestamp}.${ext}`,
                type: 'document', // treating audio as a file/document
                url: base64String
            };
            
            setExistingAttachments(prev => [...prev, newAttachment]);
            setHasUnsavedChanges(true);

            // 2. Process for Analysis
            // Extract raw base64
            const base64Data = base64String.split(',')[1];
            // Use base mime type (remove codecs parameters)
            const cleanMimeType = finalMimeType.split(';')[0];
            
            await processAudioBase64(base64Data, cleanMimeType);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("无法访问麦克风，请检查权限设置。");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Stop all tracks to fully release the microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleAnalyzeAudio = async () => {
    if (!latestAudio || !selectedClientId) return;
    
    // Parse the data URL to get mimeType and base64
    // Format: data:[<mediatype>][;base64],<data>
    const matches = latestAudio.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
        alert("无法解析录音数据");
        return;
    }
    
    const mimeType = matches[1];
    const base64Data = matches[2];

    await processAudioBase64(base64Data, mimeType);
  };

  const processAudioBase64 = async (base64Data: string, mimeType: string) => {
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;
    
    setIsAnalyzing(true);
    try {
      const result = await analyzeVisitAudio(client.name, base64Data, mimeType);
      setAnalysisResult(result);
      
      // Merge transcription to rawNotes
      if (result.transcription) {
        setRawNotes(prev => {
           const transcriptText = `[语音转写]: ${result.transcription}`;
           // Append with double newline if notes exist, otherwise just set it
           return prev ? `${prev}\n\n${transcriptText}` : transcriptText;
        });
      }
      setHasUnsavedChanges(true);
    } catch (e: any) {
      console.error("Audio analysis failed:", e);
      let errorMsg = "语音分析失败，请稍后重试。";
      
      // Provide more specific error messages based on common API errors
      if (e.message?.includes('400') || e.message?.includes('INVALID_ARGUMENT')) {
          errorMsg = `不支持的音频格式 (${mimeType}) 或音频数据损坏。请尝试重新录制或检查麦克风设置。`;
      } else if (e.message?.includes('500')) {
          errorMsg = "AI 服务暂时不可用，请稍后重试。";
      } else if (e.message?.includes('不支持') || e.message?.includes('DeepSeek')) {
          // Pass through the explicit error message from service
          errorMsg = e.message;
      }
      
      alert(errorMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await blobToBase64(file);
      const newAttachment: Attachment = {
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'document',
        url: base64
      };
      setExistingAttachments(prev => [...prev, newAttachment]);
      setHasUnsavedChanges(true);
    } catch (e) {
      console.error("Error uploading file:", e);
      alert("文件上传失败");
    }
    // Reset input so same file can be selected again if needed
    if (event.target) event.target.value = '';
  };

  const handleDeleteAttachment = (attId: string) => {
      setExistingAttachments(prev => prev.filter(a => a.id !== attId));
      if (playingAudioId === attId) {
          if (audioPlayerRef.current) {
              audioPlayerRef.current.pause();
              audioPlayerRef.current = null;
          }
          setPlayingAudioId(null);
      }
      setHasUnsavedChanges(true);
  };

  const toggleAudio = (att: Attachment) => {
    if (playingAudioId === att.id) {
        audioPlayerRef.current?.pause();
        audioPlayerRef.current = null;
        setPlayingAudioId(null);
    } else {
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
        }
        const audio = new Audio(att.url);
        audioPlayerRef.current = audio;
        setPlayingAudioId(att.id);
        audio.play().catch(err => {
            console.error("Audio play error", err);
            setPlayingAudioId(null);
            alert("无法播放音频");
        });
        audio.onended = () => {
            setPlayingAudioId(null);
            audioPlayerRef.current = null;
        };
    }
  };

  const isAudioAttachment = (att: Attachment) => {
    return att.url.startsWith('data:audio/') || att.name.startsWith('语音录音_');
  };

  const handleSave = () => {
    if (!selectedClientId || !analysisResult) return;
    const client = clients.find(c => c.id === selectedClientId)!;
    const customFieldsData: CustomFieldData[] = Object.entries(customFieldInputs).map(([fieldId, value]) => ({ fieldId, value: value as string }));
    const visitData: Visit = {
      id: editingVisitId || crypto.randomUUID(),
      userId: editingVisitId ? (visits.find(v => v.id === editingVisitId)?.userId || currentUserId) : currentUserId,
      clientId: client.id,
      clientName: visitClientName || client.name,
      date: new Date(date).toISOString(),
      rawNotes,
      summary: analysisResult.summary,
      outcome: analysisResult.sentiment === 'Negative' ? 'Negative' : analysisResult.sentiment === 'Positive' ? 'Positive' : 'Neutral',
      actionItems: analysisResult.actionItems,
      sentimentScore: analysisResult.sentiment === 'Positive' ? 80 : analysisResult.sentiment === 'Negative' ? 30 : 50,
      customFields: customFieldsData,
      attachments: existingAttachments,
      followUpEmailDraft: analysisResult.followUpEmailDraft
    };
    if (editingVisitId) { onUpdateVisit(visitData); } else { onAddVisit(visitData); }
    
    // Clear draft on successful save
    localStorage.removeItem(DRAFT_KEY);
    
    resetForm();
    setView('LIST'); 
  };

  const resetForm = () => {
    setEditingVisitId(null);
    setRawNotes('');
    setAnalysisResult(null);
    setSelectedClientId('');
    setVisitClientName('');
    setDate(new Date().toISOString().split('T')[0]);
    setCustomFieldInputs({});
    setExistingAttachments([]);
    setHasUnsavedChanges(false);
    setShowDiscardConfirm(false);
    setDraftData(null);
    setFullScreenField(null);
    setExpandedSections({ notes: false, summary: false });
    if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
    }
    setPlayingAudioId(null);
  };

  // Centralized view switching with confirmation
  const handleSwitchView = (targetView: 'LIST' | 'CREATE' | 'CALENDAR') => {
    if (view === 'CREATE' && hasUnsavedChanges) {
        // If we are currently in CREATE mode and have changes, show confirmation.
        // We set the *intended* view in a temp variable? No, React state update is better.
        // Since `showDiscardConfirm` modal uses `setView('LIST')` on discard, 
        // we can just leverage that existing logic but generalize it?
        // For now, if user clicks standard navigation (outside of Cancel), we intercept.
        if (targetView !== 'CREATE') {
             // We can use a ref or state to store where we wanted to go, but simpler:
             // Just show the confirm dialog. The dialog's "Discard" button currently goes to 'LIST'.
             // If we want to go to CALENDAR, we'd need to know that.
             // For simplicity given the requirements: "Prompt ... before discarding".
             // We will assume "Discard" goes to the default view (LIST) or we could improve this later.
             setShowDiscardConfirm(true); 
             return;
        }
        // If target is CREATE (e.g. "Record New Visit" clicked again), also prompt.
        setShowDiscardConfirm(true);
        return;
    }
    
    // No changes, proceed
    if (targetView === 'CREATE') {
        resetForm();
    }
    setView(targetView);
  };
  
  // Specific handler for the "Cancel" button in the form
  const handleCancel = () => {
      if (hasUnsavedChanges) {
          setShowDiscardConfirm(true);
      } else {
          resetForm();
          setView('LIST');
      }
  };

  const copyEmail = () => {
    if (analysisResult?.followUpEmailDraft) {
      navigator.clipboard.writeText(analysisResult.followUpEmailDraft);
      alert("邮件草稿已复制到剪贴板！");
    }
  };

  const translateOutcome = (outcome: string) => {
    switch (outcome) {
      case 'Positive': return '积极';
      case 'Neutral': return '中立';
      case 'Negative': return '消极';
      case 'Pending': return '待定';
      default: return outcome;
    }
  };

  // Calendar Helpers
  const generateCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days: (Date | null)[] = [];
    // Previous month padding
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(null);
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
    }
    return days;
  };

  const isSameDay = (d1: Date, d2: Date) => {
      return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  };

  const getVisitsForDate = (date: Date) => visits.filter(v => isSameDay(new Date(v.date), date));

  const changeMonth = (offset: number) => {
      setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const calendarDays = generateCalendarDays(calendarDate);
  const selectedDateVisits = getVisitsForDate(selectedDate);
  const monthName = calendarDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });

  if (view === 'CREATE') {
    return (
      <>
        <div className="max-w-4xl mx-auto animate-fade-in relative">
          <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{editingVisitId ? '编辑拜访记录' : '记录新拜访'}</h2>
              <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-900">取消</button>
          </div>

          {/* Draft Restore Banner */}
          {draftData && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between animate-fade-in shadow-sm">
                  <div className="flex items-center space-x-3">
                      <div className="p-2 bg-amber-100 rounded-full">
                          <History className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                          <p className="text-sm font-bold text-gray-800">发现未保存的草稿</p>
                          <p className="text-xs text-gray-600">
                              系统检测到您在 {new Date(draftData.timestamp).toLocaleString('zh-CN')} 有未保存的内容。
                          </p>
                      </div>
                  </div>
                  <div className="flex items-center space-x-2">
                      <button 
                          onClick={handleRestoreDraft}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm"
                      >
                          恢复草稿
                      </button>
                      <button 
                          onClick={handleDiscardDraft}
                          className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 text-xs font-bold rounded-md transition-colors"
                      >
                          忽略
                      </button>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择客户</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={selectedClientId}
                  onChange={(e) => {
                      const id = e.target.value;
                      setSelectedClientId(id);
                      const client = clients.find(c => c.id === id);
                      setVisitClientName(client ? client.name : '');
                      setHasUnsavedChanges(true);
                  }}
                >
                  <option value="">-- 请选择客户 --</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.company})</option>)}
                </select>
                
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">拜访对象姓名</label>
                    <input 
                        type="text"
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={visitClientName}
                        onChange={(e) => {
                            setVisitClientName(e.target.value);
                            setHasUnsavedChanges(true);
                        }}
                        placeholder="例如：张三"
                        disabled={!selectedClientId}
                    />
                </div>

                <label className="block text-sm font-medium text-gray-700 mt-4 mb-2">拜访日期</label>
                <input 
                  type="date" 
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={date}
                  onChange={(e) => {
                      setDate(e.target.value);
                      setHasUnsavedChanges(true);
                  }}
                />

                {visitDefinitions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">其他拜访信息</h4>
                      <div className="space-y-3">
                          {visitDefinitions.map((def) => (
                              <div key={def.id}>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">{def.label}</label>
                                  <input 
                                      type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                                      className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" 
                                      value={customFieldInputs[def.id] || ''}
                                      onChange={e => {
                                          setCustomFieldInputs({...customFieldInputs, [def.id]: e.target.value});
                                          setHasUnsavedChanges(true);
                                      }}
                                      placeholder={`输入${def.label}...`}
                                  />
                              </div>
                          ))}
                      </div>
                    </div>
                )}
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-auto min-h-[400px]">
                <div className="flex justify-between items-center mb-2">
                   <label className="block text-sm font-medium text-gray-700">原始笔记</label>
                   <div className="flex items-center space-x-3">
                      <span className={`text-xs ${rawNotes.length > 500 ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>
                        {rawNotes.length} 字
                      </span>
                      <div className="h-4 w-px bg-gray-200"></div>
                      <button 
                          type="button"
                          onClick={() => toggleExpand('notes')}
                          className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                          title={expandedSections.notes ? "收起" : "展开更多"}
                      >
                          <ChevronsUpDown className="w-4 h-4" />
                      </button>
                      <button 
                          type="button" 
                          onClick={() => setFullScreenField('notes')} 
                          className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                          title="全屏编辑"
                      >
                          <Maximize2 className="w-4 h-4" />
                      </button>
                      {/* Auto-save indicator */}
                      {hasUnsavedChanges && (
                           <span className="text-xs text-amber-500 flex items-center animate-pulse ml-1" title="有未保存的更改">
                               <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                           </span>
                      )}
                   </div>
                </div>
                <textarea 
                  className={`flex-1 w-full border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 outline-none resize-y custom-scrollbar transition-all duration-300 ${expandedSections.notes ? 'min-h-[400px]' : 'min-h-[150px]'}`}
                  placeholder="输入笔记或使用下方录音..."
                  value={rawNotes}
                  onChange={(e) => {
                      setRawNotes(e.target.value);
                      setHasUnsavedChanges(true);
                  }}
                />
                <div className="mt-4 flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                   <div className="flex items-center space-x-3">
                      {!isRecording ? (
                           <button 
                              onClick={startRecording}
                              disabled={isAnalyzing || !selectedClientId}
                              className={`p-3 rounded-full transition-all flex items-center justify-center shadow-sm
                                  ${isAnalyzing || !selectedClientId ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                              title={!selectedClientId ? "请先选择客户" : "开始录音"}
                           >
                               <Mic className="w-5 h-5" />
                           </button>
                      ) : (
                          <button 
                              onClick={stopRecording}
                              className="p-3 rounded-full bg-red-600 text-white animate-pulse hover:bg-red-700 shadow-md flex items-center justify-center"
                              title="停止并分析"
                          >
                              <Square className="w-5 h-5 fill-current" />
                          </button>
                      )}
                      {isRecording ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-red-600 font-bold animate-pulse">正在录音...</span>
                          <span className="text-sm font-mono text-gray-600">{formatTime(recordingTime)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">点击麦克风开启语音笔记</span>
                      )}
                   </div>

                  <div className="flex items-center space-x-2">
                      {latestAudio && (
                          <button
                              onClick={handleAnalyzeAudio}
                              disabled={isAnalyzing || isRecording}
                              className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium text-white transition-all
                              ${isAnalyzing || isRecording ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-md'}`}
                              title="重新分析最新录音"
                          >
                              {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Headphones className="w-5 h-5" />}
                              <span className="hidden sm:inline">分析录音</span>
                          </button>
                      )}
                      <button 
                        onClick={handleAnalyze}
                        disabled={!rawNotes || !selectedClientId || isAnalyzing || isRecording}
                        className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium text-white transition-all
                          ${!rawNotes || !selectedClientId || isRecording ? 'bg-gray-300 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md'}`}
                      >
                        {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        <span>{isAnalyzing ? '分析中...' : '智能分析'}</span>
                      </button>
                  </div>
                </div>

                {/* Attachments Section */}
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-700 flex items-center">
                          <Paperclip className="w-4 h-4 mr-2 text-gray-500" /> 附件 ({existingAttachments.length})
                      </h4>
                      <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center"
                      >
                          <Plus className="w-3 h-3 mr-1" /> 添加
                      </button>
                      <input type="file" ref={fileInputRef} hidden onChange={handleFileUpload} multiple />
                  </div>
                  
                  {existingAttachments.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {existingAttachments.map(att => {
                              const isAudio = isAudioAttachment(att);
                              return (
                                  <div key={att.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100 group hover:border-blue-200 transition-colors">
                                      <div className="flex items-center overflow-hidden flex-1">
                                          <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center mr-3 shrink-0">
                                              {att.type === 'image' ? <ImageIcon className="w-4 h-4 text-purple-500"/> : 
                                              isAudio ? <Headphones className="w-4 h-4 text-blue-500"/> :
                                              <File className="w-4 h-4 text-gray-500"/>}
                                          </div>
                                          <div className="truncate mr-2">
                                              <p className="text-xs font-medium text-gray-700 truncate">{att.name}</p>
                                              <p className="text-[10px] text-gray-400">已上传</p>
                                          </div>
                                      </div>
                                      
                                      <div className="flex items-center">
                                          {isAudio && (
                                              <button 
                                                  type="button"
                                                  onClick={() => toggleAudio(att)}
                                                  className="p-1.5 mr-1 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                                              >
                                                  {playingAudioId === att.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                              </button>
                                          )}
                                          <button 
                                              onClick={() => handleDeleteAttachment(att.id)} 
                                              className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                          >
                                              <X className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all">
                          <p className="text-xs">点击上传图片或文档</p>
                      </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {!analysisResult ? (
                <div className="h-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                  {isAnalyzing ? (
                     <>
                        <Loader2 className="w-12 h-12 mb-4 text-blue-500 animate-spin" />
                        <p className="text-lg font-medium text-blue-600">DeepSeek 正在处理...</p>
                        <p className="text-sm">正在整理您的{isRecording || (!rawNotes && isAnalyzing) ? '语音' : '笔记'}内容，请稍候。</p>
                     </>
                  ) : (
                      <>
                          <Sparkles className="w-12 h-12 mb-4 text-gray-300" />
                          <p className="text-lg font-medium">等待 AI 分析</p>
                          <p className="text-sm">输入笔记或点击录音，让 DeepSeek 生成见解。</p>
                      </>
                  )}
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  {analysisResult.transcription && (
                     <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm">
                        <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center">
                          <Headphones className="w-4 h-4 mr-2" /> 语音转写原文
                        </h3>
                        <p className="text-sm text-blue-700 italic leading-relaxed whitespace-pre-wrap">{analysisResult.transcription}</p>
                     </div>
                  )}

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                          <Sparkles className="w-24 h-24 text-blue-600" />
                      </div>
                    <div className="flex justify-between items-center mb-4 relative z-10">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center">
                            <FileText className="w-5 h-5 mr-2 text-blue-600" /> 拜访摘要
                        </h3>
                        <div className="flex items-center space-x-3">
                             <span className={`text-xs ${analysisResult.summary.length > 500 ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>
                                {analysisResult.summary.length} 字
                             </span>
                             <div className="h-4 w-px bg-gray-200"></div>
                             <button 
                                  type="button"
                                  onClick={() => toggleExpand('summary')}
                                  className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                                  title={expandedSections.summary ? "收起" : "展开更多"}
                              >
                                  <ChevronsUpDown className="w-4 h-4" />
                              </button>
                              <button 
                                  type="button"
                                  onClick={() => setFullScreenField('summary')}
                                  className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                                  title="全屏编辑"
                              >
                                  <Maximize2 className="w-4 h-4" />
                              </button>
                        </div>
                    </div>
                    
                    <textarea
                      className={`w-full text-gray-700 leading-relaxed mb-4 p-2 border border-transparent hover:border-gray-200 rounded focus:border-blue-300 focus:ring-0 resize-y bg-transparent custom-scrollbar transition-all duration-300 ${expandedSections.summary ? 'min-h-[400px]' : 'min-h-[120px]'}`}
                      value={analysisResult.summary}
                      onChange={(e) => {
                          setAnalysisResult({...analysisResult, summary: e.target.value});
                          setHasUnsavedChanges(true);
                      }}
                      rows={4}
                    />
                    
                    <div className="flex items-center space-x-2 mb-4">
                      <span className="text-sm font-medium text-gray-500">情绪:</span>
                      <select 
                          value={analysisResult.sentiment}
                          onChange={(e) => {
                              setAnalysisResult({...analysisResult, sentiment: e.target.value as any});
                              setHasUnsavedChanges(true);
                          }}
                          className="text-xs font-bold uppercase tracking-wide bg-gray-100 border-none rounded p-1"
                      >
                          <option value="Positive">Positive</option>
                          <option value="Neutral">Neutral</option>
                          <option value="Negative">Negative</option>
                      </select>
                    </div>

                    <h4 className="font-semibold text-gray-800 mb-2">行动项:</h4>
                    <ul className="space-y-2">
                      {analysisResult.actionItems.map((item, idx) => (
                        <li key={idx} className="flex items-start text-sm text-gray-600">
                          <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 shrink-0" />
                          <input 
                              className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm text-gray-600"
                              value={item}
                              onChange={(e) => {
                                  const items = [...analysisResult.actionItems];
                                  items[idx] = e.target.value;
                                  setAnalysisResult({...analysisResult, actionItems: items});
                                  setHasUnsavedChanges(true);
                              }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center">
                          <Send className="w-5 h-5 mr-2 text-indigo-600" /> 跟进邮件草稿
                      </h3>
                      <button onClick={copyEmail} className="text-gray-400 hover:text-gray-600 transition-colors" title="复制到剪贴板">
                          <Copy className="w-5 h-5" />
                      </button>
                    </div>
                    <textarea 
                      className="w-full bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm text-gray-700 font-mono whitespace-pre-wrap h-40 focus:ring-2 focus:ring-blue-500 outline-none custom-scrollbar"
                      value={analysisResult.followUpEmailDraft}
                      onChange={(e) => {
                          setAnalysisResult({...analysisResult, followUpEmailDraft: e.target.value});
                          setHasUnsavedChanges(true);
                      }}
                    />
                  </div>

                  <button 
                    onClick={handleSave}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all flex items-center justify-center space-x-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span>保存{editingVisitId ? '修改' : '记录'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fullscreen Edit Modal */}
        {fullScreenField && (
            <div className="fixed inset-0 z-[60] bg-white flex flex-col animate-scale-in">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                     <h2 className="text-lg font-bold text-gray-800">
                        {fullScreenField === 'notes' ? '编辑原始笔记' : '编辑拜访摘要'}
                     </h2>
                     <div className="flex items-center space-x-4">
                         <span className="text-sm text-gray-500">
                            {fullScreenField === 'notes' ? `字数: ${rawNotes.length}` : ''}
                         </span>
                         <button 
                            onClick={() => setFullScreenField(null)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                         >
                            <Minimize2 className="w-4 h-4" />
                            <span>退出全屏</span>
                         </button>
                     </div>
                </div>
                <div className="flex-1 p-6 overflow-hidden flex flex-col">
                    <textarea
                        className="flex-1 w-full resize-none outline-none text-base leading-relaxed p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 custom-scrollbar"
                        placeholder={fullScreenField === 'notes' ? "输入详细的会议笔记..." : "编辑拜访摘要..."}
                        value={fullScreenField === 'notes' ? rawNotes : analysisResult?.summary || ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (fullScreenField === 'notes') {
                                setRawNotes(val);
                            } else if (analysisResult) {
                                setAnalysisResult({...analysisResult, summary: val});
                            }
                            setHasUnsavedChanges(true);
                        }}
                        autoFocus
                    />
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <button 
                         onClick={() => setFullScreenField(null)}
                         className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-sm transition-colors"
                    >
                        完成
                    </button>
                </div>
            </div>
        )}

        {/* Discard Changes Confirmation Modal */}
        {showDiscardConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                    <div className="p-6 text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                            <AlertCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">未保存的更改</h3>
                        <p className="text-sm text-gray-500">您有未保存的更改，确定要放弃吗？</p>
                    </div>
                    <div className="flex border-t border-gray-100">
                        <button 
                            onClick={() => setShowDiscardConfirm(false)}
                            className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-r border-gray-100"
                        >
                            继续编辑
                        </button>
                        <button 
                            onClick={() => {
                                // Explicitly remove draft when user confirms discard
                                localStorage.removeItem(DRAFT_KEY);
                                resetForm();
                                setView('LIST');
                            }}
                            className="flex-1 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                            放弃更改
                        </button>
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
                <button onClick={() => handleSwitchView('LIST')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${view === 'LIST' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>
                    <LayoutList className="w-4 h-4 mr-1.5"/> 列表
                </button>
                <button onClick={() => handleSwitchView('CALENDAR')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${view === 'CALENDAR' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>
                    <CalendarIcon className="w-4 h-4 mr-1.5"/> 日历
                </button>
            </div>
        </div>
        <button onClick={() => handleSwitchView('CREATE')} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-colors flex items-center justify-center space-x-2">
          <Calendar className="w-5 h-5" />
          <span>记录新拜访</span>
        </button>
      </div>

      {view === 'LIST' && (
          <div className="space-y-4 animate-fade-in">
            {/* Filter Toolbar */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="搜索客户名称或拜访摘要关键词..." 
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">结果筛选</label>
                        <div className="relative">
                            <Filter className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <select 
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white appearance-none"
                                value={filterOutcome}
                                onChange={(e) => setFilterOutcome(e.target.value)}
                            >
                                <option value="ALL">全部结果</option>
                                <option value="Positive">积极 (Positive)</option>
                                <option value="Neutral">中立 (Neutral)</option>
                                <option value="Negative">消极 (Negative)</option>
                                <option value="Pending">待定 (Pending)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">开始日期</label>
                        <input 
                            type="date"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-600"
                            value={filterStartDate}
                            onChange={(e) => setFilterStartDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">结束日期</label>
                        <input 
                            type="date"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-600"
                            value={filterEndDate}
                            onChange={(e) => setFilterEndDate(e.target.value)}
                        />
                    </div>

                    <button 
                        onClick={clearFilters}
                        className="w-full flex items-center justify-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg transition-colors text-sm font-medium h-[38px]"
                    >
                        <X className="w-4 h-4" />
                        <span>清除筛选</span>
                    </button>
                </div>
            </div>

            {/* Visit List */}
            {filteredVisits.map(visit => (
              <div key={visit.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all group relative">
                <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(visit)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => onDeleteVisit(visit.id)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center space-x-4">
                        <div className={`w-2 h-12 rounded-full ${visit.outcome === 'Positive' ? 'bg-green-500' : visit.outcome === 'Negative' ? 'bg-red-500' : 'bg-gray-300'}`}></div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">{visit.clientName}</h3>
                            <p className="text-sm text-gray-500 flex items-center mt-1"><Clock className="w-4 h-4 mr-1" /> {new Date(visit.date).toLocaleDateString('zh-CN')}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3 pr-16 md:pr-0">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${visit.outcome === 'Positive' ? 'bg-green-100 text-green-700' : visit.outcome === 'Negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {translateOutcome(visit.outcome)}
                        </span>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                </div>
                <p className="text-gray-700 mb-4 pl-6 border-l-2 border-transparent">{visit.summary}</p>
              </div>
            ))}
            
            {/* Empty State */}
            {filteredVisits.length === 0 && (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                    <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-6 h-6 text-gray-400" />
                    </div>
                    <h3 className="text-gray-900 font-medium mb-1">未找到匹配的拜访记录</h3>
                    <p className="text-gray-500 text-sm">请尝试调整搜索关键词或筛选条件。</p>
                </div>
            )}
          </div>
      )}

      {view === 'CALENDAR' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
             <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 flex items-center justify-between border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900">{monthName}</h3>
                        <div className="flex items-center space-x-2">
                            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button onClick={() => setCalendarDate(new Date())} className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors">
                                今天
                            </button>
                            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-2">
                        <div className="grid grid-cols-7 mb-2">
                            {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                                <div key={day} className="text-center text-xs font-bold text-gray-400 py-2">{day}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {calendarDays.map((day, idx) => {
                                if (!day) return <div key={idx} className="aspect-square"></div>;
                                
                                const dayVisits = getVisitsForDate(day);
                                const isSelected = isSameDay(day, selectedDate);
                                const isToday = isSameDay(day, new Date());
                                
                                return (
                                    <button 
                                        key={idx}
                                        onClick={() => setSelectedDate(day)}
                                        className={`relative aspect-square rounded-xl transition-all flex flex-col items-center justify-center border-2
                                            ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100 scale-105 z-10' : 
                                              isToday ? 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100' :
                                              'hover:bg-gray-50 border-transparent text-gray-700'}`}
                                    >
                                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : ''}`}>{day.getDate()}</span>
                                        <div className="flex space-x-0.5 mt-1">
                                            {dayVisits.slice(0, 3).map((v, i) => (
                                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : v.outcome === 'Positive' ? 'bg-green-500' : v.outcome === 'Negative' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                                            ))}
                                            {dayVisits.length > 3 && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-gray-300'}`}></div>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                
                <div className="bg-blue-50 rounded-xl p-4 flex items-start space-x-3 border border-blue-100">
                    <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 leading-relaxed">
                        <b>提示：</b> 点击日历中的日期可以查看该日详细的拜访记录。彩色圆点代表当天的拜访结果情绪。
                    </p>
                </div>
             </div>

             <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full min-h-[500px]">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-bold text-gray-900 flex items-center">
                        <CalendarIcon className="w-4 h-4 mr-2 text-blue-600" />
                        {selectedDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 拜访记录
                    </h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {selectedDateVisits.length > 0 ? (
                        selectedDateVisits.map(visit => (
                            <div 
                                key={visit.id} 
                                onClick={() => startEdit(visit)}
                                className="p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/20 transition-all cursor-pointer group"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{visit.clientName}</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${visit.outcome === 'Positive' ? 'bg-green-100 text-green-700' : visit.outcome === 'Negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                                        {translateOutcome(visit.outcome)}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 line-clamp-2">{visit.summary}</p>
                                <div className="mt-3 flex items-center text-[10px] text-gray-400">
                                    <Clock className="w-3 h-3 mr-1" />
                                    <span>{new Date(visit.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                            <Calendar className="w-12 h-12 mb-4 opacity-10" />
                            <p className="text-sm">该日期暂无拜访安排</p>
                            <button 
                                onClick={() => {
                                    setDate(selectedDate.toISOString().split('T')[0]);
                                    handleSwitchView('CREATE');
                                }}
                                className="mt-4 flex items-center space-x-1 text-blue-600 hover:text-blue-700 font-medium text-xs"
                            >
                                <Plus className="w-3 h-3" />
                                <span>立即预约</span>
                            </button>
                        </div>
                    )}
                </div>
             </div>
          </div>
      )}
    </div>
  );
};

export default VisitManager;