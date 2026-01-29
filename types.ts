
export interface CustomFieldData {
  fieldId: string;
  value: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string; // Added field
  department: string; // Added field
  teamName: string; // Added field
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
  url: string; // Base64 data URL for this demo
}

export interface Visit {
  id: string;
  clientId: string;
  clientName: string; // Denormalized for easier display
  userId: string; // The ID of the user who performed the visit
  date: string; // ISO String
  summary: string;
  rawNotes: string;
  outcome: 'Positive' | 'Neutral' | 'Negative' | 'Pending';
  actionItems: string[];
  sentimentScore: number; // 0 to 100
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
  actionItems: string[];
  followUpEmailDraft: string;
  transcription?: string;
}

export type StorageMode = 'LOCAL_FILE' | 'MYSQL';
export type AIModelProvider = 'Gemini' | 'DeepSeek';

export interface MySQLConfig {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: string;
  senderName: string;
  senderEmail: string;
}

export interface AIConfig {
  activeModel: AIModelProvider;
  deepSeekApiKey: string;
}

export interface StorageSettings {
  mode: StorageMode;
  mysqlConfig: MySQLConfig;
  emailConfig: EmailConfig;
  aiConfig: AIConfig;
  lastBackupDate?: string;
}