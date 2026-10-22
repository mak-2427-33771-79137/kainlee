'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Renders fixed bars (bottom menu, action bars) directly in <body>, outside the
// scrolling frame. iPhone Safari does not reliably deliver taps to fixed elements
// that live inside a scrolling container.
export default function Portal({ children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
