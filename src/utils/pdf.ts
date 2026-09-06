import jsPDF from 'jspdf';

let cachedFontBase64: string | null = null;
let fontLoadAttempted = false;

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = (reader.result as string) || '';
      const base64 = result.includes('base64,') ? result.split('base64,')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 1024;
  for (let i = 0; i < len; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return window.btoa(binary);
};

export const loadAppFont = async (doc: jsPDF): Promise<{ fontName: string, cur: string }> => {
  if (cachedFontBase64) {
    try {
      doc.addFileToVFS('Nirmala.ttf', cachedFontBase64);
      doc.addFont('Nirmala.ttf', 'Nirmala', 'normal');
      doc.addFont('Nirmala.ttf', 'Nirmala', 'bold');
      doc.setFont('Nirmala', 'normal');
      return { fontName: 'Nirmala', cur: '₹' };
    } catch {
      return { fontName: 'helvetica', cur: 'Rs. ' };
    }
  }

  if (fontLoadAttempted) {
    return { fontName: 'helvetica', cur: 'Rs. ' };
  }

  fontLoadAttempted = true;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('/fonts/Nirmala.ttf', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        cachedFontBase64 = await blobToBase64(blob);
        if (cachedFontBase64) {
          doc.addFileToVFS('Nirmala.ttf', cachedFontBase64);
          doc.addFont('Nirmala.ttf', 'Nirmala', 'normal');
          doc.addFont('Nirmala.ttf', 'Nirmala', 'bold');
          doc.setFont('Nirmala', 'normal');
          return { fontName: 'Nirmala', cur: '₹' };
        }
      }
    }
  } catch (err) {
    console.warn('Font quick load bypassed:', err);
  }
  return { fontName: 'helvetica', cur: 'Rs. ' };
};

export const downloadBlobFallback = (blob: Blob, filename: string) => {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    }, 1000);
  } catch (err) {
    console.warn('Download fallback error:', err);
  }
};
