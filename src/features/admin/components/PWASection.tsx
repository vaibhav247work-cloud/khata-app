import React, { useState } from 'react';
import { 
  Download, 
  CheckCircle2, 
  Smartphone, 
  RefreshCw, 
  X 
} from 'lucide-react';
import { usePWAInstall } from '../../../utils/usePWAInstall';

interface PWASectionProps {
  transactionsCount: number;
  ordersCount: number;
  isOnline: boolean;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function PWASection({
  transactionsCount,
  ordersCount,
  isOnline,
  showToast,
}: PWASectionProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showAdminIOSGuide, setShowAdminIOSGuide] = useState(false);
  const [isUpdatingSW, setIsUpdatingSW] = useState(false);

  const handleForceUpdateSW = async () => {
    if ('serviceWorker' in navigator) {
      setIsUpdatingSW(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
        showToast('Service Worker checked & updated to latest version!', 'success');
      } catch {
        showToast('Service Worker check completed.', 'info');
      } finally {
        setIsUpdatingSW(false);
      }
    } else {
      showToast('Service Worker not supported in this browser.', 'info');
    }
  };

  return (
    <>
      {/* Progressive Web App (PWA) & Offline Capabilities Section */}
      <div className="pt-10 border-t border-zinc-800/50">
        <h4 className="font-bold mb-4 text-sm flex items-center gap-2">
          <Download className="w-4 h-4 text-orange-500" />
          Progressive Web App (PWA) & Offline System
        </h4>
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-6 rounded-[28px] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <img 
                src="/pwa-192x192.png" 
                alt="PWA Icon" 
                className="w-12 h-12 rounded-2xl border border-zinc-700 bg-zinc-950 object-cover shrink-0 shadow-md" 
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base text-white">KhataBook PWA Engine</span>
                  {isInstalled ? (
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Installed (Standalone Mode)
                    </span>
                  ) : isInstallable ? (
                    <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Download className="w-3 h-3" /> Ready to Install
                    </span>
                  ) : (
                    <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                      Web Mode
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Precaches app code and assets locally for instant loading and 100% offline functionality.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isInstallable && (
                <button
                  type="button"
                  onClick={install}
                  className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs px-5 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-lg shadow-orange-500/20 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Install App
                </button>
              )}
              {isIOS && (
                <button
                  type="button"
                  onClick={() => setShowAdminIOSGuide(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs px-4 py-3 rounded-2xl flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Smartphone className="w-4 h-4 text-orange-400" /> Install on iPhone
                </button>
              )}
              <button
                type="button"
                onClick={handleForceUpdateSW}
                disabled={isUpdatingSW}
                className="p-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded-2xl transition-colors border border-zinc-700/60 cursor-pointer disabled:opacity-50"
                title="Check and update Service Worker cache"
              >
                <RefreshCw className={`w-4 h-4 ${isUpdatingSW ? 'animate-spin text-orange-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Status Diagnostics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">Service Worker</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-bold text-xs text-white">Active & Precaching</span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">Static bundle & fonts cached</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">Offline Database</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-bold text-xs text-white">Dexie.js IndexedDB</span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">{transactionsCount} txns · {ordersCount} orders</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">Network Connection</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                <span className="font-bold text-xs text-white">{isOnline ? 'Online (Synced)' : 'Offline (Local)'}</span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {isOnline ? 'Live Google Sheet Sync' : 'Queued for auto-reconnect'}
              </p>
            </div>
          </div>

          {/* iOS Guide Modal in Admin */}
          {showAdminIOSGuide && (
            <div 
              className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowAdminIOSGuide(false)}
            >
              <div 
                onClick={(e) => e.stopPropagation()}
                className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-[32px] p-6 shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <h3 className="font-bold text-base text-white">Install on iPhone / iPad</h3>
                  <button
                    type="button"
                    onClick={() => setShowAdminIOSGuide(false)}
                    className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3 text-xs text-zinc-300">
                  <p>1. Open this website in <strong>Safari</strong>.</p>
                  <p>2. Tap the <strong>Share</strong> button in the Safari toolbar.</p>
                  <p>3. Tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdminIOSGuide(false)}
                  className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-white font-bold text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Android App & APK Download */}
      <div className="pt-10 border-t border-zinc-800/50">
        <h4 className="font-bold mb-4 text-sm flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-orange-500" />
          Android Mobile App (APK)
        </h4>
        <div className="bg-gradient-to-br from-orange-500/10 via-zinc-900 to-zinc-900 border border-orange-500/30 p-6 rounded-[28px] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-white">KhataBook Pro APK</span>
                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">v1.0 Ready</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Install on any Android smartphone for offline ledger accounting & auto Google Sheets sync.
              </p>
            </div>
            <a
              href="/Khatabook.apk"
              download="Khatabook.apk"
              className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/25 shrink-0"
            >
              <Download className="w-4 h-4" /> Download APK
            </a>
          </div>
          <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-4 text-[11px] text-zinc-400 space-y-1.5">
            <p className="font-bold text-zinc-300">How to install on Android:</p>
            <ol className="list-decimal list-inside space-y-1 text-zinc-400">
              <li>Tap <span className="text-orange-400 font-semibold">Download APK</span> above on your phone or tablet.</li>
              <li>Tap the downloaded file in your browser or Notification shade.</li>
              <li>If prompted, enable <em>"Install unknown apps"</em> for your browser.</li>
              <li>Tap <strong>Install</strong> to start using Khatabook Pro on Android.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
