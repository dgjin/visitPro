
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getStorageData } from './storage';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  const data = getStorageData();
  const config = data.settings?.supabaseConfig;

  if (config?.url && config?.anonKey) {
    try {
      // In a real Taro environment, you might need a custom fetch adapter or configuration
      // depending on the Taro version. For modern Taro/Web, standard init usually works.
      supabaseInstance = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: false // For this data-centric demo, we disable auth persistence to simplify
        }
      });
      return supabaseInstance;
    } catch (e) {
      console.error("Failed to initialize Supabase:", e);
      return null;
    }
  }
  return null;
};

export const resetSupabase = () => {
    supabaseInstance = null;
};
