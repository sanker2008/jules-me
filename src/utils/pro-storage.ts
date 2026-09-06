import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface CustomPrompt {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
}

const CUSTOM_PROMPTS_KEY = 'JULES_PRO_CUSTOM_PROMPTS';
const GLOBAL_INSTRUCTIONS_KEY = 'JULES_PRO_GLOBAL_INSTRUCTIONS';

export async function getCustomPrompts(): Promise<CustomPrompt[]> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = localStorage.getItem(CUSTOM_PROMPTS_KEY);
    } else {
      raw = await SecureStore.getItemAsync(CUSTOM_PROMPTS_KEY);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(item => item && typeof item.prompt === 'string');
    }
    return [];
  } catch (error) {
    console.error('Failed to read custom prompts:', error);
    return [];
  }
}

export async function saveCustomPrompts(prompts: CustomPrompt[]): Promise<void> {
  try {
    const raw = JSON.stringify(prompts);
    if (Platform.OS === 'web') {
      localStorage.setItem(CUSTOM_PROMPTS_KEY, raw);
    } else {
      await SecureStore.setItemAsync(CUSTOM_PROMPTS_KEY, raw);
    }
  } catch (error) {
    console.error('Failed to save custom prompts:', error);
  }
}

export async function getGlobalInstructions(): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(GLOBAL_INSTRUCTIONS_KEY) || '';
    }
    return (await SecureStore.getItemAsync(GLOBAL_INSTRUCTIONS_KEY)) || '';
  } catch (error) {
    console.error('Failed to read global instructions:', error);
    return '';
  }
}

export async function saveGlobalInstructions(instructions: string): Promise<void> {
  try {
    const trimmed = instructions.trim();
    if (Platform.OS === 'web') {
      if (!trimmed) {
        localStorage.removeItem(GLOBAL_INSTRUCTIONS_KEY);
      } else {
        localStorage.setItem(GLOBAL_INSTRUCTIONS_KEY, trimmed);
      }
    } else {
      if (!trimmed) {
        await SecureStore.deleteItemAsync(GLOBAL_INSTRUCTIONS_KEY);
      } else {
        await SecureStore.setItemAsync(GLOBAL_INSTRUCTIONS_KEY, trimmed);
      }
    }
  } catch (error) {
    console.error('Failed to save global instructions:', error);
  }
}
