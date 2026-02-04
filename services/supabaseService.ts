import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageSettings, Client, Visit, User, CustomFieldDefinition, SupabaseConfig, Department, UserRole } from '../types';

let supabase: SupabaseClient | null = null;
let currentConfigSignature: string | null = null;

// Custom storage implementation to avoid polluting localStorage
const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const initSupabase = (config: StorageSettings['supabaseConfig']) => {
  const url = process.env.SUPABASE_URL || config.url;
  const key = process.env.SUPABASE_ANON_KEY || config.anonKey;

  if (url && key) {
    const newSignature = `${url}|${key}`;
    if (supabase && currentConfigSignature === newSignature) {
      return supabase;
    }

    try {
      console.log("[Supabase] Initializing main client...");
      supabase = createClient(url, key, {
        auth: { 
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: memoryStorage,
          storageKey: 'visitpro-main-client-v1'
        },
        global: {
          headers: { 'x-client-info': 'visitpro-main' }
        }
      });
      currentConfigSignature = newSignature;
      console.log("[Supabase] Main client initialized.");
    } catch (e) {
      console.error("[Supabase] Init error:", e);
      supabase = null;
      currentConfigSignature = null;
    }
  } else {
    supabase = null;
    currentConfigSignature = null;
  }
  return supabase;
};

export const getSupabaseClient = () => supabase;

export const testConnection = async (config: SupabaseConfig): Promise<{ success: boolean; message: string; missingTables?: boolean; details?: string }> => {
  const url = process.env.SUPABASE_URL || config.url;
  const key = process.env.SUPABASE_ANON_KEY || config.anonKey;

  if (!url || !key) {
    return { success: false, message: "URL 或 API Key 为空" };
  }
  if (!url.startsWith('http')) {
    return { success: false, message: "Project URL 必须以 https:// 开头" };
  }

  const timeout = new Promise<{ success: boolean; message: string; missingTables?: boolean; details?: string }>((_, reject) => {
      setTimeout(() => reject(new Error("连接超时 (5秒)")), 5000);
  });

  const check = async (): Promise<{ success: boolean; message: string; missingTables?: boolean; details?: string }> => {
      try {
        const uniqueKey = `visitpro-test-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const tempClient = createClient(url, key, {
            auth: { 
              persistSession: false,
              storage: memoryStorage,
              autoRefreshToken: false,
              detectSessionInUrl: false,
              storageKey: uniqueKey
            },
            global: {
              headers: { 'x-client-info': 'visitpro-test' }
            }
        });
        
        const start = Date.now();
        const { error, status, statusText } = await tempClient
          .from('clients')
          .select('id', { count: 'exact', head: true });
        const duration = Date.now() - start;

        if (error) {
          const debugInfo = `Code: ${error.code}\nStatus: ${status} ${statusText}\nMessage: ${error.message}`;
          if (error.code === '42P01' || error.message.includes('relation') || status === 404) {
              return { 
                success: false, 
                message: "连接成功，但未找到 'clients' 表。", 
                missingTables: true,
                details: debugInfo
              };
          }
          return { success: false, message: `API 请求错误: ${error.message}`, details: debugInfo };
        }

        return { success: true, message: `连接成功 (延迟: ${duration}ms)` };
      } catch (e: any) {
        return { success: false, message: `客户端初始化异常: ${e.message}`, details: e.stack };
      }
  };

  try {
      return await Promise.race([check(), timeout]);
  } catch (e: any) {
      return { success: false, message: e.message };
  }
};

// Mappers
const mapUserToDb = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  department: u.department,
  role: JSON.stringify(u.role),
  avatar_url: u.avatarUrl,
  custom_fields: u.customFields || []
});

const mapUserFromDb = (u: any): User => {
  let roles: UserRole[] = [];
  try {
    const parsed = JSON.parse(u.role);
    if (Array.isArray(parsed)) roles = parsed;
    else roles = [parsed];
  } catch (e) {
    if (u.role === 'Admin') roles = ['SystemAdmin'];
    else if (u.role === 'User') roles = ['Member'];
    else roles = [u.role as UserRole];
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    department: u.department,
    role: roles,
    avatarUrl: u.avatar_url,
    customFields: u.custom_fields || []
  };
};

const mapClientToDb = (c: Client) => ({
  id: c.id,
  name: c.name,
  company: c.company,
  email: c.email,
  phone: c.phone,
  address: c.address,
  avatar_url: c.avatarUrl,
  industry: c.industry,
  status: c.status,
  custom_fields: c.customFields || []
});

const mapClientFromDb = (c: any): Client => ({
  id: c.id,
  name: c.name,
  company: c.company,
  email: c.email,
  phone: c.phone,
  address: c.address,
  avatarUrl: c.avatar_url,
  industry: c.industry,
  status: c.status,
  customFields: c.custom_fields || []
});

const mapVisitToDb = (v: Visit) => ({
  id: v.id,
  client_id: v.clientId,
  client_name: v.clientName,
  user_id: v.userId,
  date: v.date,
  category: v.category,
  summary: v.summary,
  raw_notes: v.rawNotes,
  participants: v.participants,
  outcome: v.outcome,
  action_items: v.actionItems,
  sentiment_score: v.sentimentScore,
  follow_up_email_draft: v.followUpEmailDraft,
  custom_fields: v.customFields || [],
  attachments: v.attachments || []
});

const mapVisitFromDb = (v: any): Visit => ({
  id: v.id,
  clientId: v.client_id,
  clientName: v.client_name,
  userId: v.user_id,
  date: v.date,
  category: v.category,
  summary: v.summary,
  rawNotes: v.raw_notes,
  participants: v.participants,
  outcome: v.outcome,
  actionItems: v.action_items || [],
  sentimentScore: v.sentiment_score,
  followUpEmailDraft: v.follow_up_email_draft,
  customFields: v.custom_fields || [],
  attachments: v.attachments || []
});

const mapDepartmentToDb = (d: Department) => ({
  id: d.id,
  name: d.name,
  parent_id: d.parentId,
  manager_id: d.managerId,
  description: d.description
});

const mapDepartmentFromDb = (d: any): Department => ({
  id: d.id,
  name: d.name,
  parentId: d.parent_id,
  managerId: d.manager_id,
  description: d.description
});

const mapFieldToDb = (f: CustomFieldDefinition) => ({
  id: f.id,
  target: f.target,
  label: f.label,
  type: f.type
});

const mapFieldFromDb = (f: any): CustomFieldDefinition => ({
  id: f.id,
  target: f.target,
  label: f.label,
  type: f.type
});

// --- API Functions ---

export const fetchAllData = async (): Promise<{
  users: User[];
  clients: Client[];
  visits: Visit[];
  fieldDefinitions: CustomFieldDefinition[];
  departments: Department[];
}> => {
  if (!supabase) throw new Error("Supabase 未初始化");

  const [usersRes, clientsRes, visitsRes, fieldsRes, deptsRes] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('visits').select('*'),
    supabase.from('field_definitions').select('*'),
    supabase.from('departments').select('*')
  ]);

  if (usersRes.error) throw usersRes.error;
  if (clientsRes.error) throw clientsRes.error;
  if (visitsRes.error) throw visitsRes.error;
  if (fieldsRes.error) throw fieldsRes.error;
  if (deptsRes.error) throw deptsRes.error;

  return {
    users: usersRes.data.map(mapUserFromDb),
    clients: clientsRes.data.map(mapClientFromDb),
    visits: visitsRes.data.map(mapVisitFromDb),
    fieldDefinitions: fieldsRes.data.map(mapFieldFromDb),
    departments: deptsRes.data.map(mapDepartmentFromDb)
  };
};

export const addClient = async (client: Client) => {
    if (!supabase) return;
    const { error } = await supabase.from('clients').insert(mapClientToDb(client));
    if (error) throw error;
};

export const updateClient = async (client: Client) => {
    if (!supabase) return;
    const { error } = await supabase.from('clients').update(mapClientToDb(client)).eq('id', client.id);
    if (error) throw error;
};

export const deleteClient = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
};

export const addVisit = async (visit: Visit) => {
    if (!supabase) return;
    const { error } = await supabase.from('visits').insert(mapVisitToDb(visit));
    if (error) throw error;
};

export const updateVisit = async (visit: Visit) => {
    if (!supabase) return;
    const { error } = await supabase.from('visits').update(mapVisitToDb(visit)).eq('id', visit.id);
    if (error) throw error;
};

export const deleteVisit = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('visits').delete().eq('id', id);
    if (error) throw error;
};

export const addUser = async (user: User) => {
    if (!supabase) return;
    const { error } = await supabase.from('users').insert(mapUserToDb(user));
    if (error) throw error;
};

export const updateUser = async (user: User) => {
    if (!supabase) return;
    const { error } = await supabase.from('users').update(mapUserToDb(user)).eq('id', user.id);
    if (error) throw error;
};

export const deleteUser = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
};

export const addField = async (field: CustomFieldDefinition) => {
    if (!supabase) return;
    const { error } = await supabase.from('field_definitions').insert(mapFieldToDb(field));
    if (error) throw error;
};

export const deleteField = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('field_definitions').delete().eq('id', id);
    if (error) throw error;
};

export const addDepartment = async (dept: Department) => {
    if (!supabase) return;
    const { error } = await supabase.from('departments').insert(mapDepartmentToDb(dept));
    if (error) throw error;
};

export const updateDepartment = async (dept: Department) => {
    if (!supabase) return;
    const { error } = await supabase.from('departments').update(mapDepartmentToDb(dept)).eq('id', dept.id);
    if (error) throw error;
};

export const deleteDepartment = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) throw error;
};

export const uploadAllData = async (data: {
    users: User[];
    clients: Client[];
    visits: Visit[];
    fieldDefinitions: CustomFieldDefinition[];
    departments?: Department[];
}) => {
    if (!supabase) throw new Error("Supabase client not initialized");
    
    const { users, clients, visits, fieldDefinitions, departments } = data;
    
    if (departments && departments.length > 0) {
        // Naive batch upsert
        const dbDepts = departments.map(mapDepartmentToDb);
        // Simple sort to try to put parents before children
        dbDepts.sort((a, b) => {
             if (!a.parent_id) return -1;
             if (!b.parent_id) return 1;
             return 0;
        });
        const { error } = await supabase.from('departments').upsert(dbDepts);
        if (error) throw new Error(`Departments upload failed: ${error.message}`);
    }
    
    if (users.length > 0) {
        const { error } = await supabase.from('users').upsert(users.map(mapUserToDb));
        if (error) throw new Error(`Users upload failed: ${error.message}`);
    }
    
    if (clients.length > 0) {
         const { error } = await supabase.from('clients').upsert(clients.map(mapClientToDb));
         if (error) throw new Error(`Clients upload failed: ${error.message}`);
    }
    
    if (fieldDefinitions.length > 0) {
        const { error } = await supabase.from('field_definitions').upsert(fieldDefinitions.map(mapFieldToDb));
        if (error) throw new Error(`Fields upload failed: ${error.message}`);
    }
    
    if (visits.length > 0) {
        const { error } = await supabase.from('visits').upsert(visits.map(mapVisitToDb));
        if (error) throw new Error(`Visits upload failed: ${error.message}`);
    }
};
