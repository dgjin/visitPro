
export interface CustomFieldData {
  fieldId: string;
  value: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  teamName: string;
  role: 'Admin' | 'User';
  avatarUrl: string;
  customFields?: CustomFieldData[];
}

export interface CustomFieldDefinition {
  id: string;
  target: 'Client' | 'Visit' | 'User';
  label: string;
  type: 'text' | 'number' | 'date';
}

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
  industry: string;
  status: 'Active' | 'Lead' | 'Churned';
  customFields?: CustomFieldData[];
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'document' | 'other';
  url: string; // Base64 or local temp path
}

export type VisitCategory = 'Outbound' | 'Inbound';

export interface Visit {
  id: string;
  clientId: string;
  clientName: string;
  userId: string;
  date: string;
  category: VisitCategory;
  summary: string;
  rawNotes: string;
  participants?: string;
  outcome: 'Positive' | 'Neutral' | 'Negative' | 'Pending';
  actionItems: string[];
  sentimentScore: number;
  followUpEmailDraft?: string;
  customFields?: CustomFieldData[];
  attachments?: Attachment[];
}

export interface AIAnalysisResult {
  summary: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  painPoints: string[];
  actionItems: string[];
  followUpEmailDraft: string;
  transcription?: string;
}

export type AIModelProvider = 'Gemini' | 'DeepSeek';
export type StorageMode = 'LOCAL_FILE' | 'MYSQL' | 'SUPABASE';

export interface AIConfig {
  activeModel: AIModelProvider;
  deepSeekApiKey: string;
}

export interface MySQLConfig {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: string;
  senderName: string;
  senderEmail: string;
  authEnabled: boolean;
  authUsername?: string;
  authPassword?: string;
}

export interface AppSettings {
  geminiApiKey: string;
  userName: string;
  userRole: 'Admin' | 'User';
  storageMode: StorageMode;
  mysqlConfig: MySQLConfig;
  supabaseConfig: SupabaseConfig;
  emailConfig: EmailConfig;
  aiConfig: AIConfig;
  lastBackupDate?: string;
  lastSyncDate?: string; // New: track sync time
}

export interface AppData {
  clients: Client[];
  visits: Visit[];
  users: User[];
  fieldDefinitions: CustomFieldDefinition[];
  settings: AppSettings;
}
