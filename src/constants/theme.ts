/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#25213D',
    textSecondary: '#77718B',
    textMuted: '#98A2B3',
    background: '#F7F7FC',
    backgroundElement: '#EFEFF5',
    backgroundSelected: '#E0E1E6',
    card: '#FFFFFF',
    cardBorder: 'transparent',
    topBar: '#FFFFFF',
    topBarBorder: 'transparent',
    brand: '#6656D7',
    brandSubtle: '#F4F2FF',
    chipBg: '#EDEAF9',
    chipBorder: 'transparent',
    composerBg: '#EDEAF9',
    composerBorder: 'transparent',
    sheetBg: '#FFFFFF',
    sheetItemBg: '#F5F4FA',
    sheetBorder: 'transparent',
    statusAttentionBg: '#FFF3D8',
    statusAttentionText: '#8A5B00',
    statusActiveBg: '#E7E5FF',
    statusActiveText: '#5547B4',
    statusCompleteBg: '#E7F8EE',
    statusCompleteText: '#197044',
    statusFailedBg: '#FFE8E7',
    statusFailedText: '#B42318',
    statusMutedBg: '#F0EFF4',
    statusMutedText: '#666176',
  },
  dark: {
    text: '#ECEBF5',
    textSecondary: '#A09ABC',
    textMuted: '#6B6580',
    background: '#0F0E17',
    backgroundElement: '#1A1826',
    backgroundSelected: '#2C293F',
    card: '#181624',
    cardBorder: 'transparent',
    topBar: '#161422',
    topBarBorder: 'transparent',
    brand: '#8374F5',
    brandSubtle: '#231E3D',
    chipBg: '#211C38',
    chipBorder: 'transparent',
    composerBg: '#1C1929',
    composerBorder: 'transparent',
    sheetBg: '#181624',
    sheetItemBg: '#201C30',
    sheetBorder: 'transparent',
    statusAttentionBg: '#3D2F10',
    statusAttentionText: '#FFD37A',
    statusActiveBg: '#2A2458',
    statusActiveText: '#B2A5FF',
    statusCompleteBg: '#123D26',
    statusCompleteText: '#6EE7A3',
    statusFailedBg: '#421616',
    statusFailedText: '#FFA8A8',
    statusMutedBg: '#242133',
    statusMutedText: '#9B96AD',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;
