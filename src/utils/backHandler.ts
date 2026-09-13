import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export type BackActionHandler = () => boolean;

interface RegisteredHandler {
  id: string;
  handler: BackActionHandler;
  priority: number;
  addedAt: number;
}

class BackHandlerManager {
  private handlers: RegisteredHandler[] = [];
  private fallbackHandler: (() => void) | null = null;
  private isInitialized = false;

  public init(fallback: () => void) {
    this.fallbackHandler = fallback;
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Seed history state for browser back button support
    if (typeof window !== 'undefined' && window.history) {
      try {
        window.history.pushState({ app: 'khatabook' }, '');
      } catch (e) {
        console.warn('Initial pushState failed:', e);
      }
    }

    // 1. Android Capacitor Hardware Back Button and Back Swipe Gestures
    try {
      CapApp.addListener('backButton', () => {
        this.triggerBack();
      });
    } catch (err) {
      console.warn('Capacitor backButton listener init notice:', err);
    }

    // 2. Web Browser popstate (Back button / web back gestures)
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        const handled = this.triggerBack();
        // Keep history buffer so browser doesn't close prematurely
        if (handled && window.history) {
          try {
            window.history.pushState({ app: 'khatabook' }, '');
          } catch (e) {
            // ignore
          }
        }
      });
    }
  }

  public setFallback(fallback: () => void) {
    this.fallbackHandler = fallback;
  }

  public register(handler: BackActionHandler, priority: number = 0): () => void {
    const id = Math.random().toString(36).substring(2, 9);
    this.handlers.push({ id, handler, priority, addedAt: Date.now() });

    return () => {
      this.handlers = this.handlers.filter(h => h.id !== id);
    };
  }

  public triggerBack(): boolean {
    // Sort handlers: higher priority first, then most recently added (LIFO)
    const sorted = [...this.handlers].sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.addedAt - a.addedAt;
    });

    for (const item of sorted) {
      try {
        const handled = item.handler();
        if (handled) {
          return true;
        }
      } catch (e) {
        console.error('Error executing back handler:', e);
      }
    }

    // If no modal/overlay consumed the back action, invoke fallback (Tab history / exit)
    if (this.fallbackHandler) {
      try {
        this.fallbackHandler();
        return true;
      } catch (e) {
        console.error('Error executing fallback back handler:', e);
      }
    }

    return false;
  }

  public exitApp() {
    if (Capacitor.isNativePlatform() || typeof (CapApp as any)?.exitApp === 'function') {
      try {
        CapApp.exitApp();
      } catch (err) {
        console.error('CapApp.exitApp error:', err);
      }
    }
  }
}

export const backHandler = new BackHandlerManager();

/**
 * React hook to register a back action handler when a modal, overlay, or drawer is active.
 * Handler should return true if it consumed the back event (e.g. closed the modal).
 */
export function useBackHandler(
  handler: BackActionHandler,
  active: boolean = true,
  priority: number = 0
) {
  useEffect(() => {
    if (!active) return;
    const unregister = backHandler.register(handler, priority);
    return unregister;
  }, [active, handler, priority]);
}
