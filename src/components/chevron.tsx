import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export interface ChevronProps {
  direction?: 'up' | 'down';
  color: string;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export function Chevron({
  direction = 'down',
  color,
  size = 7,
  strokeWidth = 2,
  style,
}: ChevronProps) {
  const isUp = direction === 'up';

  return (
    <View style={[styles.container, style]}>
      <View
        style={{
          width: size,
          height: size,
          borderRightWidth: strokeWidth,
          borderBottomWidth: strokeWidth,
          borderColor: color,
          transform: [
            { translateY: isUp ? 2 : -2 },
            { rotate: isUp ? '-135deg' : '45deg' },
          ],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
