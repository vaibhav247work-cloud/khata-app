import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, AlertTriangle, X } from 'lucide-react';
import { type ToastState } from '../../types/common';

interface ToastNotificationProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="global-app-toast"
          initial={{ opacity: 0, y: -28, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[99999] w-[94vw] max-w-md px-2 pointer-events-none"
        >
          <div
            onClick={onDismiss}
            role="alert"
            className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 p-4 rounded-2xl shadow-2xl backdrop-blur-xl border cursor-pointer select-none transition-all group ${
              toast.type === 'success'
                ? 'bg-zinc-950/95 border-emerald-500/50 shadow-emerald-950/50 text-emerald-300'
                : toast.type === 'error'
                  ? 'bg-zinc-950/95 border-rose-500/50 shadow-rose-950/50 text-rose-300'
                  : 'bg-zinc-950/95 border-amber-500/50 shadow-amber-950/50 text-amber-300'
            }`}
          >
            <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
              toast.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : toast.type === 'error'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'info' && <AlertTriangle className="w-5 h-5" />}
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                  toast.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : toast.type === 'error'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {toast.type === 'success' ? 'Success' : toast.type === 'error' ? 'Error' : 'Notice'}
                </span>
                <span className="text-[10px] text-zinc-500 font-medium">Click to dismiss</span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-white leading-snug break-words">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0 -mr-1 -mt-1 cursor-pointer"
              aria-label="Dismiss toast"
            >
              <X className="w-4 h-4" />
            </button>

            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 4, ease: 'linear' }}
              className={`absolute bottom-0 left-0 right-0 h-1 origin-left ${
                toast.type === 'success'
                  ? 'bg-emerald-500'
                  : toast.type === 'error'
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
              }`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
