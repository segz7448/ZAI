/**
 * ZAI Desktop - Save Image (replaces saveImageToGallery.js)
 *
 * There's no "Photos/Gallery" concept on Windows the way Android has one
 * via expo-media-library - the natural desktop equivalent of "save this
 * image somewhere I can find it" is a native Save As dialog, defaulting
 * to the Pictures folder. Same call site contract
 * ({ success, error }) as the original so ImageViewerModal.js's calling
 * code doesn't need to change, only its import.
 */

export async function saveImageToGallery(localPath) {
  try {
    const filename = localPath.split(/[\\/]/).pop() || 'zai-image.jpg';
    const destPath = await window.zaiNative.fs.showSaveDialog({
      title: 'Save Image',
      defaultPath: filename,
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    });

    if (!destPath) {
      return { success: false, error: null }; // user cancelled, not a real error
    }

    await window.zaiNative.fs.copyFile(localPath, destPath);
    return { success: true, error: null };
  } catch (err) {
    console.error('[SaveImage] failed:', err);
    return { success: false, error: 'Could not save this image.' };
  }
}
