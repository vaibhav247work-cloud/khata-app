import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [justCameOnline, setJustCameOnline] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const handleOnline = () => {
      setIsOnline(true);
      setJustCameOnline(true);
      timer = setTimeout(() => {
        setJustCameOnline(false);
      }, 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustCameOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { isOnline, justCameOnline };
}
