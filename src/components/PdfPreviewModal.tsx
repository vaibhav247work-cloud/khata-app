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
  RotateCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  MoveHorizontal,
  Layers,
  Sparkles
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { Capacitor } from '@capacitor/core';
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
  const [isPrintingDirect, setIsPrintingDirect] = useState(false);
  const [viewMode, setViewMode] = useState<'interactive' | 'browser'>('interactive');
  
  // Document state
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [basePageWidth, setBasePageWidth] = useState<number>(595.28);
  const [basePageHeight, setBasePageHeight] = useState<number>(841.89);
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  // High-performance Transform Stage State (GPU Hardware Accelerated)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Refs for tracking gestures & rendering
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const activeRenderTasksRef = useRef<Map<number, any>>(new Map());
  
  // Synchronous refs for smooth 120fps gesture math
  const zoomRef = useRef<number>(1.0);
  zoomRef.current = zoom;
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  panRef.current = pan;

  // Touch gesture refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1.0);
  const touchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mouse drag refs
  const mouseStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const mouseStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Back button handling
  useBackHandler(() => {
    onClose();
    return true;
  }, !!previewData, 100);

  // Keyboard Shortcuts (Standard Document Navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!previewData) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleFitWidth();
      } else if (e.key === '9') {
        e.preventDefault();
        handleFitPage();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRotate();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handleDirectPrint();
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewData, onClose, basePageWidth, basePageHeight, numPages, currentPage]);

  // Calculate Fit-Width scale
  const calculateFitWidthScale = useCallback((pageW: number = basePageWidth) => {
    if (!containerRef.current) return 1.0;
    const containerW = containerRef.current.clientWidth;
    // Mobile gets edge-to-edge padding (16px), desktop gets generous margins (48px)
    const padding = window.innerWidth < 640 ? 16 : 48;
    const targetW = Math.max(containerW - padding, 260);
    const calculated = targetW / (pageW || 595.28);
    return Number(Math.min(Math.max(calculated, 0.4), 3.0).toFixed(3));
  }, [basePageWidth]);

  // Calculate Fit-Page scale (fits entire sheet in view)
  const calculateFitPageScale = useCallback((pageW: number = basePageWidth, pageH: number = basePageHeight) => {
    if (!containerRef.current) return 1.0;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const padX = window.innerWidth < 640 ? 20 : 64;
    const padY = window.innerWidth < 640 ? 30 : 64;
    const scaleX = (containerW - padX) / (pageW || 595.28);
    const scaleY = (containerH - padY) / (pageH || 841.89);
    const calculated = Math.min(scaleX, scaleY);
    return Number(Math.min(Math.max(calculated, 0.35), 2.5).toFixed(3));
  }, [basePageWidth, basePageHeight]);

  const handleFitWidth = useCallback(() => {
    const targetScale = calculateFitWidthScale();
    setZoom(targetScale);
    setPan({ x: 0, y: 20 });
  }, [calculateFitWidthScale]);

  const handleFitPage = useCallback(() => {
    const targetScale = calculateFitPageScale();
    setZoom(targetScale);
    setPan({ x: 0, y: 20 });
  }, [calculateFitPageScale]);

  const handleZoomIn = useCallback(() => {
    setZoom(current => Number(Math.min(current + 0.25, 4.0).toFixed(2)));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(current => Number(Math.max(current - 0.25, 0.35).toFixed(2)));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(r => (r + 90) % 360);
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(p => {
      const next = Math.min(p + 1, numPages);
      if (next !== p && containerRef.current) {
        // Pan smoothly to the target page offset
        const pageYOffset = (next - 1) * (basePageHeight + 24) * zoomRef.current;
        setPan(prev => ({ ...prev, y: -pageYOffset + 20 }));
      }
      return next;
    });
  }, [numPages, basePageHeight]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage(p => {
      const prev = Math.max(p - 1, 1);
      if (prev !== p && containerRef.current) {
        const pageYOffset = (prev - 1) * (basePageHeight + 24) * zoomRef.current;
        setPan(current => ({ ...current, y: -pageYOffset + 20 }));
      }
      return prev;
    });
  }, [basePageHeight]);

  // Double-tap zoom toggler: zooms directly to tapped point
  const handleDoubleTap = useCallback((tapX: number, tapY: number) => {
    if (!containerRef.current) return;
    const fitWidth = calculateFitWidthScale();
    const currentZoom = zoomRef.current;
    const isNearFit = Math.abs(currentZoom - fitWidth) < 0.2;

    if (isNearFit) {
      // Zoom into 2.2x centered on the tapped point
      const targetZoom = Math.min(fitWidth * 2.2, 3.5);
      const centerX = containerRef.current.clientWidth / 2;
      const xLocal = (tapX - centerX - panRef.current.x) / currentZoom;
      const yLocal = (tapY - panRef.current.y) / currentZoom;

      const newPanX = (tapX - centerX) - xLocal * targetZoom;
      const newPanY = tapY - yLocal * targetZoom;

      setZoom(Number(targetZoom.toFixed(2)));
      setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
    } else {
      // Reset back to Fit Width
      handleFitWidth();
    }
  }, [calculateFitWidthScale, handleFitWidth]);

  // Load PDF Document safely without detaching buffers
  useEffect(() => {
    if (!previewData || viewMode !== 'interactive') return;

    let isCancelled = false;
    setIsLoadingPdf(true);
    setRenderError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    const loadDocument = async () => {
      try {
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

        // Fetch page 1 dimensions
        const firstPage = await doc.getPage(1);
        const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
        const nativeW = unscaledViewport.width || 595.28;
        const nativeH = unscaledViewport.height || 841.89;
        setBasePageWidth(nativeW);
        setBasePageHeight(nativeH);

        // Fit to width initially
        const containerW = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
        const padding = window.innerWidth < 640 ? 16 : 48;
        const targetW = Math.max(containerW - padding, 260);
        const initialFit = Number(Math.min(Math.max(targetW / nativeW, 0.4), 3.0).toFixed(3));
        
        setZoom(initialFit);
        setPan({ x: 0, y: 20 });
      } catch (err: any) {
        console.error('PDF.js document load error:', err);
        if (!isCancelled) {
          setRenderError(err?.message || 'Failed to load PDF document');
          setIsLoadingPdf(false);
          setViewMode('browser');
        }
      }
    };

    loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [previewData, viewMode]);

  // High-DPI Canvas Rendering: Renders once at high resolution, eliminating blurriness on pinch zoom
  useEffect(() => {
    if (!pdfDoc || viewMode !== 'interactive' || numPages <= 0) return;

    let isCancelled = false;

    // Cancel previous renders
    activeRenderTasksRef.current.forEach((task) => {
      try {
        task.cancel();
      } catch {}
    });
    activeRenderTasksRef.current.clear();

    const renderPages = async () => {
      try {
        setIsLoadingPdf(true);
        // Small delay to ensure all canvas elements have mounted
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (isCancelled) return;

        // Render each page at 2.0x - 2.5x retina density for razor-sharp vector clarity
        const dpr = window.devicePixelRatio || 1;
        const renderScale = Math.min(dpr * 1.5, 3.0);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (isCancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          if (isCancelled) break;

          const canvas = canvasRefs.current.get(pageNum);
          if (!canvas) continue;

          const baseViewport = page.getViewport({ scale: 1.0 });
          const highDpiViewport = page.getViewport({ scale: renderScale });

          canvas.width = Math.floor(highDpiViewport.width);
          canvas.height = Math.floor(highDpiViewport.height);
          canvas.style.width = `${Math.floor(baseViewport.width)}px`;
          canvas.style.height = `${Math.floor(baseViewport.height)}px`;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            const renderTask = page.render({
              canvasContext: ctx,
              viewport: highDpiViewport,
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
          setRenderError(err?.message || 'Failed to render document preview');
          setIsLoadingPdf(false);
          setViewMode('browser');
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
  }, [pdfDoc, numPages, viewMode]);

  // Standard Non-Passive Touch & Trackpad/Mouse-Wheel Gestures
  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewMode !== 'interactive') return;

    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

    // Helper: Update page indicator based on pan position
    const updateCurrentPageFromPan = (currentPanY: number, currentZoom: number) => {
      const pageSpan = (basePageHeight + 24) * currentZoom;
      const index = Math.floor((-currentPanY + container.clientHeight / 3) / pageSpan);
      const detected = clamp(index + 1, 1, numPages || 1);
      setCurrentPage(detected);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        setIsInteracting(true);
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        touchStartDistRef.current = dist;
        touchStartZoomRef.current = zoomRef.current;
        touchStartPanRef.current = { ...panRef.current };

        const rect = container.getBoundingClientRect();
        touchCenterRef.current = {
          x: (t1.clientX + t2.clientX) / 2 - rect.left,
          y: (t1.clientY + t2.clientY) / 2 - rect.top,
        };
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        lastTouchPosRef.current = { x: t.clientX, y: t.clientY };
        touchStartPanRef.current = { ...panRef.current };

        // Check for double-tap
        const now = Date.now();
        const distFromLastTap = Math.hypot(
          t.clientX - lastTapPosRef.current.x,
          t.clientY - lastTapPosRef.current.y
        );

        if (now - lastTapTimeRef.current < 300 && distFromLastTap < 30) {
          e.preventDefault();
          const rect = container.getBoundingClientRect();
          const tapX = t.clientX - rect.left;
          const tapY = t.clientY - rect.top;
          handleDoubleTap(tapX, tapY);
        }

        lastTapTimeRef.current = now;
        lastTapPosRef.current = { x: t.clientX, y: t.clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDistRef.current !== null) {
        e.preventDefault();
        setIsInteracting(true);
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const factor = dist / touchStartDistRef.current;
        const newZoom = clamp(touchStartZoomRef.current * factor, 0.35, 4.0);

        const rect = container.getBoundingClientRect();
        const cx = touchCenterRef.current.x;
        const cy = touchCenterRef.current.y;
        const centerX = rect.width / 2;

        // Keep point under fingers stationary
        const xLocal = (cx - centerX - touchStartPanRef.current.x) / touchStartZoomRef.current;
        const yLocal = (cy - touchStartPanRef.current.y) / touchStartZoomRef.current;

        const newPanX = (cx - centerX) - xLocal * newZoom;
        const newPanY = cy - yLocal * newZoom;

        setZoom(Number(newZoom.toFixed(3)));
        setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
        updateCurrentPageFromPan(newPanY, newZoom);
      } else if (e.touches.length === 1 && lastTouchPosRef.current) {
        // Drag panning on single touch
        e.preventDefault();
        setIsInteracting(true);
        const t = e.touches[0];
        const dx = t.clientX - lastTouchPosRef.current.x;
        const dy = t.clientY - lastTouchPosRef.current.y;
        lastTouchPosRef.current = { x: t.clientX, y: t.clientY };

        const newPan = {
          x: panRef.current.x + dx,
          y: panRef.current.y + dy,
        };
        setPan(newPan);
        updateCurrentPageFromPan(newPan.y, zoomRef.current);
      }
    };

    const handleTouchEnd = () => {
      touchStartDistRef.current = null;
      lastTouchPosRef.current = null;
      setIsInteracting(false);
    };

    // Trackpad Pinch (Ctrl+Wheel) & Mouse Scroll Handling
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const centerX = rect.width / 2;

      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch-to-zoom or Ctrl + Wheel Zoom
        setIsInteracting(true);
        const zoomDelta = -e.deltaY * 0.008;
        const factor = Math.exp(zoomDelta);
        const newZoom = clamp(zoomRef.current * factor, 0.35, 4.0);

        const xLocal = (cx - centerX - panRef.current.x) / zoomRef.current;
        const yLocal = (cy - panRef.current.y) / zoomRef.current;

        const newPanX = (cx - centerX) - xLocal * newZoom;
        const newPanY = cy - yLocal * newZoom;

        setZoom(Number(newZoom.toFixed(3)));
        setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
        updateCurrentPageFromPan(newPanY, newZoom);

        setTimeout(() => setIsInteracting(false), 50);
      } else {
        // Normal Scroll
        const newPanY = panRef.current.y - e.deltaY;
        const newPanX = panRef.current.x - e.deltaX;
        setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
        updateCurrentPageFromPan(newPanY, zoomRef.current);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [viewMode, basePageHeight, numPages, handleDoubleTap]);

  // Desktop Mouse Drag Pan (Click & Drag)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left-click only
    mouseStartPosRef.current = { x: e.clientX, y: e.clientY };
    mouseStartPanRef.current = { ...panRef.current };
    setIsDragging(true);
    setIsInteracting(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseStartPosRef.current || !isDragging) return;
    const dx = e.clientX - mouseStartPosRef.current.x;
    const dy = e.clientY - mouseStartPosRef.current.y;
    setPan({
      x: mouseStartPanRef.current.x + dx,
      y: mouseStartPanRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    mouseStartPosRef.current = null;
    setIsDragging(false);
    setIsInteracting(false);
  };

  if (!previewData) return null;

  // DIRECT BROWSER NATIVE PRINT: Launches printer dialog directly!
  const handleDirectPrint = () => {
    if (isPrintingDirect) return;
    setIsPrintingDirect(true);

    // 1. Android Capacitor / Native Mobile: uses Capacitor Share/Print Provider
    if (Capacitor.isNativePlatform()) {
      handlePrintShare();
      setIsPrintingDirect(false);
      return;
    }

    // 2. Web Browser: Launch official native print dialog via hidden iframe
    if (blobUrl) {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);

        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (printErr) {
            console.warn('Iframe print error, falling back to window.open', printErr);
            window.open(blobUrl, '_blank');
          }
          setTimeout(() => {
            try {
              document.body.removeChild(iframe);
            } catch {}
            setIsPrintingDirect(false);
          }, 60000);
        };
      } catch (err) {
        console.error('Print initiation error:', err);
        window.open(blobUrl, '_blank');
        setIsPrintingDirect(false);
      }
    } else {
      setIsPrintingDirect(false);
    }
  };

  // Share / Save helper
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
        showToast('Document ready for Share / Print!', 'success');
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
      className="fixed inset-0 z-[150] flex flex-col bg-zinc-950 text-zinc-100 select-none animate-in fade-in duration-200"
    >
      {/* Top Header Bar */}
      <header 
        id="pdf-preview-header"
        className="bg-zinc-900 border-b border-zinc-800 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 shrink-0 shadow-lg z-20"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0 border border-orange-500/20">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-xs sm:text-base text-zinc-100 truncate leading-tight flex items-center gap-1.5">
              <span>{previewData.title || 'Print Preview'}</span>
              <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-normal text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                <Sparkles className="w-2.5 h-2.5" /> Pinch Zoom Ready
              </span>
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] sm:text-xs text-zinc-400 font-mono truncate max-w-[120px] sm:max-w-xs">
                {previewData.filename}
              </span>
              {numPages > 0 && (
                <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.2 rounded border border-zinc-700 shrink-0 font-medium">
                  {numPages} {numPages === 1 ? 'Page' : 'Pages'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Action Controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Direct Print Button */}
          <button
            id="pdf-preview-direct-print-btn"
            type="button"
            disabled={isPrintingDirect}
            onClick={handleDirectPrint}
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 cursor-pointer"
            title="Print directly using browser or native printer dialog"
          >
            {isPrintingDirect ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span>{isPrintingDirect ? 'Printing...' : 'Print'}</span>
          </button>

          {/* Share Button (Web Share / Native Sheet) */}
          <button
            id="pdf-preview-share-btn"
            type="button"
            disabled={isProcessing}
            onClick={handlePrintShare}
            className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 hover:text-white font-semibold text-xs sm:text-sm px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl flex items-center gap-1.5 transition-all border border-zinc-700 cursor-pointer"
            title="Share via WhatsApp, Email, or other apps"
          >
            {isProcessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Share2 className="w-3.5 h-3.5 text-orange-400" />
            )}
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Download PDF Button */}
          <button
            id="pdf-preview-download-btn"
            type="button"
            onClick={handleDownload}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 hover:text-white border border-zinc-700 transition-all flex items-center gap-1.5 text-xs font-semibold"
            title="Save / Download PDF to device"
          >
            <Download className="w-4 h-4 text-zinc-300" />
            <span className="hidden md:inline">Download</span>
          </button>

          {/* Open in Browser Tab / Switch View Mode */}
          <button
            id="pdf-preview-tab-btn"
            type="button"
            onClick={handleOpenInNewTab}
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
            title="Open in new browser tab with browser native controls"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            <span>Open Tab</span>
          </button>

          {/* Close Modal Button */}
          <button
            id="pdf-preview-close-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 hover:text-white border border-zinc-700 transition-all ml-1"
            title="Close preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Interactive Viewport */}
      <main 
        id="pdf-preview-viewport" 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="flex-1 w-full h-full bg-zinc-950 relative overflow-hidden select-none touch-none cursor-default"
      >
        {viewMode === 'interactive' ? (
          <>
            {/* Loading Spinner */}
            {isLoadingPdf && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 backdrop-blur-xs z-30 text-zinc-400">
                <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
                <p className="text-sm font-medium">Preparing high-definition document preview...</p>
                <p className="text-xs text-zinc-500">Supports fluid 2-finger pinch zoom, double-tap, and trackpad scroll</p>
              </div>
            )}

            {/* Error Display */}
            {renderError && (
              <div className="absolute inset-0 flex items-center justify-center z-30 p-4">
                <div className="max-w-md p-6 bg-red-950/40 border border-red-800/60 rounded-2xl text-center space-y-4">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                  <div>
                    <h4 className="font-semibold text-red-200">Interactive Canvas Notice</h4>
                    <p className="text-xs text-red-400 mt-1">{renderError}</p>
                  </div>
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => setViewMode('browser')}
                      className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white"
                    >
                      Use Native Frame
                    </button>
                    <button
                      onClick={handleOpenInNewTab}
                      className="text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 rounded-lg text-white"
                    >
                      Open in New Tab
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Transform Stage (Buttery 120 FPS GPU Rendered) */}
            <div 
              id="pdf-interactive-stage"
              ref={stageRef}
              className="absolute inset-0 flex flex-col items-center gap-6 py-6 px-4"
              style={{
                transformOrigin: 'top center',
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
                transition: isInteracting ? 'none' : 'transform 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: isDragging ? 'grabbing' : zoom > 1.0 ? 'grab' : 'default',
              }}
            >
              {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNum) => (
                <div 
                  key={pageNum} 
                  id={`pdf-page-container-${pageNum}`}
                  className="relative bg-white shadow-2xl rounded-sm overflow-hidden border border-zinc-800 transition-shadow select-none shrink-0"
                  style={{
                    width: `${basePageWidth}px`,
                    height: `${basePageHeight}px`,
                  }}
                >
                  {/* Floating Page Badge */}
                  <div className="absolute top-2.5 right-2.5 z-10 bg-zinc-900/80 backdrop-blur-xs text-zinc-300 text-[10px] font-mono px-2 py-0.5 rounded-md opacity-70 hover:opacity-100 pointer-events-none border border-zinc-700/60">
                    Page {pageNum} of {numPages}
                  </div>

                  {/* HTML5 Canvas with High-DPI Vector Crispness */}
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(pageNum, el);
                      else canvasRefs.current.delete(pageNum);
                    }}
                    className="block w-full h-full"
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Native Embedded Frame Fallback */
          <div className="w-full h-full flex flex-col bg-zinc-900 pb-16">
            <div className="bg-amber-950/60 border-b border-amber-800/40 px-4 py-2 text-xs text-amber-200/90 flex items-center justify-between gap-3 shrink-0">
              <span className="truncate">
                Viewing via browser embedded frame. Switch back anytime for pinch-to-zoom.
              </span>
              <button
                type="button"
                onClick={() => setViewMode('interactive')}
                className="px-2.5 py-0.5 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium text-[11px] shrink-0"
              >
                Interactive Pinch Viewer
              </button>
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

      {/* Floating Bottom Toolbar for Zoom, Fit, Rotation & Page Navigation */}
      {viewMode === 'interactive' && !isLoadingPdf && !renderError && (
        <div 
          id="pdf-preview-bottom-bar"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[160] flex items-center gap-1 sm:gap-1.5 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 shadow-2xl px-2 sm:px-3 py-1.5 rounded-full text-zinc-200 animate-in slide-in-from-bottom-3 duration-200 max-w-[95vw] overflow-x-auto"
        >
          {/* Multi-Page Navigation Stepper */}
          {numPages > 1 && (
            <>
              <button
                id="pdf-prev-page-btn"
                type="button"
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                className="p-1 hover:bg-zinc-800 active:scale-90 rounded-full text-zinc-300 hover:text-white disabled:opacity-30 transition-all"
                title="Previous Page (Up Arrow)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-[11px] font-mono text-zinc-300 font-semibold px-1 select-none shrink-0">
                {currentPage}/{numPages}
              </span>

              <button
                id="pdf-next-page-btn"
                type="button"
                onClick={handleNextPage}
                disabled={currentPage >= numPages}
                className="p-1 hover:bg-zinc-800 active:scale-90 rounded-full text-zinc-300 hover:text-white disabled:opacity-30 transition-all"
                title="Next Page (Down Arrow)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-zinc-700 mx-0.5 shrink-0" />
            </>
          )}

          {/* Zoom Out Button */}
          <button
            id="pdf-zoom-out-btn"
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-zinc-800 active:scale-90 rounded-full text-zinc-300 hover:text-white transition-all shrink-0"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          
          {/* Zoom Percentage Pill - Click to toggle 100% / Fit Width */}
          <button
            id="pdf-zoom-level-indicator"
            type="button"
            onClick={() => {
              const fitW = calculateFitWidthScale();
              if (Math.abs(zoom - fitW) < 0.1) {
                setZoom(1.5);
                setPan({ x: 0, y: 20 });
              } else {
                handleFitWidth();
              }
            }}
            className="text-xs font-mono px-2 py-1 rounded-lg hover:bg-zinc-800 text-zinc-200 font-semibold select-none transition-colors shrink-0"
            title="Tap to toggle Fit Width / 150%"
          >
            <span>{Math.round(zoom * 100)}%</span>
          </button>

          {/* Zoom In Button */}
          <button
            id="pdf-zoom-in-btn"
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-zinc-800 active:scale-90 rounded-full text-zinc-300 hover:text-white transition-all shrink-0"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-700 mx-0.5 shrink-0" />

          {/* Fit Width Action */}
          <button
            id="pdf-fit-width-btn"
            type="button"
            onClick={handleFitWidth}
            className="text-[11px] sm:text-xs font-medium px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 active:scale-95 rounded-full text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1 shrink-0"
            title="Fit to screen width (0)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fit Width</span>
          </button>

          {/* Fit Page Action */}
          <button
            id="pdf-fit-page-btn"
            type="button"
            onClick={handleFitPage}
            className="text-[11px] sm:text-xs font-medium px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 active:scale-95 rounded-full text-zinc-300 hover:text-white transition-colors flex items-center gap-1 shrink-0"
            title="Fit entire sheet on screen (9)"
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fit Page</span>
          </button>

          {/* Rotate Document Action */}
          <button
            id="pdf-rotate-btn"
            type="button"
            onClick={handleRotate}
            className="p-1.5 hover:bg-zinc-800 active:scale-90 rounded-full text-zinc-300 hover:text-white transition-all shrink-0"
            title="Rotate 90° clockwise (R)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Frame/Browser Toggle (Desktop) */}
          <button
            type="button"
            onClick={() => setViewMode(m => m === 'interactive' ? 'browser' : 'interactive')}
            className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors shrink-0"
            title="Switch to Browser Built-in PDF Frame"
          >
            <Layers className="w-3 h-3" />
            <span>Frame</span>
          </button>
        </div>
      )}
    </div>
  );
};
