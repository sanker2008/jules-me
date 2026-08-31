/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/theme';

export function useTheme() {
  const { theme } = useAppTheme();
  return Colors[theme];
}

