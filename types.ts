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