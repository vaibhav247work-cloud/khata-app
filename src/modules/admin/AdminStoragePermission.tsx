import { Capacitor } from '@capacitor/core';
import { requestAppStoragePermission } from '../../utils/permissions';

interface AdminStoragePermissionProps {
  storagePermState: boolean;
  setStoragePermState: (val: boolean) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function AdminStoragePermission({
  storagePermState,
  setStoragePermState,
  showToast,
}: AdminStoragePermissionProps) {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  return (
    <div className="group flex items-center justify-between p-4 sm:p-6 bg-zinc-800/30 rounded-[32px] border border-zinc-800/50 hover:border-blue-500/30 transition-all gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-bold text-base sm:text-lg">Storage Permission</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${storagePermState ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
            {storagePermState ? 'Granted' : 'Permission Needed'}
          </span>
        </div>
        <p className="text-[10px] sm:text-xs text-zinc-500 leading-relaxed max-w-[200px] sm:max-w-[280px]">
          Required for saving PDF passbooks, receipts, and Excel reports directly to device storage.
        </p>
      </div>
      <button 
        type="button"
        onClick={async () => {
          const granted = await requestAppStoragePermission(showToast);
          setStoragePermState(granted);
          if (granted) {
            showToast('Storage permission granted!', 'success');
          } else {
            showToast('Storage permission not granted', 'error');
          }
        }}
        className={`px-4 py-2.5 rounded-2xl font-bold text-xs transition-all shrink-0 ${
          storagePermState 
            ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' 
            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-95'
        }`}
      >
        {storagePermState ? 'Check Status' : 'Allow Permission'}
      </button>
    </div>
  );
}
