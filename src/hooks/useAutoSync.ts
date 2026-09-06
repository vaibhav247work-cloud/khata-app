import { useState, useEffect, useEffectEvent } from 'react';
import { SYNC_PENDING_KEY } from '../constants';
import type { SyncTrigger } from '../sync';

interface UseAutoSyncOptions {
  isLoggedIn: boolean;
  apiLink: string;
  hasPendingSync: boolean;
  isSyncing: boolean;
  onSync: (trigger: SyncTrigger) => Promise<boolean>;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function useAutoSync({
  isLoggedIn,
  apiLink,
  hasPendingSync,
  isSyncing,
  onSync,
  showToast,
}: UseAutoSyncOptions) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const handleOnline = useEffectEvent(() => {
    setIsOnline(true);

    if (localStorage.getItem(SYNC_PENDING_KEY) === 'true') {
      showToast('Internet is back. Syncing pending changes...', 'info');

      if (isLoggedIn && apiLink) {
        void onSync('reconnect');
      }
    }
  });

  const handleOffline = useEffectEvent(() => {
    setIsOnline(false);
    showToast('Offline mode active. New entries will sync when internet returns.', 'info');
  });

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !isOnline || !apiLink || !hasPendingSync || isSyncing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void onSync('background');
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [apiLink, hasPendingSync, isLoggedIn, isOnline, isSyncing]);

  return { isOnline };
}
