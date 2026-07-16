/**
 * ZAI Desktop - Renderer Build Config
 *
 * Aliases 'react-native' -> 'react-native-web' so your existing screens/
 * components (View, Text, TouchableOpacity, StyleSheet, FlatList, etc.
 * from src/screens, src/components) render in Electron's Chromium
 * renderer with minimal to no changes. This is the standard approach
 * Expo's own web target uses under the hood - react-native-web
 * implements the same component API as DOM elements + CSS.
 *
 * Known gaps to expect when porting screens over (not blockers, just
 * things to watch for): react-native-webview has no RNW equivalent (the
 * BrowserAgentView/PiP components are replaced entirely - see
 * src/main-native/browserAgent.js - rather than ported), and any
 * Android-specific API (expo-intent-launcher, NativeModules.TermuxRunCommand)
 * needs its import swapped for the corresponding renderer/src/native-clients/*
 * file instead.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
    extensions: ['.web.js', '.web.jsx', '.js', '.jsx', '.json'],
  },
  define: {
    global: 'globalThis',
    __DEV__: process.env.NODE_ENV !== 'production',
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
