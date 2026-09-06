import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { checkAppStoragePermission } from './permissions';
import { downloadBlobFallback } from './pdf';

export const saveOrShareReport = async (
  base64Data: string, 
  filename: string, 
  mimeType: string,
  rawArrayBuffer?: ArrayBuffer,
  showToast?: (msg: string, type: 'success' | 'error') => void
): Promise<boolean> => {
  const cleanBase64 = base64Data.includes('base64,')
    ? base64Data.split('base64,')[1]
    : base64Data;

  // 1. Native Capacitor Android & iOS
  if (Capacitor.isNativePlatform()) {
    try {
      // Step 1: Write directly to Cache directory (100% private to app, requires NO runtime storage permissions)
      let fileUri = '';
      try {
        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: cleanBase64,
          directory: Directory.Cache,
          recursive: true,
        });
        
        try {
          const uriResult = await Filesystem.getUri({
            directory: Directory.Cache,
            path: filename,
          });
          fileUri = uriResult.uri || writeResult.uri || '';
        } catch {
          fileUri = writeResult.uri || '';
        }
      } catch (cacheErr) {
        console.warn('Cache write error, attempting Data directory:', cacheErr);
        try {
          const dataWrite = await Filesystem.writeFile({
            path: filename,
            data: cleanBase64,
            directory: Directory.Data,
            recursive: true,
          });
          fileUri = dataWrite.uri || '';
        } catch (dataErr) {
          console.warn('Data directory write failed:', dataErr);
        }
      }

      // Step 2: Background copy to Documents directory if storage permission is already granted
      try {
        const hasPerm = await checkAppStoragePermission();
        if (hasPerm) {
          Filesystem.writeFile({
            path: filename,
            data: cleanBase64,
            directory: Directory.Documents,
            recursive: true,
          }).catch((e) => console.warn('Documents directory background copy:', e));
        }
      } catch {}

      // Step 3: Open Native Android System Share & Print Dialog
      if (fileUri) {
        const validFileUri = fileUri.startsWith('file:') ? fileUri : `file://${fileUri}`;
        try {
          await Share.share({
            title: filename,
            text: `KhataBook: ${filename}`,
            files: [validFileUri],
            dialogTitle: `Share or Print ${filename}`,
          });
          return true;
        } catch (shareErr: any) {
          const errStr = String(shareErr?.message || '').toLowerCase();
          if (
            errStr.includes('cancel') || 
            errStr.includes('dismiss') || 
            errStr.includes('abort') || 
            errStr.includes('user cancelled') ||
            errStr.includes('share canceled')
          ) {
            // User intentionally closed the sheet
            return true;
          }
          // Fallback share with URL parameter
          try {
            await Share.share({
              title: filename,
              url: validFileUri,
              dialogTitle: `Share ${filename}`,
            });
            return true;
          } catch (shareFallbackErr: any) {
            console.warn('Share sheet fallback failed:', shareFallbackErr);
          }
        }
      }

      return false;
    } catch (err: any) {
      console.warn('Native file share/save error:', err);
      return false;
    }
  }

  // 2. Web / Mobile Browser Fallback
  try {
    let blob: Blob;
    if (rawArrayBuffer) {
      blob = new Blob([rawArrayBuffer], { type: mimeType });
    } else {
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: mimeType });
    }

    // Trigger device browser download
    downloadBlobFallback(blob, filename);

    // If Mobile Web Share is supported, also prompt share sheet
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({
            title: filename,
            text: `KhataBook: ${filename}`,
            files: [file],
          });
        }
      } catch {}
    }

    return true;
  } catch (webErr) {
    console.error('Web save/share error:', webErr);
    return false;
  }
};
