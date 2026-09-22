import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../theme';
import { useTheme } from '../hooks/use-theme';

export interface GradientButtonProps {
  variant?: 'primary' | 'accent';
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  title?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  gradientColors?: [string, string, ...string[]];
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
}

export function GradientButton({
  variant = 'primary',
  onPress,
  disabled = false,
  loading = false,
  loadingText,
  title,
  children,
  icon,
  style,
  contentStyle,
  textStyle,
  gradientColors,
  accessibilityLabel,
  accessibilityRole = 'button',
}: GradientButtonProps) {
  const { theme } = useAppTheme();
  const colorsTheme = useTheme();
  const foreground = variant === 'accent' ? '#24391B' : '#FFFFFF';

  const isDark = theme === 'dark';
  const defaultColors: [string, string] = isDark
    ? ['#9987FA', '#6246E5']
    : ['#765BF8', '#4B30D1'];

  const colors = gradientColors ?? (variant === 'accent' ? [colorsTheme.accent, colorsTheme.accent] as [string, string] : defaultColors);

  return (
    <TouchableOpacity
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || title}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.84}
      style={[
        styles.touchable,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, contentStyle]}
      >
        {loading ? (
          <View style={styles.contentRow}>
            <ActivityIndicator size="small" color={foreground} />
            {loadingText ? <Text style={[styles.text, { color: foreground }, textStyle]}>{loadingText}</Text> : null}
          </View>
        ) : children ? (
          children
        ) : (
          <View style={styles.contentRow}>
            {icon}
            {title ? <Text style={[styles.text, { color: foreground }, textStyle]}>{title}</Text> : null}
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  gradient: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
});
