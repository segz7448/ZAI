/**
 * ZAI Desktop - BlurView Shim (replaces expo-blur)
 *
 * Chromium supports the CSS `backdrop-filter: blur()` property directly,
 * so this is a real visual replacement (not a fallback) for expo-blur's
 * native BlurView - same intensity/tint prop shape MessageActionMenu.js
 * already passes in, translated to a blur radius + tint overlay color.
 */
import React from 'react';

export function BlurView({ intensity = 24, tint = 'dark', style, children }) {
  const blurPx = Math.max(1, Math.round(intensity / 2));
  const tintColor = tint === 'dark' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';

  return (
    <div
      style={{
        ...flattenStyle(style),
        backdropFilter: `blur(${blurPx}px)`,
        WebkitBackdropFilter: `blur(${blurPx}px)`,
        backgroundColor: tintColor,
      }}
    >
      {children}
    </div>
  );
}

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style;
}
