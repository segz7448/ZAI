import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  Switch,
} from 'react-native';
import { Alert } from '../native-clients/alertShim';
import { Ionicons } from '../native-clients/iconShim';
import * as Clipboard from '../native-clients/clipboardShim';
import { usePreferencesStore } from '../store/preferencesStore';
import { useThemeStore } from '../store/themeStore';
import { useTheme } from '../theme/useTheme';
import {
  getAvailableVoices,
  speak as speakNative,
  stop as stopNativeSpeech,
  openSystemTtsSettings,
} from '../services/tts/desktopTts';
import { syncNow } from '../sync/syncEngine';
import { getCurrentUserId } from '../supabase/client';
import {
  getUsageCounts,
  getRecentUsageEvents,
  getAllMemories,
  updateMemory,
  deactivateMemory,
  hardDeleteMemory,
  clearAllMemories,
} from '../db/database';
import { LOCAL_MODELS, MODEL_KEYS } from '../config/localModels';
// Model folder access / GGUF import (requestModelFolderAccess, importModel,
// deleteImportedModel, etc.) is gone - see ModelServerSection below, which
// replaced that whole "grant a folder, copy a file in" flow with a simple
// server URL + model id the person configures once.
// Server-based browserRouter/client.js removed - see src/services/browserAgent/
// for the on-device replacement (no import needed here, the Settings UI no
// longer configures a backend URL/token).

function GithubCredentialsSection({ status, onSaveUsername, onSaveToken, onRemove, theme }) {
  const [usernameValue, setUsernameValue] = useState(status.username || '');
  const [tokenValue, setTokenValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTestAndSave = async () => {
    if (!usernameValue.trim() || !tokenValue.trim()) return;
    setTesting(true);
    try {
      const { verifyToken } = await import('../services/github/githubTool');
      const result = await verifyToken(tokenValue.trim());
      if (result.valid) {
        // Save the username the person typed, not result.username, in
        // case they're intentionally managing repos under an
        // organization they belong to rather than their own login - the
        // token verification just confirms the token itself works, not
        // that this exact string has to match the token owner's login.
        await onSaveUsername(usernameValue.trim());
        await onSaveToken(tokenValue.trim());
        setEditing(false);
        setTokenValue('');
        Alert.alert('Connected', `GitHub token verified (authenticated as ${result.username}).`);
      } else {
        Alert.alert(
          'Connection failed',
          result.error?.message || 'Could not verify this token. Check it and try again.'
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong testing this token. Please try again.');
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove GitHub access?',
      'This removes your GitHub username and token. The local coder model won\'t be able to create repos, commit, or push until you add them again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onRemove },
      ]
    );
  };

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowHeader}>
        <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>GitHub</Text>
        <View style={[styles.statusPill, { backgroundColor: status.configured ? '#DCFCE7' : theme.surfaceAlt }]}>
          <Text style={[styles.statusPillText, { color: status.configured ? '#166534' : theme.textSecondary }]}>
            {status.configured ? `Connected · ${status.username}` : 'Not set'}
          </Text>
        </View>
      </View>

      {editing ? (
        <View>
          <TextInput
            style={[styles.keyInput, { borderColor: theme.borderStrong, color: theme.textPrimary }]}
            value={usernameValue}
            onChangeText={setUsernameValue}
            placeholder="GitHub username"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.keyInput, { borderColor: theme.borderStrong, color: theme.textPrimary, marginTop: 8 }]}
            value={tokenValue}
            onChangeText={setTokenValue}
            placeholder="Personal access token (repo scope)"
            placeholderTextColor={theme.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.keyRowButtons}>
            <TouchableOpacity
              style={styles.keySecondaryBtn}
              onPress={() => { setEditing(false); setTokenValue(''); setUsernameValue(status.username || ''); }}
            >
              <Text style={[styles.keySecondaryBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.keyPrimaryBtn,
                { backgroundColor: theme.accent },
                (!usernameValue.trim() || !tokenValue.trim() || testing) && { backgroundColor: theme.borderStrong },
              ]}
              onPress={handleTestAndSave}
              disabled={!usernameValue.trim() || !tokenValue.trim() || testing}
            >
              {testing
                ? <ActivityIndicator size="small" color={theme.textInverse} />
                : <Text style={[styles.keyPrimaryBtnText, { color: theme.textInverse }]}>Test & Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.keyRowButtons}>
          {status.configured && (
            <TouchableOpacity style={styles.keySecondaryBtn} onPress={handleRemove}>
              <Text style={[styles.keyRemoveBtnText, { color: theme.danger }]}>Remove</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.keyEditBtn} onPress={() => setEditing(true)}>
            <Text style={[styles.keyEditBtnText, { color: theme.info }]}>
              {status.configured ? 'Update' : 'Connect GitHub'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function TerminalSetupSection({ theme }) {
  const [termuxInstalled, setTermuxInstalled] = useState(null); // null = unknown, true/false once checked
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const { isTermuxInstalled } = await import('../native-clients/terminalTool');
      const result = await isTermuxInstalled();
      setTermuxInstalled(result);
    } catch (err) {
      setTermuxInstalled(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleOpenTermux = async () => {
    try {
      const { openTermuxForSetup } = await import('../native-clients/terminalTool');
      const result = await openTermuxForSetup();
      if (!result.success) {
        Alert.alert('Could not open Termux', result.error?.message || 'Termux may not be installed.');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong opening Termux.');
    }
  };

  const handleCopySetupCommand = async () => {
    try {
      const { getSetupCommand } = await import('../native-clients/terminalTool');
      const command = getSetupCommand();
      await Clipboard.setStringAsync(command);
      Alert.alert(
        'Copied',
        'Paste this into Termux and hit enter, once. After that, ZAI can dispatch commands to Termux (Android will still show a one-time permission prompt the first time).'
      );
    } catch (err) {
      Alert.alert('Error', 'Could not copy the setup command.');
    }
  };

  const statusPillStyle =
    termuxInstalled === true
      ? { backgroundColor: '#D1FAE5', textColor: '#065F46', label: 'Termux found - run setup command below' }
      : termuxInstalled === false
      ? { backgroundColor: '#FEE2E2', textColor: '#991B1B', label: 'Termux not installed' }
      : { backgroundColor: '#FEF3C7', textColor: '#92400E', label: 'Checking...' };

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowHeader}>
        <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>Terminal (Termux)</Text>
        <View style={[styles.statusPill, { backgroundColor: statusPillStyle.backgroundColor }]}>
          <Text style={[styles.statusPillText, { color: statusPillStyle.textColor }]}>{statusPillStyle.label}</Text>
        </View>
      </View>
      <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 4 }]}>
        Real shell commands (npm install, pip install, gradlew, etc.) need Termux to actually run them - Android itself gives no app, ZAI included, a shell of its own. This is a one-time setup, per device: paste one command into Termux, accept one Android permission prompt, and ZAI's agent can use the terminal freely after that.
      </Text>

      {termuxInstalled === false ? (
        <TouchableOpacity style={[styles.keyEditBtn, { marginTop: 12 }]} onPress={handleOpenTermux}>
          <Text style={[styles.keyEditBtnText, { color: theme.info }]}>Install Termux (opens F-Droid/GitHub link)</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity style={[styles.keyEditBtn, { marginTop: 12 }]} onPress={handleCopySetupCommand}>
            <Text style={[styles.keyEditBtnText, { color: theme.info }]}>Copy one-time setup command</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.keyEditBtn, { marginTop: 8 }]} onPress={handleOpenTermux}>
            <Text style={[styles.keyEditBtnText, { color: theme.info }]}>Open Termux</Text>
          </TouchableOpacity>
        </>
      )}

      {checking ? null : (
        <TouchableOpacity onPress={checkStatus} style={{ marginTop: 8 }}>
          <Text style={[styles.helperText, { color: theme.textSecondary, textDecorationLine: 'underline' }]}>Re-check status</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function FilesystemAccessSection({ preferences, theme }) {
  const [requesting, setRequesting] = useState(false);
  const grantFilesystemAccess = usePreferencesStore((s) => s.grantFilesystemAccess);

  const granted = !!preferences?.filesystem_saf_uri;

  const handleGrantAccess = async () => {
    setRequesting(true);
    try {
      // grantFilesystemAccess() (preferencesStore.js) both requests the
      // SAF permission AND reloads the store afterward, so `preferences`
      // here (and the "Granted" pill below) update immediately instead of
      // only reflecting the new URI after the app is restarted.
      const result = await grantFilesystemAccess();
      if (!result.success) {
        Alert.alert('Access not granted', result.error?.message || 'Folder access was not granted.');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong requesting folder access.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowHeader}>
        <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>Device folder access</Text>
        <View style={[styles.statusPill, { backgroundColor: granted ? '#DCFCE7' : theme.surfaceAlt }]}>
          <Text style={[styles.statusPillText, { color: granted ? '#166534' : theme.textSecondary }]}>
            {granted ? 'Granted' : 'Not granted'}
          </Text>
        </View>
      </View>
      <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 4 }]}>
        {granted
          ? 'ZAI can create, move, rename, delete, zip, and extract files inside the folder you granted. Grant a different folder anytime below.'
          : 'Android requires granting access to a specific folder before ZAI can manage files on your device (create, move, rename, delete, zip, extract). This is a one-time system permission - pick a folder like Download to give ZAI room to work in.'}
      </Text>
      <TouchableOpacity
        style={[styles.keyEditBtn, { marginTop: 12 }]}
        onPress={handleGrantAccess}
        disabled={requesting}
      >
        {requesting
          ? <ActivityIndicator size="small" color={theme.info} />
          : <Text style={[styles.keyEditBtnText, { color: theme.info }]}>{granted ? 'Change folder' : 'Grant folder access'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

/**
 * Model Server section - replaces the old "grant a folder, copy a GGUF
 * into app storage" flow entirely. ZAI no longer loads any model
 * in-process (that used to mean bundling node-llama-cpp, a native module
 * whose failure to load could blank the whole window before the
 * renderer even painted - see src/main-native/llamaEngine.js). Instead,
 * the person runs their own model server (llama.cpp's `llama-server`,
 * or any OpenAI-compatible host) - any model they like, Qwen3, Qwen2.5
 * 3B, Qwen2.5 1.5B, or something else entirely - and just points ZAI at
 * it here: a base URL, and optionally which model id to send (only
 * matters for servers that host more than one model at once).
 */
function ModelServerSection({ preferences, theme }) {
  const [urlValue, setUrlValue] = useState(preferences?.model_server_url || '');
  const [selectedPreset, setSelectedPreset] = useState(
    Object.values(LOCAL_MODELS).find((m) => m.serverModelId === preferences?.model_server_model)?.key
      || (preferences?.model_server_model ? MODEL_KEYS.CUSTOM : MODEL_KEYS.QWEN3_4B)
  );
  const [customModelId, setCustomModelId] = useState(
    selectedPreset === MODEL_KEYS.CUSTOM ? (preferences?.model_server_model || '') : ''
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok: boolean, message: string } | null

  const setServerUrlPref = usePreferencesStore((s) => s.setModelServerConfig);

  const configured = !!preferences?.model_server_url;
  const resolvedModelId = selectedPreset === MODEL_KEYS.CUSTOM ? customModelId.trim() : LOCAL_MODELS[selectedPreset]?.serverModelId;

  const handleSave = async () => {
    if (!urlValue.trim()) {
      Alert.alert('URL required', 'Enter the base URL your model server is running on, e.g. http://localhost:8080');
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const result = await setServerUrlPref(urlValue.trim(), resolvedModelId || null);
      if (!result.success) {
        Alert.alert('Could not save', result.error?.message || 'Something went wrong saving these settings.');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong saving these settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { checkServerStatus } = await import('../native-clients/llamaEngine');
      const result = await checkServerStatus();
      setTestResult(
        result.success
          ? { ok: true, message: 'Connected - the server responded.' }
          : { ok: false, message: result.error?.message || 'Could not reach the server.' }
      );
    } catch (err) {
      setTestResult({ ok: false, message: 'Something went wrong testing the connection.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowHeader}>
        <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>Model server</Text>
        <View style={[styles.statusPill, { backgroundColor: configured ? '#DCFCE7' : theme.surfaceAlt }]}>
          <Text style={[styles.statusPillText, { color: configured ? '#166534' : theme.textSecondary }]}>
            {configured ? 'Configured' : 'Not configured'}
          </Text>
        </View>
      </View>
      <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 4 }]}>
        ZAI connects to a model server you run yourself instead of loading a model file directly - start one with something like{' '}
        <Text style={{ fontFamily: 'monospace' }}>llama-server -m your-model.gguf --port 8080</Text>, then enter its address below. Any GGUF works - Qwen3, Qwen2.5 3B, Qwen2.5 1.5B, or anything else your server hosts.
      </Text>

      <Text style={[styles.helperText, { color: theme.textTertiary, marginTop: 12, marginBottom: 4, paddingHorizontal: 0 }]}>Server URL</Text>
      <TextInput
        style={[styles.keyInput, { color: theme.textPrimary, borderColor: theme.border }]}
        value={urlValue}
        onChangeText={setUrlValue}
        placeholder="http://localhost:8080"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.helperText, { color: theme.textTertiary, marginTop: 12, marginBottom: 4, paddingHorizontal: 0 }]}>Model</Text>
      <View style={{ marginTop: 2 }}>
        {Object.values(LOCAL_MODELS).map((model, i) => (
          <TouchableOpacity
            key={model.key}
            style={[
              styles.keyRowHeader,
              { paddingVertical: 8, borderBottomWidth: i === Object.values(LOCAL_MODELS).length - 1 ? 0 : 1, borderBottomColor: theme.border },
            ]}
            onPress={() => setSelectedPreset(model.key)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.keyLabel, { color: theme.textPrimary, fontSize: 14 }]}>{model.label}</Text>
              <Text style={[styles.helperText, { color: theme.textTertiary, padding: 0, marginTop: 2 }]}>{model.description}</Text>
            </View>
            <Ionicons
              name={selectedPreset === model.key ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={selectedPreset === model.key ? theme.info : theme.textTertiary}
            />
          </TouchableOpacity>
        ))}
      </View>

      {selectedPreset === MODEL_KEYS.CUSTOM && (
        <TextInput
          style={[styles.keyInput, { color: theme.textPrimary, borderColor: theme.border, marginTop: 8 }]}
          value={customModelId}
          onChangeText={setCustomModelId}
          placeholder="model id exactly as your server expects, e.g. qwen2.5-7b-instruct"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      <View style={[styles.keyRowButtons, { justifyContent: 'flex-start', marginTop: 14 }]}>
        <TouchableOpacity style={styles.keyEditBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={theme.info} />
            : <Text style={[styles.keyEditBtnText, { color: theme.info }]}>Save</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.keySecondaryBtn, { marginLeft: 10 }]} onPress={handleTestConnection} disabled={testing || !configured}>
          {testing
            ? <ActivityIndicator size="small" color={theme.textSecondary} />
            : <Text style={[styles.keyRemoveBtnText, { color: theme.textSecondary }]}>Test connection</Text>}
        </TouchableOpacity>
      </View>

      {testResult && (
        <Text style={[styles.helperText, { color: testResult.ok ? '#166534' : theme.danger, marginTop: 8 }]}>
          {testResult.message}
        </Text>
      )}

      <Text style={[styles.helperText, { color: theme.textTertiary, marginTop: 12 }]}>
        The "Model" picker just tells ZAI which model id to send with each request - it doesn't launch or switch anything for you. That's controlled entirely by whichever GGUF you started your server with (or, for a multi-model server like llama-swap, whichever model id you configured it to route on).
      </Text>
    </View>
  );
}

/**
 * Memory settings section - the equivalent of Claude/ChatGPT's "Manage
 * memory" screen. Lets the person turn the whole feature on/off (a
 * revertible toggle, backed by preferences.memory_enabled) and browse,
 * edit, or delete individual memories ZAI has extracted from past
 * conversations (see src/services/memory/memoryEngine.js for how they get
 * created in the first place). Everything here reads/writes SQLite only -
 * no network call, since memories never leave the device.
 */
function MemorySection({ preferences, onToggle, theme }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const memoryEnabled = preferences?.memory_enabled !== false;

  const loadMemories = async () => {
    setLoading(true);
    const result = await getAllMemories();
    setMemories(result.success ? result.data.filter((m) => m.is_active) : []);
    setLoading(false);
  };

  const openModal = async () => {
    setModalVisible(true);
    await loadMemories();
  };

  const handleSaveEdit = async (id) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    await updateMemory(id, { content: trimmed });
    setEditingId(null);
    setEditingText('');
    await loadMemories();
  };

  const handleForget = async (id) => {
    await deactivateMemory(id);
    await loadMemories();
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear all memories?',
      'This permanently deletes everything ZAI remembers about you. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            await clearAllMemories();
            await loadMemories();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowHeader}>
        <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>Remember things about me</Text>
        <Switch
          value={memoryEnabled}
          onValueChange={onToggle}
          trackColor={{ false: theme.surfaceAlt, true: theme.info }}
        />
      </View>
      <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 4 }]}>
        {memoryEnabled
          ? 'ZAI automatically picks up durable facts from your conversations (name, preferences, ongoing projects) and brings them into future chats, so you don\'t have to repeat yourself. Stored only on this device.'
          : 'Off - ZAI won\'t learn or recall anything about you across conversations. Memories already stored stay saved until you clear them below.'}
      </Text>
      <TouchableOpacity style={[styles.keyEditBtn, { marginTop: 12 }]} onPress={openModal}>
        <Text style={[styles.keyEditBtnText, { color: theme.info }]}>Manage memories</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: 56 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.textPrimary }}>Memory</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={26} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={theme.info} style={{ marginTop: 40 }} />
          ) : memories.length === 0 ? (
            <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40, paddingHorizontal: 20 }}>
              Nothing saved yet. As you chat with ZAI, things worth remembering will show up here.
            </Text>
          ) : (
            <FlatList
              data={memories}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
              renderItem={({ item }) => (
                <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 6, textTransform: 'uppercase' }}>
                    {item.category || 'general'}
                  </Text>
                  {editingId === item.id ? (
                    <>
                      <TextInput
                        value={editingText}
                        onChangeText={setEditingText}
                        multiline
                        style={{ color: theme.textPrimary, fontSize: 15, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 8, marginBottom: 8 }}
                      />
                      <View style={{ flexDirection: 'row', gap: 16 }}>
                        <TouchableOpacity onPress={() => handleSaveEdit(item.id)}>
                          <Text style={{ color: theme.info, fontWeight: '600' }}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setEditingId(null); setEditingText(''); }}>
                          <Text style={{ color: theme.textSecondary }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: theme.textPrimary, fontSize: 15, marginBottom: 10 }}>{item.content}</Text>
                      <View style={{ flexDirection: 'row', gap: 20 }}>
                        <TouchableOpacity onPress={() => { setEditingId(item.id); setEditingText(item.content); }}>
                          <Text style={{ color: theme.info, fontWeight: '600' }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleForget(item.id)}>
                          <Text style={{ color: '#DC2626', fontWeight: '600' }}>Forget</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            />
          )}

          {memories.length > 0 && (
            <TouchableOpacity
              style={{ marginHorizontal: 20, marginBottom: 24, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#DC2626' }}
              onPress={handleClearAll}
            >
              <Text style={{ color: '#DC2626', fontWeight: '700' }}>Clear all memories</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </View>
  );
}

function SyncDiagnosticsSection({ theme }) {
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    (async () => {
      // getCurrentUserId() returns null specifically when
      // EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY weren't
      // baked into THIS build at all (see src/supabase/client.js) - not a
      // login state, since ZAI has no auth. This is the single most useful
      // fact for diagnosing "nothing syncs": if this shows "Not configured"
      // on a real installed APK, the GitHub Actions build didn't have
      // those secrets available when it ran, and nothing past this point
      // can possibly work until that's fixed on the GitHub repo's
      // Settings -> Secrets side (not something fixable from inside the app).
      const id = await getCurrentUserId();
      setUserId(id);
      setChecking(false);
    })();
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const result = await syncNow();
      setLastResult(result);
    } finally {
      setSyncing(false);
    }
  };

  const configured = !!userId;

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowHeader}>
        <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>Supabase connection</Text>
        {checking ? (
          <ActivityIndicator size="small" color={theme.textTertiary} />
        ) : (
          <View style={[styles.statusPill, { backgroundColor: configured ? '#DCFCE7' : '#FEE2E2' }]}>
            <Text style={[styles.statusPillText, { color: configured ? '#166534' : '#991B1B' }]}>
              {configured ? 'Configured' : 'Not configured'}
            </Text>
          </View>
        )}
      </View>

      {!checking && !configured && (
        <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 4 }]}>
          This build doesn't have Supabase credentials at all - EXPO_PUBLIC_SUPABASE_URL
          and/or EXPO_PUBLIC_SUPABASE_ANON_KEY weren't set when it was built.
          Nothing can sync until the GitHub Actions workflow's SUPABASE_URL
          and SUPABASE_ANON_KEY repo secrets are set correctly and a fresh
          APK is built - this can't be fixed from inside the app itself.
        </Text>
      )}

      {!checking && configured && (
        <>
          <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 4 }]}>
            Supabase credentials are present in this build. Tap below to run
            a sync right now and see exactly what happened, rather than
            waiting and guessing.
          </Text>
          <TouchableOpacity
            style={[styles.keyEditBtn, { marginTop: 12 }]}
            onPress={handleManualSync}
            disabled={syncing}
          >
            {syncing
              ? <ActivityIndicator size="small" color={theme.info} />
              : <Text style={[styles.keyEditBtnText, { color: theme.info }]}>Sync now</Text>}
          </TouchableOpacity>

          {lastResult && (
            <View style={[styles.syncResultBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              {lastResult.success ? (
                <>
                  <Text style={[styles.syncResultLine, { color: theme.textPrimary }]}>
                    Messages pushed: {lastResult.messages?.pushed ?? 0}
                    {lastResult.messages?.error ? ` (error: ${lastResult.messages.error})` : ''}
                  </Text>
                  <Text style={[styles.syncResultLine, { color: theme.textPrimary }]}>
                    Conversations pushed: {lastResult.conversations?.pushed ?? 0}
                    {lastResult.conversations?.error ? ` (error: ${lastResult.conversations.error})` : ''}
                  </Text>
                  <Text style={[styles.syncResultLine, { color: theme.textPrimary }]}>
                    Preferences: {lastResult.prefsPushed?.success ? 'pushed' : 'failed'} / {lastResult.prefsPulled?.success ? 'pulled' : 'failed'}
                  </Text>
                </>
              ) : (
                <Text style={[styles.syncResultLine, { color: theme.danger }]}>
                  Sync failed: {lastResult.error || 'unknown error'}
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function SectionHeader({ title, theme }) {
  return <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>{title}</Text>;
}

function BrowserAgentSection({ preferences, theme }) {
  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowHeader}>
        <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>On-device browser agent</Text>
        <View style={[styles.statusPill, { backgroundColor: preferences.browser_access_enabled ? '#DCFCE7' : theme.surfaceAlt }]}>
          <Text style={[styles.statusPillText, { color: preferences.browser_access_enabled ? '#166534' : theme.textSecondary }]}>
            {preferences.browser_access_enabled ? 'On' : 'Off'}
          </Text>
        </View>
      </View>
      <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 4 }]}>
        No setup needed here - there's no backend to configure anymore. Turn
        this on or off anytime with the globe button in the chat composer.
        A small live view of the browser appears while it's on, so you can
        watch (or take over) whatever ZAI is doing.
      </Text>
    </View>
  );
}


function RadioOption({ label, subtitle, selected, onPress, theme }) {
  return (
    <TouchableOpacity style={styles.modeOption} onPress={onPress}>
      <View style={styles.modeOptionLeft}>
        <View
          style={[
            styles.radio,
            { borderColor: theme.borderStrong },
            selected && { borderColor: theme.accent, backgroundColor: theme.accent },
          ]}
        />
        <View>
          <Text style={[styles.modeTitle, { color: theme.textPrimary }]}>{label}</Text>
          {subtitle ? <Text style={[styles.modeSubtitle, { color: theme.textTertiary }]}>{subtitle}</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function UsageModal({ visible, onClose, theme }) {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [serverStatus, setServerStatus] = useState(null); // { url, model, status } | null
  const [recentEvents, setRecentEvents] = useState([]);
  const [devModeExpanded, setDevModeExpanded] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setLoading(true);
      try {
        const { getServerConfig, checkServerStatus } = await import('../native-clients/llamaEngine');
        const [countsResult, recentResult, config] = await Promise.all([
          getUsageCounts(),
          getRecentUsageEvents(15),
          getServerConfig(),
        ]);
        setCounts(countsResult.data || {});
        setRecentEvents(recentResult.data || []);
        if (config?.url) {
          const statusResult = await checkServerStatus();
          setServerStatus({ ...config, reachable: statusResult.success });
        } else {
          setServerStatus({ url: null, model: null, reachable: false });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const totalFileEvents = (counts.file_created || 0) + (counts.github_push || 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Usage</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.usageLoadingBox}>
            <ActivityIndicator size="small" color={theme.textTertiary} />
          </View>
        ) : (
          <ScrollView style={styles.container}>
            <SectionHeader title="Model Server" theme={theme} />
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={[styles.usageHealthRow, { borderBottomWidth: 0 }]}>
                <View style={[styles.healthDot, { backgroundColor: serverStatus?.reachable ? '#22C55E' : '#EF4444' }]} />
                <Text style={[styles.usageRowLabel, { color: theme.textPrimary, flex: 1 }]}>
                  {serverStatus?.url || 'No server configured'}
                </Text>
                <Text style={[styles.helperText, { color: theme.textTertiary }]}>
                  {!serverStatus?.url ? 'Not set' : serverStatus.reachable ? 'Reachable' : 'Unreachable'}
                </Text>
              </View>
              <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 8 }]}>
                {serverStatus?.model
                  ? `Requesting model "${serverStatus.model}". `
                  : ''}
                Runs on a model server you start yourself (e.g. llama.cpp's llama-server) - no network call to any third party, no rate limit, no per-call cost. Manage this in Settings &gt; Model Server.
              </Text>
            </View>

            <SectionHeader title="Activity" theme={theme} />
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <UsageRow label="Browser sessions" value={counts.browser_session || 0} theme={theme} />
              <UsageRow label="GitHub pushes" value={counts.github_push || 0} theme={theme} />
              <UsageRow label="Repos created" value={counts.github_repo_created || 0} theme={theme} />
              <UsageRow label="Files created" value={totalFileEvents} theme={theme} last />
            </View>


            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
              onPress={() => setDevModeExpanded((v) => !v)}
            >
              <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>Developer Mode</Text>
              <Ionicons name={devModeExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
            </TouchableOpacity>

            {devModeExpanded && (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <Text style={[styles.helperText, { color: theme.textSecondary, marginBottom: 8 }]}>
                  Most recent tool/model calls, newest first:
                </Text>
                {recentEvents.length === 0 ? (
                  <Text style={[styles.helperText, { color: theme.textSecondary }]}>Nothing logged yet.</Text>
                ) : (
                  recentEvents.map((event) => (
                    <View key={event.id} style={styles.usageEventRow}>
                      <Text style={[styles.usageEventType, { color: theme.info }]}>{event.event_type}</Text>
                      {event.detail ? (
                        <Text style={[styles.helperText, { color: theme.textPrimary }]} numberOfLines={1}>{event.detail}</Text>
                      ) : null}
                      <Text style={[styles.helperText, { color: theme.textTertiary }]}>
                        {new Date(event.created_at).toLocaleTimeString()}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function UsageRow({ label, value, theme, last = false }) {
  return (
    <View style={[styles.usageRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <Text style={[styles.usageRowLabel, { color: theme.textPrimary }]}>{label}</Text>
      <Text style={[styles.usageRowValue, { color: theme.textSecondary }]}>{value}</Text>
    </View>
  );
}

function VoicePickerModal({ visible, voices, selectedIdentifier, onSelect, onClose, theme }) {
  const [previewingId, setPreviewingId] = useState(null);

  const handlePreview = async (voice) => {
    if (previewingId === voice.identifier) {
      await stopNativeSpeech();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(voice.identifier);
    speakNative('Hi, this is a preview of my voice.', {
      voiceIdentifier: voice.identifier,
      onDone: () => setPreviewingId((current) => (current === voice.identifier ? null : current)),
      onStopped: () => setPreviewingId((current) => (current === voice.identifier ? null : current)),
      onError: () => setPreviewingId((current) => (current === voice.identifier ? null : current)),
    });
  };

  const handleClose = async () => {
    await stopNativeSpeech();
    setPreviewingId(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Choose a voice</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.voiceRow, { borderBottomColor: theme.border }]}
          onPress={() => {
            onSelect(null);
            handleClose();
          }}
        >
          <View style={styles.voiceRowLeft}>
            <View
              style={[
                styles.radio,
                { borderColor: theme.borderStrong },
                !selectedIdentifier && { borderColor: theme.accent, backgroundColor: theme.accent },
              ]}
            />
            <View>
              <Text style={[styles.modeTitle, { color: theme.textPrimary }]}>System default</Text>
              <Text style={[styles.modeSubtitle, { color: theme.textTertiary }]}>
                Whatever your phone's default TTS voice is
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <FlatList
          data={voices}
          keyExtractor={(item) => item.identifier}
          renderItem={({ item }) => {
            const selected = selectedIdentifier === item.identifier;
            const previewing = previewingId === item.identifier;
            return (
              <View style={[styles.voiceRow, { borderBottomColor: theme.border }]}>
                <TouchableOpacity
                  style={styles.voiceRowLeft}
                  onPress={() => {
                    onSelect(item.identifier);
                    handleClose();
                  }}
                >
                  <View
                    style={[
                      styles.radio,
                      { borderColor: theme.borderStrong },
                      selected && { borderColor: theme.accent, backgroundColor: theme.accent },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modeTitle, { color: theme.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.modeSubtitle, { color: theme.textTertiary }]}>
                      {item.language} · {item.quality}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePreview(item)}
                  hitSlop={10}
                  style={styles.previewButton}
                >
                  <Ionicons
                    name={previewing ? 'stop-circle-outline' : 'play-circle-outline'}
                    size={26}
                    color={theme.accent}
                  />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.helperText, { color: theme.textTertiary, textAlign: 'center', marginTop: 24 }]}>
              No extra voices found on this device yet. You can download more from your phone's
              Text-to-speech settings.
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

export default function SettingsScreen({ onOpenSidebar }) {
  const theme = useTheme();
  const {
    preferences, apiKeyStatus, loadPreferences,
    setApiKey, removeApiKey, setGithubUsername,
    setTtsVoice, setTtsSpeechRate, setMemoryEnabled,
  } = usePreferencesStore();
  const { themePreference, loadThemePreference, setThemePreference } = useThemeStore();

  const [voices, setVoices] = useState([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [usageModalVisible, setUsageModalVisible] = useState(false);

  useEffect(() => {
    loadPreferences();
    loadThemePreference();
    (async () => {
      setVoicesLoading(true);
      setVoices(await getAvailableVoices());
      setVoicesLoading(false);
    })();
    return () => {
      stopNativeSpeech();
    };
  }, []);

  const selectedVoiceLabel = preferences.tts_voice_identifier
    ? (voices.find((v) => v.identifier === preferences.tts_voice_identifier)?.name
        || preferences.tts_voice_identifier)
    : 'System default';

  const handleOpenVoiceSettings = async () => {
    const result = await openSystemTtsSettings();
    if (!result.success) {
      Alert.alert(
        'Could not open settings',
        "Your phone doesn't support opening Text-to-speech settings directly. Look for it under Settings > System > Languages & input > Text-to-speech output."
      );
    }
  };

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={styles.header}>
        {onOpenSidebar && (
          <TouchableOpacity onPress={onOpenSidebar} hitSlop={12} style={styles.headerIconButton}>
            <Ionicons name="menu-outline" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Settings</Text>
      </View>

      <SectionHeader title="Appearance" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <RadioOption
          label="Auto"
          subtitle="Follows your phone's system setting"
          selected={themePreference === 'auto'}
          onPress={() => setThemePreference('auto')}
          theme={theme}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <RadioOption
          label="Light"
          selected={themePreference === 'light'}
          onPress={() => setThemePreference('light')}
          theme={theme}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <RadioOption
          label="Dark"
          selected={themePreference === 'dark'}
          onPress={() => setThemePreference('dark')}
          theme={theme}
        />
      </View>

      <SectionHeader title="Voice" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={styles.voiceSelectRow}
          onPress={() => setVoicePickerVisible(true)}
          disabled={voicesLoading}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>Read Aloud voice</Text>
            <Text style={[styles.modeSubtitle, { color: theme.textTertiary, marginTop: 2 }]}>
              {voicesLoading ? 'Loading voices…' : selectedVoiceLabel}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Speech rate</Text>
        <View style={styles.chipRow}>
          {[
            { key: 0.75, label: 'Slower' },
            { key: 1.0, label: 'Normal' },
            { key: 1.25, label: 'Faster' },
            { key: 1.5, label: 'Fastest' },
          ].map((opt) => {
            const selected = Math.abs((preferences.tts_speech_rate ?? 1.0) - opt.key) < 0.01;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.familyChip,
                  { backgroundColor: theme.surfaceAlt },
                  selected && { backgroundColor: theme.accent },
                ]}
                onPress={() => setTtsSpeechRate(opt.key)}
              >
                <Text
                  style={[
                    styles.familyChipText,
                    { color: theme.textPrimary },
                    selected && { color: theme.textInverse },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.manageVoicesRow} onPress={handleOpenVoiceSettings}>
          <Ionicons name="download-outline" size={16} color={theme.info} />
          <Text style={[styles.manageVoicesText, { color: theme.info }]}>
            Download more voices
          </Text>
        </TouchableOpacity>
        <Text style={[styles.helperText, { color: theme.textTertiary }]}>
          Read Aloud uses your phone's built-in text-to-speech engine, so it works instantly and
          offline. Opens your phone's system Text-to-speech settings, where you can install
          additional languages and voice packs - they'll show up here automatically.
        </Text>
      </View>

      <SectionHeader title="Usage" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          onPress={() => setUsageModalVisible(true)}
        >
          <Text style={[styles.keyLabel, { color: theme.textPrimary }]}>View usage & activity</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <SectionHeader title="Model Server" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <ModelServerSection preferences={preferences} theme={theme} />
      </View>

      <SectionHeader title="API Keys" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <GithubCredentialsSection
          status={apiKeyStatus.github}
          onSaveUsername={setGithubUsername}
          onSaveToken={(token) => setApiKey('github', token)}
          onRemove={() => removeApiKey('github')}
          theme={theme}
        />
        <Text style={[styles.helperText, { color: theme.textTertiary }]}>
          Chat, coding, and reasoning run through your own model server now (see Model Server above) - no key needed for any of that. GitHub needs your own Personal Access Token since repo actions have to happen under your account. Generate one at github.com/settings/tokens with the "repo" scope.
        </Text>
      </View>

      <SectionHeader title="Browser Agent" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <BrowserAgentSection preferences={preferences} theme={theme} />
        <Text style={[styles.helperText, { color: theme.textTertiary }]}>
          Lets ZAI actually browse the live web on your device — search, open pages, log in, click, fill forms, and read content — using a real on-device browser, driven by the local Qwen2.5 Coder model acting as an agent. No server, no tunnel, nothing to host yourself.
        </Text>
      </View>


      <SectionHeader title="Filesystem" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <FilesystemAccessSection preferences={preferences} theme={theme} />
      </View>

      <SectionHeader title="Memory" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <MemorySection preferences={preferences} onToggle={setMemoryEnabled} theme={theme} />
      </View>

      <SectionHeader title="Terminal" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <TerminalSetupSection theme={theme} />
      </View>

      <SectionHeader title="Sync" theme={theme} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <SyncDiagnosticsSection theme={theme} />
      </View>
    </ScrollView>

    <VoicePickerModal
      visible={voicePickerVisible}
      voices={voices}
      selectedIdentifier={preferences.tts_voice_identifier}
      onSelect={setTtsVoice}
      onClose={() => setVoicePickerVisible(false)}
      theme={theme}
    />
    <UsageModal
      visible={usageModalVisible}
      onClose={() => setUsageModalVisible(false)}
      theme={theme}
    />
    </>
  );
}

const styles = StyleSheet.create({
  usageLoadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usageBigNumber: {
    fontSize: 32,
    fontWeight: '700',
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  usageRowLabel: {
    fontSize: 14,
  },
  usageRowValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  usageHealthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  usageEventRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
    gap: 2,
  },
  usageEventType: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  syncResultBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  syncResultLine: {
    fontSize: 12,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIconButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    padding: 4,
  },
  modeOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  modeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    marginRight: 12,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  modeSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginHorizontal: 12,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingTop: 12,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    gap: 8,
  },
  familyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 4,
  },
  familyChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  keyRow: {
    padding: 12,
  },
  keyRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  keyLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  keyInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  keyRowButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  keySecondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  keySecondaryBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  keyRemoveBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  keyPrimaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  keyPrimaryBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  keyEditBtn: {
    alignSelf: 'flex-start',
  },
  keyEditBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  helperText: {
    fontSize: 12,
    padding: 12,
    lineHeight: 17,
  },
  voiceSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  manageVoicesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    gap: 6,
  },
  manageVoicesText: {
    fontWeight: '600',
    fontSize: 13,
  },
  modalContainer: {
    flex: 1,
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  voiceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  previewButton: {
    padding: 4,
    marginLeft: 8,
  },
});
