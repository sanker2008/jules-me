import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

interface BreathingLogoProps {
  size?: number;
  borderRadius?: number;
  source?: ImageSourcePropType;
  glowColor?: string;
  isPro?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function BreathingLogo({
  size = 72,
  borderRadius = 14,
  source = require('@/assets/images/jules-logo.png'),
  glowColor,
  isPro = false,
  style,
}: BreathingLogoProps) {
  const [anim] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (isMounted) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      setReduceMotion(enabled);
    });

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [anim, reduceMotion]);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const glowScale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.22],
  });

  const glowOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.75],
  });

  const auraSize = Math.round(size * 1.3);
  const activeGlowColor = isPro ? 'rgba(245, 158, 11, 0.32)' : glowColor;

  return (
    <View style={[styles.container, { width: auraSize, height: auraSize }, style]}>
      {activeGlowColor ? (
        <Animated.View
          style={[
            styles.glow,
            {
              width: auraSize,
              height: auraSize,
              borderRadius: auraSize / 2,
              backgroundColor: activeGlowColor,
              opacity: reduceMotion ? 0.4 : glowOpacity,
              transform: [{ scale: reduceMotion ? 1 : glowScale }],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.imageWrapper,
          {
            transform: [{ scale: reduceMotion ? 1 : scale }],
          },
        ]}
      >
        <Image
          source={source}
          style={{
            width: size,
            height: size,
            borderRadius,
          }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  imageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
