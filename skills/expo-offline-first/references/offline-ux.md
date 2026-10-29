# Offline UX

Code: [`examples/ui/`](../examples/ui/): `OfflineIndicator.tsx` + `indicator.ts`, `ReadyToast.tsx` +
`ready-toast.tsx` + `ready-notice.ts`, `PendingCard.tsx`, `en.json` (all strings).

Principle: **offline is a state, not an error.** The user keeps reading and creating; the app
tells them quietly what will happen.

## Connectivity indicator (Spotify / Apple Music style)

- A small blurred pill ("You're offline") docked **just above the tab bar** on tab roots.
- Appears only after **~1.5 s** offline (debounced) so blips don't flash.
- On reconnect it turns into **"Back online"** (success color, check icon) for ~1.8 s, then
  leaves. "Back online" only shows if the user saw "Offline".
- `pointerEvents="none"`: never blocks taps, never covers content permanently.
- Hidden on pushed screens and sheets, which own their bottom CTAs and show offline inline.
- Position: `bottom = insets.bottom + tabBarHeight + 8`. With the iOS 26 floating native tab bar
  (`NativeTabs`) the bar is ~48 pt above the inset; with JS tabs use `useBottomTabBarHeight()`.
- Animate with reanimated `FadeInDown` / `FadeOutDown` + `LinearTransition` for the text change.
- No full-width red banners, no modal "No internet connection" dialogs, no persistent toasts.

## Queued confirmation

When the user submits offline: a short neutral toast ("Saved. It will be sent when you're back
online.") and navigate as if it succeeded, landing on a **pending card**.

## Pending cards

Render outbox jobs inline, where the result will appear (top of the list / inside the detail):

| State | Card shows | Actions |
| --- | --- | --- |
| waiting | "Waiting for connection" + the user's input (thumbnail, title) | Remove |
| sending | spinner / progress | none |
| failed | the specific error message (`outbox.errors.<code>`) | Retry, Remove |

Use the local attachment (`attachmentUri(job.attachment)`) for the thumbnail: it's on disk.

## Ready toast (grouped)

When a queued job completes in the background:

- One global `<Toaster />` (sonner-native) in the root layout, a **stable toast id** so new
  completions update the same toast instead of stacking.
- One item: thumbnail + "Ready" + context line + "View" pill; tapping opens it.
- Several within the batch window (600 ms) or while the toast is visible: **"3 items ready"**
  (i18n plural), tapping opens the list.
- Waits until the "Back online" pill has left (`indicatorBusyUntil`) so they don't overlap.
- ~6 s duration, swipe to dismiss, one success haptic per toast (not per item).
- Don't use local notifications for this while the app is in the foreground.

## Accessibility

- `AccessibilityInfo.announceForAccessibility()` on offline / back-online transitions.
- `accessibilityLiveRegion="polite"` on the pill and pending cards (Android).
- The toast is one `button` with `accessibilityLabel` = title + subtitle and a hint.
- Support Dynamic Type: no fixed heights on text containers, `numberOfLines` + `flexShrink`,
  cap with `maxFontSizeMultiplier` only where layout truly breaks.
- Don't rely on color alone: icon + text for each state.
- Hit targets >= 44 pt (`hitSlop` on small Retry/Remove links).

## i18n

Every string (indicator, toasts, card states, error messages, alerts) goes through i18n. Use
plural forms (`readyGroup_one` / `readyGroup_other` with i18next) instead of string concatenation.
See [`examples/ui/en.json`](../examples/ui/en.json) for the full key set.
