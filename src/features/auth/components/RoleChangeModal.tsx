import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRightLeft, X, UserCheck, ShieldCheck, RefreshCw, Send } from 'lucide-react';
import { type AuthSession } from '../../../types/auth';

interface RoleChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (targetRole: 'admin' | 'staff', reason: string) => Promise<boolean>;
  authSession?: AuthSession | null;
  isAdmin: boolean;
}

export function RoleChangeModal({
  isOpen,
  onClose,
  onSubmit,
  authSession,
  isAdmin,
}: RoleChangeModalProps) {
  const [roleChangeTarget, setRoleChangeTarget] = useState<'admin' | 'staff'>('staff');
  const [roleChangeReason, setRoleChangeReason] = useState('');
  const [isSubmittingRoleChange, setIsSubmittingRoleChange] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingRoleChange(true);
    const success = await onSubmit(roleChangeTarget, roleChangeReason);
    setIsSubmittingRoleChange(false);
    if (success) {
      setRoleChangeReason('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl z-10 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Request Role Change</h3>
                  <p className="text-[11px] text-zinc-400">Submit role change request to Google Sheet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400 space-y-1">
              <div className="text-zinc-300 font-semibold flex items-center gap-1.5">
                <span>Current Account:</span>
                <span className="text-white font-mono">@{authSession?.username}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isAdmin ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {isAdmin ? 'Admin' : 'Staff'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Your request is recorded in the Google Sheet <span className="text-zinc-300">requested_role</span> column. When your administrator updates your role in the sheet, your app will immediately reflect it on the next sync.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Select Target Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRoleChangeTarget('staff')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      roleChangeTarget === 'staff'
                        ? 'bg-blue-600/20 text-blue-300 border-blue-500 shadow-sm'
                        : 'bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <UserCheck className="w-5 h-5" />
                    <div>
                      <p className="text-xs font-bold text-white">Staff Member</p>
                      <p className="text-[10px] text-zinc-400">Daily expenses & orders</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleChangeTarget('admin')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      roleChangeTarget === 'admin'
                        ? 'bg-orange-600/20 text-orange-300 border-orange-500 shadow-sm'
                        : 'bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <div>
                      <p className="text-xs font-bold text-white">Administrator</p>
                      <p className="text-[10px] text-zinc-400">Full system & sync control</p>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Reason / Note for Administrator (Optional)</label>
                <textarea
                  rows={2}
                  value={roleChangeReason}
                  onChange={(e) => setRoleChangeReason(e.target.value)}
                  placeholder="e.g. Need access to manage Google Sheets sync and categories"
                  className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all resize-none"
                  disabled={isSubmittingRoleChange}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRoleChange}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-xs transition-all shadow-md shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSubmittingRoleChange ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
