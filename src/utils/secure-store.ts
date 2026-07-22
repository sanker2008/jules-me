import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_KEY_KEY = 'JULES_API_KEY';

export async function saveApiKey(key: string) {
  try {
    if (Platform.OS === 'web') {
      if (!key) {
        localStorage.removeItem(API_KEY_KEY);
        return;
      }
      localStorage.setItem(API_KEY_KEY, key);
      return;
    }
    if (!key) {
      await SecureStore.deleteItemAsync(API_KEY_KEY);
      return;
    }
    await SecureStore.setItemAsync(API_KEY_KEY, key);
  } catch (e) {
    console.error('Failed to save API key:', e);
  }
}

export async function getApiKey() {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(API_KEY_KEY);
    }
    return await SecureStore.getItemAsync(API_KEY_KEY);
  } catch (e) {
    console.error('Failed to read API key:', e);
    return null;
  }
}
