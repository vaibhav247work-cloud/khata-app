import React, { useState } from 'react';
import { 
  Download, 
  Share2, 
  PlusSquare, 
  X, 
  Smartphone, 
  CheckCircle2, 
  WifiOff, 
  Wifi, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWAInstall } from '../utils/usePWAInstall';
import { useOnlineStatus } from '../utils/useOnlineStatus';

export const PWAHeaderInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled) return null;
  if (!isInstallable && !isIOS) return null;

  return (
    <>
      <button
        id="header-pwa-install-btn"
        type="button"
        onClick={() => {
          if (isInstallable) {
            install();
          } else if (isIOS) {
            setShowIOSModal(true);
          }
        }}
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer border border-orange-400/30"
        title="Install KhataBook App on your device for offline access"
      >
        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
        <span className="hidden sm:inline">Install App</span>
        <span className="sm:hidden">Install</span>
      </button>

      {/* iOS Safari Installation Guide Modal */}
      <AnimatePresence>
        {showIOSModal && (
          <div 
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowIOSModal(false)}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-base text-white">Install on iPhone / iPad</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSModal(false)}
                  className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-zinc-300">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-white block font-semibold">1. Tap the Share Button</strong>
                    <p className="text-zinc-400 mt-0.5">In Safari's bottom toolbar (or top on iPad), tap the Share icon.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 shrink-0">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-white block font-semibold">2. Select "Add to Home Screen"</strong>
                    <p className="text-zinc-400 mt-0.5">Scroll through the menu options and tap "Add to Home Screen".</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-white block font-semibold">3. Tap "Add"</strong>
                    <p className="text-zinc-400 mt-0.5">KhataBook Pro will install to your home screen for 100% offline access!</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors"
              >
                Got It
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export const PWAFloatingBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('khatabook_pwa_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [showIOSModal, setShowIOSModal] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('khatabook_pwa_banner_dismissed', 'true');
    } catch {}
  };

  if (isInstalled || dismissed) return null;
  if (!isInstallable && !isIOS) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[80]"
        >
          <div className="bg-zinc-900/95 backdrop-blur-md border border-orange-500/40 rounded-3xl p-4 shadow-2xl shadow-black/80 flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-3 min-w-0">
              <img 
                src="/pwa-192x192.png" 
                alt="KhataBook" 
                className="w-11 h-11 rounded-2xl border border-zinc-700/80 shadow-md shrink-0 object-cover bg-zinc-950" 
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-sm text-white truncate">Install KhataBook App</h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    Fast & Offline
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  Works offline without internet, instant load & home screen shortcut
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (isInstallable) {
                    install();
                  } else if (isIOS) {
                    setShowIOSModal(true);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold flex items-center gap-1 shadow-md shadow-orange-600/30 active:scale-95 transition-all cursor-pointer"
              >
                <span>Install</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Dismiss install banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* iOS Modal */}
      {showIOSModal && (
        <div 
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowIOSModal(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-white">Install on iOS</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3">
                <Share2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p>1. Tap the <strong>Share</strong> button in Safari toolbar.</p>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3">
                <PlusSquare className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <p>2. Scroll down and tap <strong>Add to Home Screen</strong>.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineStatusIndicator: React.FC<{ 
  unsyncedCount?: number;
  onSyncNow?: () => void;
  isSyncing?: boolean;
}> = ({ unsyncedCount = 0, onSyncNow, isSyncing = false }) => {
  const { isOnline, justCameOnline } = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className="fixed bottom-4 left-4 z-[85] max-w-sm"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-amber-950/90 border border-amber-500/40 text-amber-300 text-xs shadow-xl backdrop-blur-md">
            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <WifiOff className="w-3.5 h-3.5 animate-pulse" />
            </span>
            <div className="min-w-0 pr-1">
              <span className="font-bold block text-white text-[11px]">Offline Mode Active</span>
              <span className="text-[10px] text-amber-200/80">
                {unsyncedCount > 0 
                  ? `${unsyncedCount} offline change${unsyncedCount !== 1 ? 's' : ''} saved locally`
                  : 'All entries safely cached in local storage'}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {justCameOnline && isOnline && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className="fixed bottom-4 left-4 z-[85] max-w-sm"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-xs shadow-xl backdrop-blur-md">
            <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
              <Wifi className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 pr-1">
              <span className="font-bold block text-white text-[11px]">Back Online!</span>
              <span className="text-[10px] text-emerald-200/80">
                Connected to network
              </span>
            </div>
            {unsyncedCount > 0 && onSyncNow && (
              <button
                type="button"
                onClick={onSyncNow}
                disabled={isSyncing}
                className="ml-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition-colors cursor-pointer"
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
