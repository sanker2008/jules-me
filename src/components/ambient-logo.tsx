import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Decorative logo floating behind the home screen, including its frosted header. */
export function AmbientLogo({ theme }: { theme: 'light' | 'dark' }) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 1.05, height * 0.62, 560);
  const [progress] = useState(() => new Animated.Value(0));
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setIsFocused(true);
    return () => setIsFocused(false);
  }, []));
  const [reduceMotion, setReduceMotion] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !preferenceChanged) setReduceMotion(value);
    }).catch(() => {});
    const visibility = AppState.addEventListener('change', setAppState);
    return () => {
      active = false;
      motion.remove();
      visibility.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || !isFocused || appState !== 'active') return;
    // A full breath takes 16 seconds; sinusoidal easing softly reverses direction.
    const timing = (toValue: number) => Animated.timing(progress, {
      toValue,
      duration: 8000,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
      isInteraction: false,
    });
    const loop = Animated.loop(Animated.sequence([timing(1), timing(0)]));
    loop.start();
    return () => loop.stop();
  }, [appState, isFocused, progress, reduceMotion]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.layer}
    >
      <Animated.Image
        source={require('@/assets/images/jules-logo.png')}
        accessible={false}
        resizeMode="contain"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          top: height * 0.44 - size / 2,
          opacity: reduceMotion
            ? (theme === 'dark' ? 0.18 : 0.12)
            : progress.interpolate({
              inputRange: [0, 1],
              outputRange: theme === 'dark' ? [0.12, 0.24] : [0.08, 0.18],
            }),
          transform: reduceMotion ? [] : [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [7, -7] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] }) },
          ],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', overflow: 'hidden' },
});
