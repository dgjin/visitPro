
export interface CustomFieldData {
  fieldId: string;
  value: string;
}

export type UserRole = 'SystemAdmin' | 'TeamLeader' | 'Member';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: UserRole[]; // Changed from single string to array
  avatarUrl: string;
  customFields?: CustomFieldData[];
}

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  managerId?: string;
  description?: string;
  children?: Department[]; // For UI tree structure
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
  url: string;
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

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  CLIENTS = 'CLIENTS',
  VISITS = 'VISITS',
  ADMIN = 'ADMIN',
}

export interface AIAnalysisResult {
  summary: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  painPoints: string[];
  actionItems: string[];
  followUpEmailDraft: string;
  transcription?: string;
}

export type StorageMode = 'LOCAL_FILE' | 'MYSQL' | 'SUPABASE';
export type AIModelProvider = 'Gemini' | 'DeepSeek';
export type EmailTone = 'Formal' | 'Friendly' | 'Concise';

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

export interface AIConfig {
  activeModel: AIModelProvider;
  deepSeekApiKey: string;
}

export interface IFlyTekConfig {
  appId: string;
  apiSecret: string;
  apiKey: string;
}

export interface StorageSettings {
  mode: StorageMode;
  mysqlConfig: MySQLConfig;
  supabaseConfig: SupabaseConfig;
  emailConfig: EmailConfig;
  aiConfig: AIConfig;
  iflytekConfig: IFlyTekConfig;
  lastBackupDate?: string;
  lastSyncDate?: string;
}
