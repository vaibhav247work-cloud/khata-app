import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  AlertTriangle,
  MoveHorizontal
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { useBackHandler } from '../utils/backHandler';

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
  const [scale, setScale] = useState<number>(1.0);
  const [basePageWidth, setBasePageWidth] = useState<number>(595.28);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const activeRenderTasksRef = useRef<Map<number, any>>(new Map());
  const isInitialFitDone = useRef<boolean>(false);

  // Touch pinch-to-zoom & double-tap handling
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1.0);
  const lastTapRef = useRef<number>(0);

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

  // Reset initial fit state when document changes
  useEffect(() => {
    isInitialFitDone.current = false;
  }, [previewData?.filename]);

  // Handle Android back button & swipe gestures
  useBackHandler(() => {
    onClose();
    return true;
  }, !!previewData, 100);

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

  // Calculate optimal Fit-Width scale
  const calculateFitWidthScale = useCallback((pageW: number = basePageWidth) => {
    const containerW = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
    // Minimal horizontal padding on mobile (12px) to maximize screen real estate and legibility
    const padding = window.innerWidth < 640 ? 12 : 40;
    const targetW = Math.max(containerW - padding, 280);
    const calculated = Number((targetW / (pageW || 595.28)).toFixed(2));
    return Math.min(Math.max(calculated, 0.45), 3.0);
  }, [basePageWidth]);

  const handleFitWidth = useCallback(() => {
    const newScale = calculateFitWidthScale();
    setScale(newScale);
  }, [calculateFitWidthScale]);

  const handleReadableZoom = useCallback(() => {
    // 1.35x delivers crystal-clear, life-sized readability without shrinking
    setScale(window.innerWidth < 640 ? 1.35 : 1.25);
  }, []);

  // Touch gesture listeners for fluid pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchStartDistRef.current;
      const newScale = Math.min(Math.max(Number((touchStartScaleRef.current * factor).toFixed(2)), 0.5), 3.0);
      setScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Toggle between Fit Width and 1.35x Readable zoom
      const fitScale = calculateFitWidthScale();
      setScale(current => {
        if (Math.abs(current - fitScale) < 0.15) {
          return 1.35; // Zoom in to large readable view
        } else {
          return fitScale; // Reset back to fit width
        }
      });
    }
    lastTapRef.current = now;
  };

  // Load PDF Document safely without detaching buffers
  useEffect(() => {
    if (!previewData || viewMode !== 'canvas') return;

    let isCancelled = false;
    setIsLoadingPdf(true);
    setRenderError(null);
    setPdfDoc(null);
    setNumPages(0);

    const loadDocument = async () => {
      try {
        // Safe helper to obtain a completely independent byte buffer
        // Decoding base64 or slicing ArrayBuffer prevents PDF.js Web Worker from detaching the original buffer
        const getFreshBytes = async (): Promise<Uint8Array> => {
          if (previewData.base64Data) {
            const clean = previewData.base64Data.replace(/^data:application\/pdf;base64,/, '');
            const binary = atob(clean);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
          }

          if (previewData.rawArrayBuffer && previewData.rawArrayBuffer.byteLength > 0) {
            return new Uint8Array(previewData.rawArrayBuffer.slice(0));
          }

          if (previewData.blob) {
            const ab = await previewData.blob.arrayBuffer();
            return new Uint8Array(ab.slice(0));
          }

          throw new Error('No PDF data available');
        };

        let doc: any = null;
        try {
          const bytes = await getFreshBytes();
          const loadingTask = pdfjsLib.getDocument({
            data: bytes,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
          });
          doc = await loadingTask.promise;
        } catch (workerErr) {
          console.warn('Primary worker load failed, trying main-thread fallback:', workerErr);
          if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          }
          const fallbackBytes = await getFreshBytes();
          const fallbackTask = pdfjsLib.getDocument({
            data: fallbackBytes,
          });
          doc = await fallbackTask.promise;
        }

        if (isCancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);

        // Fetch page 1 dimensions to calibrate screen fit
        const firstPage = await doc.getPage(1);
        const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
        const nativeWidth = unscaledViewport.width || 595.28;
        setBasePageWidth(nativeWidth);

        // On first open, auto-fit to full width so it fills the screen perfectly
        if (!isInitialFitDone.current) {
          isInitialFitDone.current = true;
          const initialFit = calculateFitWidthScale(nativeWidth);
          setScale(initialFit);
        }
      } catch (err: any) {
        console.error('PDF.js document load error:', err);
        if (!isCancelled) {
          setRenderError(err?.message || 'Failed to load PDF document');
          setIsLoadingPdf(false);
          setViewMode('frame');
        }
      }
    };

    loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [previewData, viewMode, calculateFitWidthScale]);

  // Render PDF pages onto HTML5 Canvases whenever doc or scale changes
  useEffect(() => {
    if (!pdfDoc || viewMode !== 'canvas' || numPages <= 0) return;

    let isCancelled = false;

    // Cancel any in-flight page render tasks before re-rendering (prevents canvas collisions on zoom)
    activeRenderTasksRef.current.forEach((task) => {
      try {
        task.cancel();
      } catch {}
    });
    activeRenderTasksRef.current.clear();

    const renderPages = async () => {
      try {
        setIsLoadingPdf(true);
        // Small delay to ensure all canvas elements have mounted in the DOM
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (isCancelled) return;

        // Render each page sequentially at high crispness
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (isCancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          if (isCancelled) break;

          const canvas = canvasRefs.current.get(pageNum);
          if (!canvas) continue;

          // Cap devicePixelRatio at 2.5 to save memory on ultra-dense mobile screens while remaining tack-sharp
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
          const viewport = page.getViewport({ scale });

          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            const renderTask = page.render({
              canvasContext: ctx,
              viewport,
              canvas,
            });

            activeRenderTasksRef.current.set(pageNum, renderTask);

            try {
              await renderTask.promise;
            } catch (renderErr: any) {
              if (renderErr?.name === 'RenderingCancelledException') {
                return;
              }
              throw renderErr;
            } finally {
              activeRenderTasksRef.current.delete(pageNum);
            }
          }
        }

        if (!isCancelled) {
          setIsLoadingPdf(false);
        }
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') return;
        console.error('PDF.js canvas render error:', err);
        if (!isCancelled) {
          setRenderError(err?.message || 'Failed to render PDF preview');
          setIsLoadingPdf(false);
          setViewMode('frame');
        }
      }
    };

    renderPages();

    return () => {
      isCancelled = true;
      activeRenderTasksRef.current.forEach((task) => {
        try {
          task.cancel();
        } catch {}
      });
      activeRenderTasksRef.current.clear();
    };
  }, [pdfDoc, numPages, scale, viewMode]);

  if (!previewData) return null;

  const handlePrintShare = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const handled = await onSaveOrShare(
        previewData.base64Data,
        previewData.filename,
        'application/pdf',
        previewData.rawArrayBuffer && previewData.rawArrayBuffer.byteLength > 0
          ? previewData.rawArrayBuffer.slice(0)
          : undefined
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
        className="bg-zinc-900 border-b border-zinc-800 px-2.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 shrink-0 shadow-lg"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0 border border-orange-500/20">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-xs sm:text-base text-zinc-100 truncate leading-tight">
              {previewData.title || 'PDF Preview'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] sm:text-xs text-zinc-400 font-mono truncate max-w-[110px] sm:max-w-xs">
                {previewData.filename}
              </span>
              {numPages > 0 && viewMode === 'canvas' && (
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded border border-zinc-700 shrink-0">
                  {numPages} {numPages === 1 ? 'pg' : 'pgs'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Download PDF Button */}
          <button
            id="pdf-preview-download-btn"
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 hover:text-white border border-zinc-700 transition-all"
            title="Download PDF directly"
          >
            <Download className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Toggle View Mode (Canvas vs Native Object/Iframe) */}
          <button
            type="button"
            onClick={() => setViewMode(m => m === 'canvas' ? 'frame' : 'canvas')}
            className="hidden md:inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title={viewMode === 'canvas' ? "Switch to Embedded Frame" : "Switch to Direct Canvas Viewer"}
          >
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>{viewMode === 'canvas' ? 'Frame' : 'Canvas'}</span>
          </button>

          {/* Open in New Tab */}
          <button
            id="pdf-preview-open-tab-btn"
            type="button"
            onClick={handleOpenInNewTab}
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title="Open in new browser window"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            <span>Open Tab</span>
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
            <span className="hidden sm:inline">Cancel</span>
          </button>
        </div>
      </header>

      {/* Main Viewport */}
      <main 
        id="pdf-preview-viewport" 
        ref={containerRef}
        className="flex-1 w-full h-full bg-zinc-950 relative overflow-auto overscroll-contain flex flex-col items-center py-3 sm:py-6 px-1.5 sm:px-4"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {viewMode === 'canvas' ? (
          /* Canvas-based renderer (Immune to Chrome iframe blocking & sandboxing) */
          <div className="w-full flex-1 flex flex-col items-center">
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

            {/* Generated Page Canvases with gesture support */}
            <div 
              className="w-full flex flex-col items-center gap-4 sm:gap-6 pb-24"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onDoubleClick={handleDoubleTap}
            >
              {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNum) => (
                <div 
                  key={pageNum} 
                  className="relative bg-white shadow-2xl rounded-sm overflow-hidden border border-zinc-800 transition-all select-none"
                  style={{
                    width: 'fit-content',
                    maxWidth: 'none',
                  }}
                >
                  <div className="absolute top-2 right-2 z-10 bg-zinc-900/80 backdrop-blur-xs text-zinc-300 text-[10px] font-mono px-1.5 py-0.5 rounded opacity-60 hover:opacity-100 pointer-events-none">
                    Page {pageNum}
                  </div>
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(pageNum, el);
                      else canvasRefs.current.delete(pageNum);
                    }}
                    className="block"
                    style={{
                      touchAction: 'pan-x pan-y',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Native Object / Iframe Mode */
          <div className="w-full h-full flex-1 flex flex-col relative bg-zinc-900 pb-16">
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
      </main>

      {/* Floating Bottom Toolbar for Zoom & Navigation (Always Accessible on Mobile & Desktop) */}
      {viewMode === 'canvas' && !isLoadingPdf && !renderError && (
        <div 
          id="pdf-preview-bottom-bar"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[160] flex items-center gap-1 sm:gap-2 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 shadow-2xl px-2.5 sm:px-3 py-1.5 rounded-full text-zinc-200 animate-in slide-in-from-bottom-3 duration-200"
        >
          <button
            type="button"
            onClick={() => setScale(s => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
            className="p-1.5 hover:bg-zinc-800 active:scale-90 rounded-full text-zinc-300 hover:text-white transition-all"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={() => {
              const fitW = calculateFitWidthScale();
              if (Math.abs(scale - fitW) < 0.1) {
                setScale(1.35);
              } else {
                handleFitWidth();
              }
            }}
            className="text-xs font-mono px-2 py-1 rounded-md hover:bg-zinc-800 text-zinc-300 font-semibold select-none transition-colors flex items-center gap-1"
            title="Tap to toggle Fit Width / Readable 135%"
          >
            <span>{Math.round(scale * 100)}%</span>
          </button>

          <button
            type="button"
            onClick={() => setScale(s => Math.min(3.0, Number((s + 0.15).toFixed(2))))}
            className="p-1.5 hover:bg-zinc-800 active:scale-90 rounded-full text-zinc-300 hover:text-white transition-all"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-700 mx-0.5" />

          <button
            type="button"
            onClick={handleFitWidth}
            className="text-[11px] sm:text-xs font-medium px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:scale-95 rounded-full text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1"
            title="Fit to Screen Width"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit Width</span>
          </button>

          <button
            type="button"
            onClick={handleReadableZoom}
            className="text-[11px] sm:text-xs font-medium px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:scale-95 rounded-full text-zinc-300 hover:text-white transition-colors flex items-center gap-1"
            title="Readable Text Size (135%)"
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
            <span>Readable</span>
          </button>

          {numPages > 0 && (
            <>
              <div className="h-4 w-px bg-zinc-700 mx-0.5" />
              <span className="text-[11px] font-mono text-zinc-400 px-1 select-none">
                {numPages} {numPages === 1 ? 'pg' : 'pgs'}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
