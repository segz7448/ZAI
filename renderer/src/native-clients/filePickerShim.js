/**
 * ZAI Desktop - File/Image Picker Shim
 *
 * Replaces expo-image-picker + expo-document-picker's usage in
 * ChatScreen.js. A PC has no camera roll/gallery concept and (usually) no
 * built-in camera the way a phone does, so "Photos" and "Files" both
 * collapse into one native Open File dialog here, filtered by type;
 * "Camera" has no direct desktop equivalent and is handled as a graceful
 * no-op with a message (most desktops don't have a camera wired into a
 * photo workflow the way phones do - webcam capture would be a separate,
 * bigger feature, not a drop-in swap).
 *
 * Files are read and returned as a data: URI (base64-encoded) rather than
 * a file:// path, since react-native-web's <Image> and the chat bubble's
 * attachment preview already expect a `uri` string they can hand straight
 * to an <img>/Image src - a data URI works there with zero renderer-side
 * changes, unlike a file:// path which Electron's default CSP would block.
 */

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

function mimeTypeForExtension(ext) {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', json: 'application/json',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

async function pickAndReadFile({ imageOnly = false } = {}) {
  const filters = imageOnly
    ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
    : [{ name: 'All Files', extensions: ['*'] }];

  const paths = await window.zaiNative.fs.showOpenDialog({
    title: imageOnly ? 'Choose an image' : 'Choose a file',
    properties: ['openFile'],
    filters,
  });

  if (!paths.length) return { canceled: true, assets: null };

  const filePath = paths[0];
  const name = filePath.split(/[\\/]/).pop();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  const mimeType = mimeTypeForExtension(ext);

  const base64 = await window.zaiNative.fs.readFile(filePath, 'base64');
  const stat = await window.zaiNative.fs.stat(filePath);

  return {
    canceled: false,
    assets: [{
      uri: `data:${mimeType};base64,${base64}`,
      name,
      fileName: name,
      mimeType,
      size: stat?.size,
      fileSize: stat?.size,
    }],
  };
}

// ---- ImagePicker-shaped exports ----
export const MediaTypeOptions = { Images: 'Images', All: 'All' };

export async function requestCameraPermissionsAsync() {
  // No desktop camera capture flow wired up (see file header) - reported
  // as ungranted so ChatScreen.js's existing "enable access" messaging
  // path is used verbatim rather than needing a new UI state.
  return { granted: false };
}

export async function launchCameraAsync() {
  return { canceled: true, assets: null };
}

export async function requestMediaLibraryPermissionsAsync() {
  // No OS-level permission gate for local file access on desktop - always
  // granted, so handlePhotos() proceeds straight to the picker.
  return { granted: true };
}

export async function launchImageLibraryAsync() {
  return pickAndReadFile({ imageOnly: true });
}

// ---- DocumentPicker-shaped export ----
export async function getDocumentAsync() {
  return pickAndReadFile({ imageOnly: false });
}
