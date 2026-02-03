import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageSettings, Client, Visit, User, CustomFieldDefinition, SupabaseConfig } from '../types';

let supabase: SupabaseClient | null = null;
let currentConfigSignature: string | null = null;

// Custom storage implementation to avoid polluting localStorage and triggering
// "Multiple GoTrueClient instances" warnings in the console.
const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const initSupabase = (config: StorageSettings['supabaseConfig']) => {
  // Try to use process.env if available, otherwise fall back to config object
  const url = process.env.SUPABASE_URL || config.url;
  const key = process.env.SUPABASE_ANON_KEY || config.anonKey;

  if (url && key) {
    const newSignature = `${url}|${key}`;
    
    // Return existing instance if config hasn't changed to prevent duplicate clients
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
          storage: memoryStorage, // Use memory storage
          storageKey: 'visitpro-main-client-v1' // Distinct, fixed key for the main singleton
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

// Test connection and check if tables exist
export const testConnection = async (config: SupabaseConfig): Promise<{ success: boolean; message: string; missingTables?: boolean; details?: string }> => {
  const url = process.env.SUPABASE_URL || config.url;
  const key = process.env.SUPABASE_ANON_KEY || config.anonKey;

  if (!url || !key) {
    return { success: false, message: "URL 或 API Key 为空 (请检查环境变量 SUPABASE_URL/SUPABASE_ANON_KEY 或手动配置)" };
  }
  if (!url.startsWith('http')) {
    return { success: false, message: "Project URL 必须以 https:// 开头" };
  }

  // Create a timeout promise
  const timeout = new Promise<{ success: boolean; message: string; missingTables?: boolean; details?: string }>((_, reject) => {
      setTimeout(() => reject(new Error("连接超时 (5秒)。请检查网络通畅性或 URL 是否正确。")), 5000);
  });

  // The actual connection test
  const check = async (): Promise<{ success: boolean; message: string; missingTables?: boolean; details?: string }> => {
      try {
        // Create a temporary client for testing
        // CRITICAL: Use a highly unique storageKey to avoid collision with main client
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
        
        // Use HEAD request to check table existence (lighter than SELECT)
        // Check 'clients' table
        const start = Date.now();
        const { error, status, statusText } = await tempClient
          .from('clients')
          .select('id', { count: 'exact', head: true });
        const duration = Date.now() - start;

        if (error) {
          console.error("Supabase Test Error:", error);
          
          // Construct detailed debug info
          const debugInfo = `Code: ${error.code}\nStatus: ${status} ${statusText}\nMessage: ${error.message}`;

          // Postgres error code 42P01 means "relation does not exist"
          if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist') || status === 404) {
              return { 
                success: false, 
                message: "连接成功，但未找到 'clients' 表。请确保已运行建表脚本。", 
                missingTables: true,
                details: debugInfo
              };
          }
          // Auth errors
          if (error.code === '28P01' || error.message.includes('password') || error.code === 'PGRST301' || status === 401 || status === 403) {
               return { 
                 success: false, 
                 message: "鉴权失败：API Key 无效或 RLS 策略阻止了访问。",
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

  // Race between timeout and check
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
  team_name: u.teamName,
  role: u.role,
  avatar_url: u.avatarUrl,
  custom_fields: u.customFields || []
});

const mapUserFromDb = (u: any): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  department: u.department,
  teamName: u.team_name,
  role: u.role,
  avatarUrl: u.avatar_url,
  customFields: u.custom_fields || []
});

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
  action_items: v.actionItems || [],
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

// Operations
export const fetchAllData = async () => {
  if (!supabase) throw new Error("Supabase 未初始化。请在系统设置中保存配置以重新连接。");

  const [usersRes, clientsRes, visitsRes, fieldsRes] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('visits').select('*'),
    supabase.from('field_definitions').select('*')
  ]);

  if (usersRes.error) throw new Error(`Users fetch error: ${usersRes.error.message}`);
  if (clientsRes.error) throw new Error(`Clients fetch error: ${clientsRes.error.message}`);
  if (visitsRes.error) throw new Error(`Visits fetch error: ${visitsRes.error.message}`);
  if (fieldsRes.error) throw new Error(`Fields fetch error: ${fieldsRes.error.message}`);

  return {
    users: usersRes.data.map(mapUserFromDb),
    clients: clientsRes.data.map(mapClientFromDb),
    visits: visitsRes.data.map(mapVisitFromDb),
    fieldDefinitions: fieldsRes.data.map(mapFieldFromDb)
  };
};

/**
 * Uploads all local data to Supabase (Initialization/Migration)
 * This uses UPSERT to avoid duplicates based on ID.
 */
export const uploadAllData = async (data: { 
  users: User[], 
  clients: Client[], 
  visits: Visit[], 
  fieldDefinitions: CustomFieldDefinition[] 
}) => {
  if (!supabase) throw new Error("Supabase 未初始化。请先配置并保存连接信息。");

  console.log(`[Supabase] Starting Upload. Users: ${data.users.length}, Clients: ${data.clients.length}, Visits: ${data.visits.length}`);

  // 1. Upload Field Definitions
  if (data.fieldDefinitions.length > 0) {
      const { error } = await supabase.from('field_definitions').upsert(
          data.fieldDefinitions.map(mapFieldToDb), 
          { onConflict: 'id' }
      );
      if (error) throw new Error(`Fields upload error: ${error.message}`);
  }

  // 2. Upload Users
  if (data.users.length > 0) {
      const { error } = await supabase.from('users').upsert(
          data.users.map(mapUserToDb),
          { onConflict: 'id' }
      );
      if (error) throw new Error(`Users upload error: ${error.message}`);
  }

  // 3. Upload Clients
  if (data.clients.length > 0) {
      const { error } = await supabase.from('clients').upsert(
          data.clients.map(mapClientToDb),
          { onConflict: 'id' }
      );
      if (error) throw new Error(`Clients upload error: ${error.message}`);
  }

  // 4. Upload Visits
  if (data.visits.length > 0) {
      const { error } = await supabase.from('visits').upsert(
          data.visits.map(mapVisitToDb),
          { onConflict: 'id' }
      );
      if (error) throw new Error(`Visits upload error: ${error.message}`);
  }
  
  console.log("[Supabase] Upload completed successfully.");
};

// CRUD Operations

export const addClient = async (client: Client) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('clients').insert(mapClientToDb(client));
  if (error) throw new Error(`保存客户失败: ${error.message} (Code: ${error.code})`);
};

export const updateClient = async (client: Client) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  // Use UPSERT to ensure data is saved even if it exists locally but not on backend yet
  const { error } = await supabase.from('clients').upsert(mapClientToDb(client));
  if (error) throw new Error(`更新客户失败: ${error.message}`);
};

export const deleteClient = async (id: string) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw new Error(`删除客户失败: ${error.message}`);
};

export const addVisit = async (visit: Visit) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('visits').insert(mapVisitToDb(visit));
  if (error) throw new Error(`保存拜访记录失败: ${error.message}`);
};

export const updateVisit = async (visit: Visit) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  // Use UPSERT for robustness
  const { error } = await supabase.from('visits').upsert(mapVisitToDb(visit));
  if (error) throw new Error(`更新拜访记录失败: ${error.message}`);
};

export const deleteVisit = async (id: string) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('visits').delete().eq('id', id);
  if (error) throw new Error(`删除拜访记录失败: ${error.message}`);
};

export const addUser = async (user: User) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('users').insert(mapUserToDb(user));
  if (error) throw new Error(`保存用户失败: ${error.message}`);
};

export const updateUser = async (user: User) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  // Use UPSERT for robustness
  const { error } = await supabase.from('users').upsert(mapUserToDb(user));
  if (error) throw new Error(`更新用户失败: ${error.message}`);
};

export const deleteUser = async (id: string) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw new Error(`删除用户失败: ${error.message}`);
};

export const addField = async (field: CustomFieldDefinition) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('field_definitions').insert(mapFieldToDb(field));
  if (error) throw new Error(`保存字段失败: ${error.message}`);
};

export const deleteField = async (id: string) => {
  if (!supabase) throw new Error("数据库连接未初始化。请检查 Supabase 配置。");
  const { error } = await supabase.from('field_definitions').delete().eq('id', id);
  if (error) throw new Error(`删除字段失败: ${error.message}`);
};