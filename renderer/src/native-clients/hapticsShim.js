/**
 * ZAI Desktop - Haptics Shim (replaces expo-haptics)
 *
 * There's no vibration motor on a PC the way there is on a phone -
 * haptic feedback has no desktop equivalent, so every function here is
 * an intentional no-op. Kept as real exports (not omitted) so call sites
 * like MessageActionMenu.js's `Haptics.impactAsync(...)` on
 * long-press/copy don't need to be stripped out one by one - they just
 * quietly do nothing, the same UX outcome a phone with haptics disabled
 * in system settings would already have.
 */

export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' };
export const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' };

export async function impactAsync(_style) {
  // no-op
}

export async function notificationAsync(_type) {
  // no-op
}

export async function selectionAsync() {
  // no-op
}
