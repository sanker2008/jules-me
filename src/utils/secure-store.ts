import * as SecureStore from 'expo-secure-store';

const API_KEY_KEY = 'JULES_API_KEY';

export async function saveApiKey(key: string) {
  try {
    await SecureStore.setItemAsync(API_KEY_KEY, key);
  } catch (e) {
    console.error('Failed to save API key to secure store', e);
  }
}

export async function getApiKey() {
  try {
    return await SecureStore.getItemAsync(API_KEY_KEY);
  } catch (e) {
    console.error('Failed to read API key from secure store', e);
    return null;
  }
}
