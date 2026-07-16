/**
 * ZAI - File Storage Helper
 *
 * Wraps the 'zai-files' Supabase Storage bucket. Files are stored under
 * {owner_id}/{filename} - single-user app, no per-user RLS needed (see
 * supabase/schema_v2.sql), the folder prefix is just kept for a stable
 * path shape.
 *
 * This is the layer file-handling features (PDF/DOCX/PPTX generation, OCR
 * results, etc. - see README TODO) will plug into once built.
 */

import { supabase, getCurrentUserId } from '../supabase/client';
// NOTE: file metadata is written directly to the Supabase 'files' table here
// rather than local SQLite first, since files live in Storage, not on-device.
// If local-first file caching is added later, mirror the messages/
// conversations pattern in db/database.js.

const BUCKET = 'zai-files';

/**
 * Upload a local file (as base64 or blob, depending on RN environment) to
 * the user's private storage folder, and record its metadata.
 *
 * @param {string} localUri - file:// URI from expo-file-system or similar
 * @param {string} fileName
 * @param {string} fileType - 'pdf' | 'docx' | 'pptx' | 'zip' | 'csv' | 'image' | other
 * @param {string|null} conversationId
 */
export async function uploadFile(localUri, fileName, fileType, conversationId = null) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, data: null, error: 'Supabase is not configured - check EXPO_PUBLIC_SUPABASE_URL/ANON_KEY in .env' };
    }

    const response = await fetch(localUri);
    const blob = await response.blob();
    const storagePath = `${userId}/${Date.now()}_${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { upsert: false });

    if (uploadError) {
      return { success: false, data: null, error: uploadError.message };
    }

    const record = {
      user_id: userId,
      conversation_id: conversationId,
      file_name: fileName,
      file_type: fileType,
      storage_path: storagePath,
      size_bytes: blob.size || 0,
    };

    const { error: dbError } = await supabase.from('files').insert(record);
    if (dbError) {
      console.error('[Storage] File uploaded but metadata insert failed:', dbError);
      // Not fatal - file is safely stored, just missing a catalog entry.
    }

    return { success: true, data: { storagePath, ...record }, error: null };
  } catch (err) {
    console.error('[Storage] uploadFile failed:', err);
    return { success: false, data: null, error: 'Upload failed. Please try again.' };
  }
}

/**
 * Upload one step-by-step snapshot from a browser agent session. These are
 * plain still images (react-native-view-shot captures of the on-device
 * WebView after each action) - not video. Expo's managed workflow has no
 * access to Android's MediaProjection API without ejecting to bare native
 * code, so a snapshot per step is the recording format: chained together in
 * order, they give a step-by-step visual record of what the agent did
 * without needing a native build change.
 *
 * @param {string} localUri - file:// URI of the captured PNG/JPEG
 * @param {string} sessionId - groups every snapshot from one agent session together
 * @param {number} stepIndex - ordering within the session
 * @param {string|null} conversationId
 */
export async function uploadAgentSnapshot(localUri, sessionId, stepIndex, conversationId = null) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, data: null, error: 'Supabase is not configured - check EXPO_PUBLIC_SUPABASE_URL/ANON_KEY in .env' };
    }

    const response = await fetch(localUri);
    const blob = await response.blob();
    const paddedStep = String(stepIndex).padStart(4, '0');
    const storagePath = `${userId}/agent-sessions/${sessionId}/${paddedStep}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { upsert: true, contentType: 'image/jpeg' });

    if (uploadError) {
      return { success: false, data: null, error: uploadError.message };
    }

    const record = {
      user_id: userId,
      conversation_id: conversationId,
      session_id: sessionId,
      step_index: stepIndex,
      storage_path: storagePath,
    };

    const { error: dbError } = await supabase.from('agent_session_snapshots').insert(record);
    if (dbError) {
      console.error('[Storage] Snapshot uploaded but metadata insert failed:', dbError);
      // Not fatal - the image itself is safely stored either way.
    }

    return { success: true, data: { storagePath, ...record }, error: null };
  } catch (err) {
    console.error('[Storage] uploadAgentSnapshot failed:', err);
    return { success: false, data: null, error: 'Snapshot upload failed.' };
  }
}

/**
 * Get every snapshot for one agent session, in step order - use this to
 * build a step-by-step playback view of what the agent did.
 */
export async function listAgentSessionSnapshots(sessionId) {
  try {
    const { data, error } = await supabase
      .from('agent_session_snapshots')
      .select('*')
      .eq('session_id', sessionId)
      .order('step_index', { ascending: true });

    if (error) {
      return { success: false, data: null, error: error.message };
    }
    return { success: true, data, error: null };
  } catch (err) {
    console.error('[Storage] listAgentSessionSnapshots failed:', err);
    return { success: false, data: null, error: 'Failed to load session snapshots.' };
  }
}

/**
 * Get a temporary signed URL to download/view a file (valid for `expiresIn` seconds).
 * Files are private, so this is the only way to access them outside the app.
 */
export async function getSignedFileUrl(storagePath, expiresIn = 3600) {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: data.signedUrl, error: null };
  } catch (err) {
    console.error('[Storage] getSignedFileUrl failed:', err);
    return { success: false, data: null, error: 'Could not generate file link.' };
  }
}

export async function deleteFile(storagePath, fileId) {
  try {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (storageError) return { success: false, error: storageError.message };

    if (fileId) {
      await supabase.from('files').delete().eq('id', fileId);
    }
    return { success: true, error: null };
  } catch (err) {
    console.error('[Storage] deleteFile failed:', err);
    return { success: false, error: 'Delete failed. Please try again.' };
  }
}

export async function listUserFiles(conversationId = null) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: true, data: [] };

    let query = supabase.from('files').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (conversationId) query = query.eq('conversation_id', conversationId);

    const { data, error } = await query;
    if (error) return { success: false, data: [], error: error.message };
    return { success: true, data: data || [], error: null };
  } catch (err) {
    console.error('[Storage] listUserFiles failed:', err);
    return { success: false, data: [], error: 'Could not load files.' };
  }
}
