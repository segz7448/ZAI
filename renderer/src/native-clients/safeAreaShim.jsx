/**
 * ZAI Desktop - Safe Area Shim
 *
 * Replaces react-native-safe-area-context. There's no notch/home-
 * indicator/status-bar-overlap concept on a desktop window the way there
 * is on a phone - the entire reason SafeAreaView exists - so this is a
 * real, correct implementation for this platform (not a placeholder):
 * insets are always zero, SafeAreaProvider is a plain passthrough, and
 * SafeAreaView is a plain View. Pulling in the real
 * react-native-web-facing react-native-safe-area-context package would
 * have dragged in a `react-native` peer dependency requiring React 19,
 * conflicting with the React 18 / react-native-web stack this app
 * otherwise uses - this avoids that conflict entirely while being
 * behaviorally correct for a windowed desktop app.
 */
import React from 'react';
import { View } from 'react-native';

export function SafeAreaProvider({ children }) {
  return <>{children}</>;
}

export function SafeAreaView({ style, children, ...rest }) {
  return (
    <View style={style} {...rest}>
      {children}
    </View>
  );
}

export function useSafeAreaInsets() {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}
