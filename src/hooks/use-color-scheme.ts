import { useAppTheme } from '@/theme';

export function useColorScheme() {
  const { theme } = useAppTheme();
  return theme;
}

