import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, Download, FileCode, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE } from '../utils/googleAppsScriptCode';
import { useBackHandler } from '../utils/backHandler';

interface GoogleAppsScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const GoogleAppsScriptModal: React.FC<GoogleAppsScriptModalProps> = ({
  isOpen,
  onClose,
  showToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);

  useBackHandler(() => {
    onClose();
    return true;
  }, isOpen, 60);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = GOOGLE_APPS_SCRIPT_CODE;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      if (showToast) showToast('Apps Script code copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Copy failed:', err);
      if (showToast) showToast('Failed to copy code. Please select and copy manually.', 'error');
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([GOOGLE_APPS_SCRIPT_CODE], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'KhataBook_GoogleAppsScript.js';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (showToast) showToast('Downloaded KhataBook_GoogleAppsScript.js', 'success');
    } catch (err) {
      console.error('Download failed:', err);
      if (showToast) showToast('Download failed', 'error');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          className="bg-zinc-900 border border-zinc-800 rounded-[32px] sm:rounded-[40px] p-5 sm:p-7 max-w-2xl w-full my-auto space-y-6 shadow-2xl max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 bg-orange-500/10 rounded-2xl flex items-center justify-center border border-orange-500/20">
                <FileCode className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg sm:text-xl text-white">Google Sheet Apps Script</h3>
                <p className="text-xs text-zinc-400">Sync Transactions, Orders, Categories & Payment Modes</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="space-y-5 overflow-y-auto pr-1 flex-1 text-sm">
            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleCopy}
                className="w-full bg-orange-500 hover:bg-orange-600 active:scale-98 text-white font-bold py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all text-sm"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied to Clipboard!' : 'Copy Apps Script Code'}
              </button>
              <button
                onClick={handleDownload}
                className="w-full bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-zinc-200 font-semibold py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 border border-zinc-700/60 transition-all text-sm"
              >
                <Download className="w-4 h-4" />
                Download Script (.js)
              </button>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="bg-zinc-800/40 border border-zinc-800 rounded-2xl p-4.5 space-y-3">
              <p className="font-bold text-xs uppercase tracking-wider text-orange-400">
                Quick Setup Steps
              </p>
              <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-zinc-300 leading-relaxed">
                <li>
                  Open your target Google Spreadsheet.
                </li>
                <li>
                  In the top menu, go to <strong className="text-white">Extensions &gt; Apps Script</strong>.
                </li>
                <li>
                  Delete any existing code in the editor, click <strong className="text-orange-400">Copy Apps Script Code</strong> above, and paste it.
                </li>
                <li>
                  Click the <strong className="text-white">Save</strong> (disk) icon.
                </li>
                <li>
                  Click <strong className="text-white">Deploy &gt; Manage deployments</strong>, click the pencil icon on your deployment, change Version to <strong className="text-orange-400">New version</strong>, and click <strong className="text-white">Deploy</strong>.
                  <br />
                  <span className="text-zinc-500 text-[11px] block mt-0.5">
                    (If deploying for the first time: Deploy &gt; New deployment &gt; Select "Web app" &gt; Execute as: "Me" &gt; Who has access: "Anyone").
                  </span>
                </li>
                <li>
                  Copy the provided <strong className="text-white">Web App URL</strong> and paste it into the <strong>Google Sheet API Link</strong> field in Admin settings.
                </li>
              </ol>
            </div>

            {/* What this script automatically creates & syncs */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                Auto-Synced Sheets (Headers Created Automatically)
              </div>
              <ul className="text-xs text-zinc-300 space-y-1.5 leading-relaxed">
                <li><strong className="text-white">Transactions:</strong> id, date, type, category, amount, payment_type, description, reference, order_id, synced</li>
                <li><strong className="text-white">Orders:</strong> order_id, items, supplier, total_amount, paid_amount, remaining_amount, status, date, synced</li>
                <li><strong className="text-white">OrderPayments:</strong> payment_id, order_id, amount, payment_type, date, synced</li>
                <li><strong className="text-emerald-300 font-semibold">Categories:</strong> name (Custom expense categories sync across all devices!)</li>
                <li><strong className="text-emerald-300 font-semibold">PaymentModes:</strong> name (Custom payment modes sync across all devices!)</li>
              </ul>
            </div>

            {/* Code Toggle & Preview */}
            <div className="border border-zinc-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowCodePreview(!showCodePreview)}
                className="w-full flex items-center justify-between p-3.5 bg-zinc-800/30 hover:bg-zinc-800/50 text-xs font-semibold text-zinc-300 transition-colors"
              >
                <span>{showCodePreview ? 'Hide Code Preview' : 'Show Code Preview'}</span>
                {showCodePreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showCodePreview && (
                <div className="bg-black/80 p-3 max-h-56 overflow-auto font-mono text-[11px] text-zinc-400 leading-tight select-all">
                  <pre>{GOOGLE_APPS_SCRIPT_CODE}</pre>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-zinc-800 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-6 py-2.5 rounded-2xl text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
