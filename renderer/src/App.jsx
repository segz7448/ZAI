/**
 * ZAI Desktop - App Shell
 *
 * Ported from the Android build's App.js. Screen-switching structure
 * (chat/settings/browserAgent), boot sequence (initDatabase ->
 * loadThemePreference -> loadPreferences -> loadConversationList ->
 * background syncNow), and the AgentSession wiring are all preserved.
 *
 * ONE DELIBERATE, HONEST DIFFERENCE FROM THE ANDROID VERSION:
 * BrowserAgentPiP (a small floating live-preview of the WebView, always
 * docked in a corner of the phone UI) has NO equivalent here and is not
 * rendered. The reason isn't a shortcut - it's architectural: the actual
 * browser is a real, separate Chromium window driven by Playwright (see
 * src/main-native/browserAgent.js), not a view embeddable inside
 * Electron's own renderer the way a WebView could be embedded inside a
 * phone screen. That means BrowserAgentScreen here works as a genuine
 * remote-control panel (address bar, tabs, back/forward all actually
 * drive the real window) - the person can Alt-Tab to see the live page
 * directly, or open the "Browser" screen for the same navigation chrome
 * the phone build had, just without a docked thumbnail preview. Wiring an
 * actual live thumbnail (e.g. periodic screenshot polling into an <img>)
 * is a reasonable follow-up, not attempted here to avoid guessing at a
 * design that wasn't asked for.
 */
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from './native-clients/safeAreaShim';
import ErrorBoundary from './components/ErrorBoundary';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';
import BrowserAgentScreen from './screens/BrowserAgentScreen';
import { AgentSession } from './services/browserAgent/agentLoop';
import { browserViewRef } from './native-clients/browserAgentClient';
import SidebarDrawer from './components/SidebarDrawer';
import { Alert, AlertHost } from './native-clients/alertShim';
import { initDatabase } from './db/database';
import { syncNow } from './sync/syncEngine';
import { useChatStore } from './store/chatStore';
import { usePreferencesStore } from './store/preferencesStore';
import { useThemeStore } from './store/themeStore';
import { useTheme, useResolvedThemeMode } from './theme/useTheme';
import { ready as fsReady } from './native-clients/fileSystemShim';

function AppShell() {
  const theme = useTheme();
  const resolvedMode = useResolvedThemeMode();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [screen, setScreen] = useState('chat'); // 'chat' | 'settings' | 'browserAgent'
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  const {
    conversationId, conversations,
    loadConversationList, loadConversation, startNewConversation, deleteConversation,
    setAgentSession,
  } = useChatStore();
  const { loadThemePreference } = useThemeStore();
  const { preferences, loadPreferences } = usePreferencesStore();

  const agentSessionRef = useRef(null);

  useEffect(() => {
    (async () => {
      await fsReady(); // resolves documentDirectory/cacheDirectory real paths - see fileSystemShim.js
      const result = await initDatabase();
      if (result.success) {
        setDbReady(true);
      } else {
        console.error('[App] DB init failed:', result.error);
        setDbError(result.error);
        setDbReady(true);
      }
      await loadThemePreference();
      await loadPreferences();
      await loadConversationList();
      syncNow().catch((err) => console.error('[App] startup sync failed:', err));
    })();
  }, []);

  // Creates the one AgentSession for the app's lifetime once browser
  // access is enabled. No PiP-mount gating needed here (unlike the
  // Android version) since browserViewRef isn't tied to a mounted
  // component ref - it's always available the moment this module loads.
  useEffect(() => {
    if (!preferences?.browser_access_enabled || agentSessionRef.current) {
      return;
    }
    agentSessionRef.current = new AgentSession(browserViewRef);
    setAgentSession(agentSessionRef.current);
    const unsubscribe = agentSessionRef.current.onRunningChange(setIsAgentRunning);
    return unsubscribe;
  }, [preferences?.browser_access_enabled, dbReady]);

  const handleNewChat = async () => {
    setSidebarVisible(false);
    setScreen('chat');
    await startNewConversation();
  };

  const handleSelectConversation = async (id) => {
    setSidebarVisible(false);
    setScreen('chat');
    await loadConversation(id);
  };

  const handleOpenSettings = () => {
    setSidebarVisible(false);
    setScreen('settings');
  };

  const handleOpenBrowserAgent = (url) => {
    if (url) {
      browserViewRef.current?.navigate(url);
    }
    setScreen('browserAgent');
  };

  const handleCloseBrowserAgent = () => {
    setScreen('chat');
  };

  const handleDeleteConversation = (conversation) => {
    Alert.alert(
      'Delete conversation?',
      `"${conversation.title || 'New Conversation'}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(conversation.id) },
      ]
    );
  };

  if (!dbReady) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.textPrimary} />
        <Text style={[styles.loadingText, { color: theme.textTertiary }]}>Starting ZAI…</Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.background} />
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        {dbError && (
          <View style={[styles.dbErrorBanner, { backgroundColor: '#FEF3C7' }]}>
            <Text style={styles.dbErrorText}>
              Local storage had trouble starting. Some features may not save properly.
            </Text>
          </View>
        )}
        <View style={styles.screenContainer}>
          {screen === 'chat' && (
            <ChatScreen onOpenSidebar={() => setSidebarVisible(true)} onOpenBrowserAgent={handleOpenBrowserAgent} />
          )}
          {screen === 'settings' && (
            <SettingsScreen onOpenSidebar={() => setSidebarVisible(true)} />
          )}
        </View>
      </SafeAreaView>

      {!!preferences?.browser_access_enabled && (
        <View
          style={screen === 'browserAgent' ? StyleSheet.absoluteFill : styles.offscreen}
          pointerEvents={screen === 'browserAgent' ? 'box-none' : 'none'}
        >
          <BrowserAgentScreen
            browserRef={browserViewRef}
            initialUrl={null}
            isAgentRunning={isAgentRunning}
            onClose={handleCloseBrowserAgent}
          />
        </View>
      )}

      <SidebarDrawer
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onOpenSettings={handleOpenSettings}
        onDeleteConversation={handleDeleteConversation}
      />

      <AlertHost />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  screenContainer: { flex: 1 },
  dbErrorBanner: { paddingVertical: 6, paddingHorizontal: 16 },
  dbErrorText: { fontSize: 12, color: '#92400E', textAlign: 'center' },
  offscreen: { position: 'absolute', top: -10000, left: 0, width: 1, height: 1, overflow: 'hidden' },
});
