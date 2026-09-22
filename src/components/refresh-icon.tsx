import React, { useEffect, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';

export function RefreshIcon({ refreshing, color }: { refreshing: boolean; color: string }) {
  const [rotation] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReduceMotion(value);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!refreshing || reduceMotion) {
      rotation.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: 1,
      duration: 1000,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [refreshing, reduceMotion, rotation]);

  return (
    <Animated.View accessible={false} style={[styles.frame, {
      transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
    }]}>
      <Feather name="refresh-cw" size={20} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },

});
