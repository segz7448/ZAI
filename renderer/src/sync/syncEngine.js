/**
 * ZAI - Sync Engine
 *
 * Local SQLite is the source of truth for the active session (instant,
 * offline-capable). This module is a background layer on top: it pushes
 * locally-pending rows to Supabase and pulls anything newer from other
 * devices. It NEVER blocks the chat flow - call syncNow() opportunistically
 * (app foreground, after sending a message, on a timer) and ignore its
 * result if you don't need to react to it.
 *
 * No login screen: getCurrentUserId() always resolves to a fixed owner id
 * as long as EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are
 * set (see src/supabase/client.js). The `skipped: 'not_signed_in'` results
 * below actually mean "Supabase env vars aren't configured," not "logged
 * out" - kept as-is so a missing .env still fails soft instead of crashing.
 *
 * Conflict handling: messages are append-only (no updates), so message
 * sync can never conflict. Conversations/preferences use last-write-wins
 * via updated_at, which is enough for a single-user app used across devices
 * one at a time.
 */

import { supabase, getCurrentUserId } from '../supabase/client';
import {
  getPendingSyncMessages,
  markMessageSynced,
  getConversations,
  getPreferences,
  updatePreferences,
} from '../db/database';

let syncInFlight = false;

/**
 * Push all locally-pending messages up to Supabase. Safe to call repeatedly;
 * it's a no-op if nothing is pending or if the user isn't signed in.
 */
export async function pushPendingMessages() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: true, skipped: 'not_signed_in', pushed: 0 };

    const pendingResult = await getPendingSyncMessages(100);
    if (!pendingResult.success || pendingResult.data.length === 0) {
      return { success: true, pushed: 0 };
    }

    let pushed = 0;
    for (const msg of pendingResult.data) {
      const { error } = await supabase.from('messages').insert({
        id: msg.id,
        conversation_id: msg.conversation_id,
        user_id: userId,
        role: msg.role,
        content: msg.content,
        provider: msg.provider,
        model: msg.model,
        model_family: msg.model_family,
        token_count: msg.token_count || 0,
        is_error: !!msg.is_error,
        supabase_image_path: msg.supabase_image_path || null,
        created_at: new Date(msg.created_at).toISOString(),
      });

      if (!error) {
        await markMessageSynced(msg.id);
        pushed += 1;
      } else if (error.code === '23505') {
        // Duplicate key - already synced from a previous attempt that didn't
        // update local status. Treat as success, mark it synced locally.
        await markMessageSynced(msg.id);
        pushed += 1;
      }
      // Any other error: leave it 'pending', it'll retry next sync pass.
    }

    return { success: true, pushed };
  } catch (err) {
    console.error('[Sync] pushPendingMessages failed:', err);
    return { success: false, pushed: 0, error: err?.message };
  }
}

/**
 * Push local conversation metadata (title, last model used) up to Supabase,
 * using last-write-wins on updated_at.
 */
export async function pushConversations() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: true, skipped: 'not_signed_in', pushed: 0 };

    const localResult = await getConversations(100);
    if (!localResult.success) return { success: false, pushed: 0 };

    let pushed = 0;
    for (const convo of localResult.data) {
      const { error } = await supabase.from('conversations').upsert({
        id: convo.id,
        user_id: userId,
        title: convo.title,
        last_provider: convo.last_provider,
        last_model: convo.last_model,
        created_at: new Date(convo.created_at).toISOString(),
        updated_at: new Date(convo.updated_at).toISOString(),
      });
      if (!error) pushed += 1;
    }
    return { success: true, pushed };
  } catch (err) {
    console.error('[Sync] pushConversations failed:', err);
    return { success: false, pushed: 0, error: err?.message };
  }
}

/**
 * Push local preferences to Supabase (last-write-wins).
 */
export async function pushPreferences() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: true, skipped: 'not_signed_in' };

    const localResult = await getPreferences();
    if (!localResult.success) return { success: false };

    const { error } = await supabase.from('user_preferences').upsert({
      user_id: userId,
      // ai_mode / manual_default_model / manual_limit_behavior no longer
      // synced - routing is fully automatic now, nothing to sync per-device.
      theme_preference: localResult.data.theme_preference,
      updated_at: new Date().toISOString(),
    });

    return { success: !error, error: error?.message };
  } catch (err) {
    console.error('[Sync] pushPreferences failed:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Pull remote preferences down, only applying if the remote copy is newer
 * than what's local (last-write-wins by timestamp).
 */
export async function pullPreferences() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: true, skipped: 'not_signed_in' };

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return { success: true, applied: false };

    const localResult = await getPreferences();
    const localUpdatedAt = localResult.data?.updated_at || 0;
    const remoteUpdatedAt = new Date(data.updated_at).getTime();

    if (remoteUpdatedAt > localUpdatedAt) {
      await updatePreferences({
        theme_preference: data.theme_preference,
      });
      return { success: true, applied: true };
    }
    return { success: true, applied: false };
  } catch (err) {
    console.error('[Sync] pullPreferences failed:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Run a full sync pass: push local changes up, pull remote preference
 * changes down. Guarded against overlapping calls (e.g. if the app
 * triggers sync both on foreground and after every message).
 *
 * Always resolves, never throws. Call this and ignore the result if you
 * just want "best effort background sync."
 */
export async function syncNow() {
  if (syncInFlight) {
    return { success: true, skipped: 'already_in_progress' };
  }
  syncInFlight = true;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: true, skipped: 'not_signed_in' };
    }

    const [messages, conversations, prefsPushed] = await Promise.all([
      pushPendingMessages(),
      pushConversations(),
      pushPreferences(),
    ]);
    const prefsPulled = await pullPreferences();

    return {
      success: true,
      messages,
      conversations,
      prefsPushed,
      prefsPulled,
    };
  } catch (err) {
    console.error('[Sync] syncNow failed:', err);
    return { success: false, error: err?.message };
  } finally {
    syncInFlight = false;
  }
}
