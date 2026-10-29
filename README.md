# expo-offline-first

An [Agent Skill](https://agentskills.io) that teaches coding agents (Cursor, Claude Code, Codex,
Copilot, Windsurf, ...) how to make **Expo / React Native apps work offline** without losing user
input, double-charging on retries, or blocking reads.

## Install

```sh
npx skills add bryanscalzo97/expo-offline-first-skill
```

Or pick agents explicitly:

```sh
npx skills add bryanscalzo97/expo-offline-first-skill --skill expo-offline-first --agent cursor claude-code
```

## What it covers

- **Decide first**: persisted cache + outbox vs a local-first sync DB (PowerSync, WatermelonDB, ...)
- **Network layer**: `expo-network` -> TanStack Query `onlineManager`, `AppState` -> `focusManager`,
  debounced offline hook
- **Persisted query cache** in `expo-sqlite/kv-store`: what to persist, `networkMode: "offlineFirst"`,
  hydration gating
- **Durable outbox** in `expo-sqlite`: schema, `pending / sending / failed / done` state machine,
  files copied to Documents, client UUID as `Idempotency-Key`, backoff, reconnect/foreground
  triggers, single-flight processing, crash recovery, cleanup
- **Server idempotency**: a framework-agnostic `withIdempotency()` handler wrapper
- **Auth offline**: stay signed in on an offline cold start; guard purchases and sign-in
- **UX**: Spotify / Apple Music style indicator above the tab bar with "Back online", pending
  cards, grouped "ready" toast, no blocking modals, accessibility, i18n
- **Testing checklist**: state-machine unit tests, Network Link Conditioner, kill mid-queue,
  airplane mode on device
- **Common agent mistakes** to avoid

It builds on, and references, the official `expo-data-fetching` skill from
[expo/skills](https://github.com/expo/skills).

## Layout

```
skills/expo-offline-first/
  SKILL.md        Entry point the agent reads (concise, links below)
  references/     Deep dives per topic
  examples/       Copy-pasteable TypeScript (client, UI, server) + a bun test
```

## Stack assumed

Expo SDK 54+ (new `expo-file-system` API), expo-router, TanStack Query v5, expo-network,
expo-sqlite, react-native-reanimated, expo-blur, expo-image, sonner-native, i18next.
The patterns apply to any React Native app; swap libraries as needed.

## License

[MIT](./LICENSE) © 2026 Bryan Scalzo
