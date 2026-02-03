
import Taro from '@tarojs/taro';
import { Client, Visit, User, AppData, CustomFieldDefinition, AppSettings } from '../types';
import { getSupabase, resetSupabase } from './supabaseClient';

const STORAGE_KEY = 'visitpro_data_v4';

const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  userName: 'John Doe',
  userRole: 'Admin',
  storageMode: 'SUPABASE',
  mysqlConfig: { host: '', port: '3306', username: '', password: '', database: '' },
  supabaseConfig: { url: '', anonKey: '' },
  emailConfig: { smtpHost: 'smtp.example.com', smtpPort: '587', senderName: 'VisitPro Agent', senderEmail: 'sales@visitpro.com', authEnabled: false },
  aiConfig: {
    activeModel: 'Gemini',
    deepSeekApiKey: ''
  }
};

const MOCK_FIELDS: CustomFieldDefinition[] = [
  { id: 'f1', target: 'Visit', label: '时长(分钟)', type: 'number' },
  { id: 'f2', target: 'Client', label: '职位', type: 'text' }
];

const MOCK_CLIENTS: Client[] = [
  { id: '1', name: '艾丽斯·弗里曼', company: '泰克诺瓦 (TechNova)', email: 'alice@technova.com', phone: '555-0123', address: '科技大道 123 号', avatarUrl: '', industry: 'SaaS', status: 'Active' },
];

const MOCK_VISITS: Visit[] = [
  { id: '101', userId: 'u1', clientId: '1', clientName: '艾丽斯·弗里曼', date: new Date(Date.now() - 86400000 * 2).toISOString(), category: 'Outbound', summary: '讨论了第三季度的路线图。', rawNotes: '讨论Q3路线图。', outcome: 'Positive', actionItems: ['发送 API 文档'], sentimentScore: 85, attachments: [] },
];

const MOCK_USERS: User[] = [
  { id: 'u1', name: 'John Doe', email: 'john@example.com', phone: '13800000000', department: '销售部', teamName: '一组', role: 'Admin', avatarUrl: '' }
];

// --- Local Storage Access (Synchronous) ---

export const getStorageData = (): AppData => {
  const data = Taro.getStorageSync(STORAGE_KEY);
  if (!data) {
    const initialData: AppData = {
      clients: MOCK_CLIENTS,
      visits: MOCK_VISITS,
      users: MOCK_USERS,
      fieldDefinitions: MOCK_FIELDS,
      settings: DEFAULT_SETTINGS
    };
    Taro.setStorageSync(STORAGE_KEY, initialData);
    return initialData;
  }
  
  // Migration logic
  if (!data.settings) data.settings = DEFAULT_SETTINGS;
  if (!data.settings.supabaseConfig) data.settings.supabaseConfig = DEFAULT_SETTINGS.supabaseConfig;
  if (!data.settings.aiConfig) data.settings.aiConfig = DEFAULT_SETTINGS.aiConfig;
  
  return data;
};

export const saveStorageData = (data: Partial<AppData>) => {
  const current = getStorageData();
  const newData = { ...current, ...data };
  Taro.setStorageSync(STORAGE_KEY, newData);
};

// --- Sync Logic ---

/**
 * Pulls all data from Supabase and updates local storage.
 * This effectively makes the local storage a cache.
 */
export const syncFromSupabase = async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
        Taro.showLoading({ title: '同步数据中...' });

        const [usersRes, clientsRes, visitsRes, fieldsRes] = await Promise.all([
            supabase.from('users').select('*'),
            supabase.from('clients').select('*'),
            supabase.from('visits').select('*'),
            supabase.from('field_definitions').select('*')
        ]);

        if (usersRes.error) throw usersRes.error;
        if (clientsRes.error) throw clientsRes.error;
        if (visitsRes.error) throw visitsRes.error;
        if (fieldsRes.error) throw fieldsRes.error;

        // Transform Snake_case (DB) to CamelCase (App)
        // Note: For custom_fields, we store them as JSONB in DB, which matches TS structure
        
        const mapUser = (u: any): User => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            department: u.department,
            teamName: u.team_name,
            role: u.role as any,
            avatarUrl: u.avatar_url,
            customFields: u.custom_fields
        });

        const mapClient = (c: any): Client => ({
            id: c.id,
            name: c.name,
            company: c.company,
            email: c.email,
            phone: c.phone,
            address: c.address,
            industry: c.industry,
            status: c.status as any,
            avatarUrl: c.avatar_url,
            customFields: c.custom_fields
        });

        const mapVisit = (v: any): Visit => ({
            id: v.id,
            clientId: v.client_id,
            clientName: v.client_name,
            userId: v.user_id,
            date: v.date,
            category: v.category as any,
            summary: v.summary,
            rawNotes: v.raw_notes,
            participants: v.participants,
            outcome: v.outcome as any,
            actionItems: v.action_items,
            sentimentScore: v.sentiment_score,
            followUpEmailDraft: v.follow_up_email_draft,
            customFields: v.custom_fields,
            attachments: v.attachments
        });

        const mapField = (f: any): CustomFieldDefinition => ({
            id: f.id,
            target: f.target as any,
            label: f.label,
            type: f.type as any
        });

        saveStorageData({
            users: usersRes.data.map(mapUser),
            clients: clientsRes.data.map(mapClient),
            visits: visitsRes.data.map(mapVisit),
            fieldDefinitions: fieldsRes.data.map(mapField),
            settings: { 
                ...getStorageData().settings, 
                lastSyncDate: new Date().toISOString() 
            }
        });

        Taro.hideLoading();
        Taro.showToast({ title: '同步完成', icon: 'success' });

    } catch (e: any) {
        Taro.hideLoading();
        console.error("Sync Error:", e);
        Taro.showToast({ title: '同步失败: ' + e.message, icon: 'none' });
    }
};


// --- CRUD Operations (Write-Through) ---

export const addVisit = async (visit: Visit) => {
  // 1. Optimistic Update (Local)
  const data = getStorageData();
  saveStorageData({ visits: [visit, ...data.visits] });

  // 2. Async Write (Remote)
  if (data.settings.storageMode === 'SUPABASE') {
      const supabase = getSupabase();
      if (supabase) {
          await supabase.from('visits').insert({
              id: visit.id,
              client_id: visit.clientId,
              client_name: visit.clientName,
              user_id: visit.userId,
              date: visit.date,
              category: visit.category,
              summary: visit.summary,
              raw_notes: visit.rawNotes,
              participants: visit.participants,
              outcome: visit.outcome,
              action_items: visit.actionItems,
              sentiment_score: visit.sentimentScore,
              follow_up_email_draft: visit.followUpEmailDraft,
              custom_fields: visit.customFields,
              attachments: visit.attachments
          });
      }
  }
};

export const updateVisit = async (visit: Visit) => {
  const data = getStorageData();
  saveStorageData({ visits: data.visits.map(v => v.id === visit.id ? visit : v) });

  if (data.settings.storageMode === 'SUPABASE') {
      const supabase = getSupabase();
      if (supabase) {
          await supabase.from('visits').update({
              client_id: visit.clientId,
              client_name: visit.clientName,
              user_id: visit.userId,
              date: visit.date,
              category: visit.category,
              summary: visit.summary,
              raw_notes: visit.rawNotes,
              participants: visit.participants,
              outcome: visit.outcome,
              action_items: visit.actionItems,
              sentiment_score: visit.sentimentScore,
              follow_up_email_draft: visit.followUpEmailDraft,
              custom_fields: visit.customFields,
              attachments: visit.attachments
          }).eq('id', visit.id);
      }
  }
};

export const deleteVisit = async (id: string) => {
    const data = getStorageData();
    saveStorageData({ visits: data.visits.filter(v => v.id !== id) });

    if (data.settings.storageMode === 'SUPABASE') {
      const supabase = getSupabase();
      if (supabase) await supabase.from('visits').delete().eq('id', id);
    }
};

export const addClient = async (client: Client) => {
  const data = getStorageData();
  saveStorageData({ clients: [...data.clients, client] });

  if (data.settings.storageMode === 'SUPABASE') {
      const supabase = getSupabase();
      if (supabase) {
          await supabase.from('clients').insert({
              id: client.id,
              name: client.name,
              company: client.company,
              email: client.email,
              phone: client.phone,
              address: client.address,
              avatar_url: client.avatarUrl,
              industry: client.industry,
              status: client.status,
              custom_fields: client.customFields
          });
      }
  }
};

export const updateClient = async (client: Client) => {
    const data = getStorageData();
    saveStorageData({ clients: data.clients.map(c => c.id === client.id ? client : c) });

    if (data.settings.storageMode === 'SUPABASE') {
        const supabase = getSupabase();
        if (supabase) {
            await supabase.from('clients').update({
                name: client.name,
                company: client.company,
                email: client.email,
                phone: client.phone,
                address: client.address,
                avatar_url: client.avatarUrl,
                industry: client.industry,
                status: client.status,
                custom_fields: client.customFields
            }).eq('id', client.id);
        }
    }
};

export const deleteClient = async (id: string) => {
    const data = getStorageData();
    saveStorageData({ clients: data.clients.filter(c => c.id !== id) });

    if (data.settings.storageMode === 'SUPABASE') {
        const supabase = getSupabase();
        if (supabase) await supabase.from('clients').delete().eq('id', id);
    }
};

export const addUser = async (user: User) => {
    const data = getStorageData();
    saveStorageData({ users: [...data.users, user] });

    if (data.settings.storageMode === 'SUPABASE') {
        const supabase = getSupabase();
        if (supabase) {
            await supabase.from('users').insert({
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                department: user.department,
                team_name: user.teamName,
                role: user.role,
                avatar_url: user.avatarUrl,
                custom_fields: user.customFields
            });
        }
    }
};

export const updateUser = async (user: User) => {
    const data = getStorageData();
    saveStorageData({ users: data.users.map(u => u.id === user.id ? user : u) });
};

export const deleteUser = async (id: string) => {
    const data = getStorageData();
    saveStorageData({ users: data.users.filter(u => u.id !== id) });
    
    if (data.settings.storageMode === 'SUPABASE') {
        const supabase = getSupabase();
        if (supabase) await supabase.from('users').delete().eq('id', id);
    }
};

export const addField = async (field: CustomFieldDefinition) => {
    const data = getStorageData();
    saveStorageData({ fieldDefinitions: [...data.fieldDefinitions, field] });

    if (data.settings.storageMode === 'SUPABASE') {
        const supabase = getSupabase();
        if (supabase) {
            await supabase.from('field_definitions').insert({
                id: field.id,
                target: field.target,
                label: field.label,
                type: field.type
            });
        }
    }
};

export const deleteField = async (id: string) => {
    const data = getStorageData();
    saveStorageData({ fieldDefinitions: data.fieldDefinitions.filter(f => f.id !== id) });

    if (data.settings.storageMode === 'SUPABASE') {
        const supabase = getSupabase();
        if (supabase) await supabase.from('field_definitions').delete().eq('id', id);
    }
};

export const updateSettings = (settings: Partial<AppSettings>) => {
    const data = getStorageData();
    const newSettings = { ...data.settings, ...settings };
    
    // Deep merge configs
    if (settings.aiConfig) newSettings.aiConfig = { ...data.settings.aiConfig, ...settings.aiConfig };
    if (settings.emailConfig) newSettings.emailConfig = { ...data.settings.emailConfig, ...settings.emailConfig };
    if (settings.mysqlConfig) newSettings.mysqlConfig = { ...data.settings.mysqlConfig, ...settings.mysqlConfig };
    if (settings.supabaseConfig) {
        newSettings.supabaseConfig = { ...data.settings.supabaseConfig, ...settings.supabaseConfig };
        // If config changes, reset the client instance
        resetSupabase();
    }
    
    saveStorageData({ settings: newSettings });
};
