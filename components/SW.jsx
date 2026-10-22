'use client';
import { useEffect } from 'react';

// Registers the service worker (installable app, offline entry pass, push notifications).
export default function SW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || location.hostname === 'localhost' && !location.search.includes('sw=1')) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
