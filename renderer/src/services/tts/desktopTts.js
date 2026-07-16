/**
 * ZAI Desktop - Text-to-Speech (Web Speech API)
 *
 * Replaces src/services/tts/androidTts.js's expo-speech backend.
 * Chromium's built-in `speechSynthesis` is a direct equivalent of what
 * expo-speech wrapped on Android (android.speech.tts.TextToSpeech) - it
 * exposes whatever voices are installed on the Windows machine (via
 * Microsoft's SAPI voices, plus any additional ones the user has
 * installed through Windows Settings > Time & Language > Speech), works
 * fully offline, and costs nothing, for the exact same reasons the
 * Android version's docstring gives for using the OS's own TTS.
 *
 * SAME EXPORTED CONTRACT as androidTts.js (getAvailableVoices, speak,
 * stop, isSpeaking, resolvePresetVoices, VOICE_PRESETS,
 * openSystemTtsSettings) so ChatScreen.js and SettingsScreen.js port
 * with only their import path changed.
 */

let currentUtterance = null;

/**
 * Browsers load voices asynchronously - this waits for the list to be
 * populated (Chromium fires 'voiceschanged' once ready) instead of
 * returning an empty array on the very first call after app launch.
 */
function waitForVoices() {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    // Fallback in case the event never fires on some Chromium builds.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
}

export async function getAvailableVoices() {
  try {
    const voices = await waitForVoices();
    return voices
      .map((v) => ({
        identifier: v.voiceURI,
        name: v.name,
        language: v.lang,
        quality: v.localService ? 'Local' : 'Network',
      }))
      .sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[DesktopTTS] getAvailableVoices failed:', err);
    return [];
  }
}

export async function speak(text, options = {}) {
  const { voiceIdentifier, rate = 1.0, pitch = 1.0, onDone, onStopped, onError } = options;

  if (!text || !text.trim()) {
    return { success: false, error: { type: 'EMPTY_TEXT', message: 'Nothing to read aloud.' } };
  }

  await stop();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;

    if (voiceIdentifier) {
      const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceIdentifier);
      if (match) utterance.voice = match;
    }

    let stoppedManually = false;
    currentUtterance = { utterance, markStopped: () => { stoppedManually = true; } };

    utterance.onend = () => {
      currentUtterance = null;
      if (stoppedManually) {
        onStopped?.();
      } else {
        onDone?.();
      }
      resolve({ success: true, error: null });
    };

    utterance.onerror = (err) => {
      currentUtterance = null;
      console.error('[DesktopTTS] speak error:', err);
      onError?.(err);
      resolve({
        success: false,
        error: { type: 'TTS_ERROR', message: 'Could not read this aloud on this device.' },
      });
    };

    window.speechSynthesis.speak(utterance);
  });
}

export async function stop() {
  if (currentUtterance) {
    currentUtterance.markStopped();
  }
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export async function isSpeaking() {
  return window.speechSynthesis.speaking;
}

/** Identical to androidTts.js - preset shape and gender-lean heuristic are platform-agnostic. */
export const VOICE_PRESETS = [
  { key: 'buttery', label: 'Buttery', genderLean: 'male', pitch: 0.92, rate: 0.95 },
  { key: 'airy', label: 'Airy', genderLean: 'female', pitch: 1.08, rate: 1.05 },
  { key: 'mellow', label: 'Mellow', genderLean: 'male', pitch: 1.0, rate: 0.9 },
  { key: 'glass', label: 'Glass', genderLean: 'female', pitch: 1.15, rate: 1.0 },
];

function guessGenderLean(voice) {
  const id = (voice.identifier || '').toLowerCase();
  const name = (voice.name || '').toLowerCase();
  const femaleHints = ['female', 'zira', 'hazel', 'susan', 'aria', 'jenny'];
  const maleHints = ['male', 'david', 'mark', 'guy', 'ryan'];
  if (femaleHints.some((h) => id.includes(h) || name.includes(h))) return 'female';
  if (maleHints.some((h) => id.includes(h) || name.includes(h))) return 'male';
  return null;
}

export function resolvePresetVoices(installedVoices) {
  if (!installedVoices || installedVoices.length === 0) {
    return VOICE_PRESETS.map((p) => ({ ...p, voiceIdentifier: null }));
  }

  const englishFirst = [...installedVoices].sort((a, b) => {
    const aEn = (a.language || '').toLowerCase().startsWith('en') ? 0 : 1;
    const bEn = (b.language || '').toLowerCase().startsWith('en') ? 0 : 1;
    return aEn - bEn;
  });

  const byGender = { male: [], female: [], unknown: [] };
  for (const v of englishFirst) {
    const lean = guessGenderLean(v);
    byGender[lean || 'unknown'].push(v);
  }

  let unknownCursor = 0;
  return VOICE_PRESETS.map((preset) => {
    const pool = byGender[preset.genderLean];
    let chosen = pool.length > 0
      ? pool[Math.min(pool.length - 1, VOICE_PRESETS.filter((p) => p.genderLean === preset.genderLean).indexOf(preset))]
      : null;
    if (!chosen && byGender.unknown.length > 0) {
      chosen = byGender.unknown[unknownCursor % byGender.unknown.length];
      unknownCursor += 1;
    }
    if (!chosen) chosen = englishFirst[0];
    return { ...preset, voiceIdentifier: chosen?.identifier || null };
  });
}

/**
 * Opens Windows' Speech settings page directly (ms-settings: URI scheme),
 * where the person can install additional voices - same purpose as
 * Android's TTS_SETTINGS intent in the original function.
 */
export async function openSystemTtsSettings() {
  try {
    await window.zaiNative.app.openExternal('ms-settings:speech');
    return { success: true };
  } catch (err) {
    console.error('[DesktopTTS] openSystemTtsSettings failed:', err);
    return { success: false };
  }
}
