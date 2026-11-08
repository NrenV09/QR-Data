import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function usePWAOfflineEngine() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [swReady, setSwReady] = useState<boolean>(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const isHttpProtocol =
      typeof window !== 'undefined' &&
      (window.location.protocol === 'http:' ||
        window.location.protocol === 'https:');
    const isStandaloneSingleFile =
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-standalone-offline') ===
        'true';

    if (!isHttpProtocol || isStandaloneSingleFile) {
      // Running directly from local filesystem (file://) or standalone single-file HTML
      setSwReady(true);
    } else {
      // Register Service Worker for 100% offline cache availability once loaded over HTTP/HTTPS
      try {
        registerSW({
          immediate: true,
          onRegisteredSW() {
            setSwReady(true);
          },
          onOfflineReady() {
            setSwReady(true);
          },
          onRegisterError() {
            setSwReady(true);
          },
        });
      } catch {
        setSwReady(true);
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then(() => setSwReady(true))
          .catch(() => {});
      }
    }

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isOnline,
    swReady,
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    installApp,
  };
}
