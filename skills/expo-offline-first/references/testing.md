# Testing checklist

## Unit (no device)

The outbox rules are pure (`state.ts`): test them with `bun test` or Jest.
See [`examples/outbox/state.test.ts`](../examples/outbox/state.test.ts).

- [ ] transient error -> pending with backoff; exhausted -> failed
- [ ] 429 / 401 / 4xx -> failed immediately (never auto-retried)
- [ ] manual retry resets attempts; no-op when not failed
- [ ] `recoverInterrupted` respects `serverIsIdempotent`
- [ ] `pickNext` single-flight + oldest first; `nextWakeAt` = earliest backoff
- [ ] `classifyError` mapping (TypeError -> network, status codes)
- [ ] indicator transitions: hidden -> offline -> back-online -> hidden; no back-online without offline
- [ ] ready notice: 0 -> null, 1 -> single, n -> group; delay waits for the indicator
- [ ] server: same key + same body -> replay, different body -> 422, concurrent -> 409

## Simulator / emulator

- [ ] iOS Simulator follows the Mac's network: use **Network Link Conditioner** (Xcode Additional
      Tools) profiles "100% Loss" and "Very Bad Network", not just Wi-Fi off.
- [ ] Android emulator: Extended controls -> Cellular -> Data status / Network type; or
      `adb shell svc wifi disable && adb shell svc data disable`.
- [ ] Cold start offline: user stays signed in, cached screens render, no redirect to login.
- [ ] Submit offline: queued toast, pending card, nothing blocks.
- [ ] Reconnect: indicator shows "Back online", queue flushes in order, one grouped toast.
- [ ] Flaky network: backoff visible, no duplicate items on the server.
- [ ] Purchases / sign-in offline: clear alert before any native sheet.

## Kill tests (the ones that find real bugs)

- [ ] Queue 3 jobs offline, **kill the app**, relaunch offline: jobs and files still there.
- [ ] Go online and **kill during `sending`**: on relaunch the job is recovered (pending if the
      server is idempotent, otherwise failed "interrupted"); the server has exactly one record.
- [ ] Kill right after the response arrived: relaunch applies the saved response without a
      second request (check server logs).
- [ ] Update the app (new build) with jobs queued: schema migration keeps them; relative file
      paths still resolve.

## Real device

- [ ] Airplane mode on / off on a physical iPhone and Android phone.
- [ ] Captive portal / Wi-Fi with no internet (`isInternetReachable === false`).
- [ ] Background the app offline, reconnect, foreground: flush runs on `active`.
- [ ] VoiceOver / TalkBack announce offline and back online; Dynamic Type XXL doesn't clip.
