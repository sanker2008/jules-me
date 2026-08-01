import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme as useRNColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type AppTheme = 'light' | 'dark';
export type ThemePreference = 'system' | AppTheme;

export const themeOptions: ThemePreference[] = ['system', 'light', 'dark'];

const THEME_KEY = 'JULESME_THEME';

function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  if (value === 'system' || value === 'light' || value === 'dark') return value;
  return 'system';
}

export async function getThemePreference(): Promise<ThemePreference> {
  try {
    if (Platform.OS === 'web') {
      return normalizeThemePreference(localStorage.getItem(THEME_KEY));
    }
    return normalizeThemePreference(await SecureStore.getItemAsync(THEME_KEY));
  } catch (error) {
    console.error('Failed to read theme preference:', error);
    return 'system';
  }
}

export async function saveThemePreference(preference: ThemePreference) {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(THEME_KEY, preference);
      return;
    }
    await SecureStore.setItemAsync(THEME_KEY, preference);
  } catch (error) {
    console.error('Failed to save theme preference:', error);
  }
}

interface ThemeContextValue {
  theme: AppTheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  preference: 'system',
  setPreference: async () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useRNColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let disposed = false;
    void getThemePreference().then(pref => {
      if (!disposed) setPreferenceState(pref);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const theme = useMemo<AppTheme>(() => {
    if (preference !== 'system') return preference;
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [preference, systemScheme]);

  const setPreference = async (newPreference: ThemePreference) => {
    setPreferenceState(newPreference);
    await saveThemePreference(newPreference);
  };

  const value = useMemo(
    () => ({ theme, preference, setPreference }),
    [theme, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
