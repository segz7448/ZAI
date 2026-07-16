/**
 * ZAI - Document Extraction Client
 *
 * Calls the 'extract-document' Supabase Edge Function for PDF/DOCX text
 * extraction (see supabase/functions/extract-document/index.ts for why
 * this happens server-side rather than on-device).
 *
 * Requires the user to be signed in, since it uploads to their private
 * storage folder first. If not signed in, returns a clear error rather
 * than silently failing - PDF/DOCX support is one of the few ZAI features
 * that needs an account.
 */

import { supabase, getCurrentUserId } from '../supabase/client';
import { uploadFile, deleteFile } from '../storage/fileStorage';

/**
 * @param {string} localUri - file:// URI of the PDF or DOCX
 * @param {string} fileName
 * @param {'pdf'|'docx'} fileType
 * @returns {Promise<{success: boolean, text: string, truncated: boolean, error: string|null}>}
 */
export async function extractDocument(localUri, fileName, fileType) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return {
        success: false,
        text: '',
        truncated: false,
        error: 'Reading PDF and Word documents requires signing in, since extraction happens securely on our server. Everything else in ZAI works fully offline.',
      };
    }

    const uploadResult = await uploadFile(localUri, fileName, fileType);
    if (!uploadResult.success) {
      return { success: false, text: '', truncated: false, error: uploadResult.error || 'Upload failed.' };
    }

    const { data, error } = await supabase.functions.invoke('extract-document', {
      body: { storagePath: uploadResult.data.storagePath, fileType },
    });

    // Clean up the uploaded file after extraction - it was only needed
    // transiently for the edge function to read it, not for long-term storage.
    // Best-effort: don't fail the whole operation if cleanup fails.
    deleteFile(uploadResult.data.storagePath, null).catch((cleanupErr) => {
      console.error('[DocumentExtraction] cleanup failed (non-fatal):', cleanupErr);
    });

    if (error) {
      return {
        success: false,
        text: '',
        truncated: false,
        error: `Extraction failed: ${error.message || 'server error'}`,
      };
    }

    if (!data?.success) {
      return { success: false, text: '', truncated: false, error: data?.error || 'Extraction failed.' };
    }

    return {
      success: true,
      text: data.text,
      truncated: !!data.truncated,
      error: null,
    };
  } catch (err) {
    console.error('[DocumentExtraction] extractDocument failed:', err);
    return {
      success: false,
      text: '',
      truncated: false,
      error: 'Something went wrong extracting this document. Please try again.',
    };
  }
}
