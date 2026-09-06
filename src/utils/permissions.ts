import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import type { AppPermissionsPluginType } from '../types';

export const AppPermissions = registerPlugin<AppPermissionsPluginType>('AppPermissions');

export const checkAppStoragePermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await AppPermissions.checkStoragePermission();
    if (res && typeof res.granted === 'boolean') {
      return res.granted;
    }
  } catch (err) {
    console.warn('AppPermissions checkStoragePermission error:', err);
  }

  try {
    if (typeof Filesystem.checkPermissions === 'function') {
      const fsPerm = await Filesystem.checkPermissions();
      return fsPerm.publicStorage === 'granted';
    }
  } catch (err) {
    console.warn('Filesystem.checkPermissions error:', err);
  }
  return false;
};

export const requestAppStoragePermission = async (showToast?: (msg: string, type: 'success' | 'error') => void): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;

  try {
    const isAlreadyGranted = await checkAppStoragePermission();
    if (isAlreadyGranted) {
      return true;
    }

    try {
      const res = await AppPermissions.requestStoragePermission();
      if (res && res.granted) {
        showToast?.('Storage permission granted!', 'success');
        return true;
      }
    } catch (pluginErr) {
      console.warn('AppPermissions request error, trying Filesystem fallback:', pluginErr);
    }

    try {
      if (typeof Filesystem.requestPermissions === 'function') {
        const fsRes = await Filesystem.requestPermissions();
        if (fsRes && fsRes.publicStorage === 'granted') {
          showToast?.('Storage permission granted!', 'success');
          return true;
        }
      }
    } catch (fsErr) {
      console.warn('Filesystem.requestPermissions error:', fsErr);
    }
  } catch (e) {
    console.warn('Failed to request permission:', e);
  }

  return false;
};
