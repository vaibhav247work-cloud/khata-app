import React, { useEffect, useState, useRef } from 'react';
import { 
  X, 
  Printer, 
  Share2, 
  Download,
  RefreshCw, 
  FileText, 
  ExternalLink, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Layers, 
  AlertTriangle 
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Configure local worker bundled by Vite
if (typeof window !== 'undefined' && pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export interface PdfPreviewData {
  blob: Blob;
  filename: string;
  base64Data: string;
  rawArrayBuffer?: ArrayBuffer;
  title?: string;
}

interface PdfPreviewModalProps {
  previewData: PdfPreviewData | null;
  onClose: () => void;
  onSaveOrShare: (
    base64Data: string,
    filename: string,
    mimeType: string,
    rawArrayBuffer?: ArrayBuffer
  ) => Promise<boolean>;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  previewData,
  onClose,
  onSaveOrShare,
  showToast,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'canvas' | 'frame'>('canvas');
  
  // Canvas rendering state
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Manage Blob URL lifecycle
  useEffect(() => {
    if (previewData?.blob) {
      const url = URL.createObjectURL(previewData.blob);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setBlobUrl(null);
      };
    }
  }, [previewData?.blob]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewData) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewData, onClose]);

  // Render PDF pages onto HTML5 Canvases (completely immune to Chrome iframe blocking & sandboxing)
  useEffect(() => {
    if (!previewData || viewMode !== 'canvas') return;

    let isCancelled = false;
    setIsLoadingPdf(true);
    setRenderError(null);

    const renderDocument = async () => {
      try {
        let arrayBuffer = previewData.rawArrayBuffer;
        if (!arrayBuffer && previewData.blob) {
          arrayBuffer = await previewData.blob.arrayBuffer();
        }

        if (!arrayBuffer) {
          throw new Error('No PDF data available');
        }

        let pdfDoc: any;
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
          });
          pdfDoc = await loadingTask.promise;
        } catch (workerErr) {
          console.warn('Primary worker failed, trying main-thread fallback:', workerErr);
          if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          }
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
          });
          pdfDoc = await loadingTask.promise;
        }

        if (isCancelled) return;

        setNumPages(pdfDoc.numPages);

        // Render each page sequentially
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (isCancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          if (isCancelled) break;

          const canvas = canvasRefs.current.get(pageNum);
          if (!canvas) continue;

          const pixelRatio = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale });

          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            await page.render({
              canvasContext: ctx,
              viewport,
              canvas,
            }).promise;
          }
        }

        if (!isCancelled) {
          setIsLoadingPdf(false);
        }
      } catch (err: any) {
        console.error('PDF.js canvas render error:', err);
        if (!isCancelled) {
          setRenderError(err?.message || 'Failed to render PDF preview');
          setIsLoadingPdf(false);
          // If canvas fails, switch to frame mode
          setViewMode('frame');
        }
      }
    };

    renderDocument();

    return () => {
      isCancelled = true;
    };
  }, [previewData, viewMode, scale]);

  if (!previewData) return null;

  const handlePrintShare = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const handled = await onSaveOrShare(
        previewData.base64Data,
        previewData.filename,
        'application/pdf',
        previewData.rawArrayBuffer
      );

      if (handled && showToast) {
        showToast('Document opened for Print / Share!', 'success');
      }
    } catch (err: any) {
      console.error('Print/Share error:', err);
      if (showToast) {
        showToast('Unable to share or print document. Please try again.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenInNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownload = () => {
    if (!previewData?.blob) return;
    try {
      const url = URL.createObjectURL(previewData.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = previewData.filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }, 200);
      if (showToast) {
        showToast('PDF downloaded successfully!', 'success');
      }
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  return (
    <div 
      id="pdf-preview-modal-root" 
      className="fixed inset-0 z-[150] flex flex-col bg-zinc-950 text-zinc-100 animate-in fade-in duration-200"
    >
      {/* Full-Screen Header Bar */}
      <header 
        id="pdf-preview-header"
        className="bg-zinc-900 border-b border-zinc-800 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 shrink-0 shadow-lg"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0 border border-orange-500/20">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-xs sm:text-base text-zinc-100 truncate leading-tight">
              {previewData.title || 'PDF Preview'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] sm:text-xs text-zinc-400 font-mono truncate max-w-[140px] sm:max-w-xs">
                {previewData.filename}
              </span>
              {numPages > 0 && viewMode === 'canvas' && (
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded border border-zinc-700 shrink-0">
                  {numPages} {numPages === 1 ? 'page' : 'pages'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Zoom controls for canvas view */}
          {viewMode === 'canvas' && !isLoadingPdf && !renderError && (
            <div className="hidden md:flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700 text-zinc-300">
              <button
                type="button"
                onClick={() => setScale(s => Math.max(0.7, s - 0.2))}
                className="p-1.5 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-2 text-zinc-400 select-none">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
                className="p-1.5 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setScale(1.2)}
                className="p-1.5 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                title="Reset Zoom"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Toggle View Mode (Canvas vs Native Object/Iframe) */}
          <button
            type="button"
            onClick={() => setViewMode(m => m === 'canvas' ? 'frame' : 'canvas')}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title={viewMode === 'canvas' ? "Switch to Embedded Frame" : "Switch to Direct Canvas Viewer"}
          >
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>{viewMode === 'canvas' ? 'Frame' : 'Canvas'}</span>
          </button>

          {/* Open in New Tab (Bypasses all iframe security in Chrome) */}
          <button
            id="pdf-preview-open-tab-btn"
            type="button"
            onClick={handleOpenInNewTab}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title="Open in new browser window"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            <span>Open Tab</span>
          </button>

          {/* Download PDF Button */}
          <button
            id="pdf-preview-download-btn"
            type="button"
            onClick={handleDownload}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
            title="Download PDF directly"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>Download</span>
          </button>

          {/* Print / Share Button */}
          <button
            id="pdf-preview-share-btn"
            type="button"
            disabled={isProcessing}
            onClick={handlePrintShare}
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50"
            title="Print or share PDF document"
          >
            {isProcessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Printer className="w-3.5 h-3.5 hidden sm:inline-block" />
                <Share2 className="w-3.5 h-3.5" />
              </>
            )}
            <span>{isProcessing ? 'Opening...' : 'Print / Share'}</span>
          </button>

          {/* Cancel Button */}
          <button
            id="pdf-preview-cancel-btn"
            type="button"
            onClick={onClose}
            className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 hover:text-white font-semibold text-xs sm:text-sm px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl flex items-center gap-1 transition-all border border-zinc-700"
            title="Close preview"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>
      </header>

      {/* Main Viewport */}
      <main 
        id="pdf-preview-viewport" 
        ref={containerRef}
        className="flex-1 w-full h-full bg-zinc-950 relative overflow-auto flex flex-col items-center"
      >
        {viewMode === 'canvas' ? (
          /* Canvas-based renderer (Works inside sandboxed iframes & Chrome with NO blocking) */
          <div className="w-full flex-1 flex flex-col items-center py-6 px-2 sm:px-4 space-y-6">
            {isLoadingPdf && (
              <div className="my-auto flex flex-col items-center justify-center gap-3 text-zinc-400 py-16">
                <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
                <p className="text-sm font-medium">Rendering document preview...</p>
              </div>
            )}

            {renderError && (
              <div className="my-auto max-w-md p-6 bg-red-950/40 border border-red-800/60 rounded-2xl text-center space-y-4">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                <div>
                  <h4 className="font-semibold text-red-200">Unable to render in canvas</h4>
                  <p className="text-xs text-red-400 mt-1">{renderError}</p>
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setViewMode('frame')}
                    className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white"
                  >
                    Try Embedded Frame
                  </button>
                  <button
                    onClick={handleOpenInNewTab}
                    className="text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 rounded-lg text-white"
                  >
                    Open in New Tab
                  </button>
                </div>
              </div>
            )}

            {/* Generated Page Canvases */}
            {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNum) => (
              <div 
                key={pageNum} 
                className="relative bg-white shadow-2xl rounded-sm overflow-hidden transition-transform border border-zinc-800"
              >
                <div className="absolute top-2 right-2 z-10 bg-zinc-900/80 backdrop-blur-xs text-zinc-300 text-[10px] font-mono px-1.5 py-0.5 rounded opacity-60 hover:opacity-100">
                  Page {pageNum}
                </div>
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(pageNum, el);
                    else canvasRefs.current.delete(pageNum);
                  }}
                  className="block mx-auto max-w-full"
                />
              </div>
            ))}
          </div>
        ) : (
          /* Native Object / Iframe Mode */
          <div className="w-full h-full flex-1 flex flex-col relative bg-zinc-900">
            {/* Chrome Notice bar if embedded iframe is blocked */}
            <div className="bg-amber-950/60 border-b border-amber-800/40 px-4 py-2 text-xs text-amber-200/90 flex items-center justify-between gap-3 shrink-0">
              <span className="truncate">
                If Chrome shows <em>"This page has been blocked"</em>, switch to <strong>Canvas</strong> or click <strong>Open in New Tab</strong>.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('canvas')}
                  className="px-2 py-0.5 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium text-[11px]"
                >
                  Switch to Canvas
                </button>
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-medium text-[11px]"
                >
                  Open in New Tab
                </button>
              </div>
            </div>

            {blobUrl && (
              <object
                id="pdf-preview-object"
                data={blobUrl}
                type="application/pdf"
                className="w-full h-full flex-1"
              >
                <iframe
                  id="pdf-preview-iframe"
                  src={blobUrl}
                  title={previewData.filename}
                  className="w-full h-full flex-1 border-0"
                />
              </object>
            )}
          </div>
        )}

        {/* Footer Notice */}
        <footer className="w-full bg-zinc-900/95 border-t border-zinc-800/80 px-4 py-2 text-center text-xs text-zinc-400 shrink-0 flex items-center justify-between sm:justify-center gap-4">
          <span className="hidden sm:inline">
            Reviewing <strong>{previewData.filename}</strong>
          </span>
          <span>
            Click <strong>Print / Share</strong> to trigger the native share dialog or save the file.
          </span>
        </footer>
      </main>
    </div>
  );
};
