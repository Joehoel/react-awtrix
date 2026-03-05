# Virtual Awtrix Device Gaps

This file lists what the in-memory test device intentionally does **not** emulate yet.

## Not Fully Implemented

- Hardware side effects: no LED driver timing, no brightness/gamma pipeline, no thermal/current behavior, no real deep sleep/wakeup lifecycle.
- Real screen rasterization: `/api/screen` is synthetic (black frame by default, moodlight color fill when set). It does not render text, icons, effects, charts, or draw instructions pixel-by-pixel like firmware.
- Filesystem-backed behavior: no `/ICONS`, `/MELODIES`, `/CUSTOMAPPS` storage, no flash writes for `save`, no icon file lookup (`jpg`/`gif`) or GIF frame handling.
- Sound stack parity: `/api/sound`, `/api/rtttl`, and `/api/r2d2` are request-level stubs; they do not validate real files, parse RTTTL melodies, or model buzzer/DFPlayer timing.
- MQTT/forwarding behavior: notification `clients` fan-out is not forwarded to other devices or MQTT topics; only local request-state behavior is emulated.
- Effect engine internals: `effect`, `effectSettings`, `overlay`, `gradient`, `blinkText`, `fadeText`, autoscaling details, and animation timing are accepted as payload data but not executed by an effect renderer.
- Lifetime and stale-app behavior: `lifetime`/`lifetimeMode` timers and stale-border behavior are not simulated over time.
- Full app loop scheduler parity: transition durations/animations and automatic app cycling timing are simplified.
- Stats fidelity: `/api/stats` returns deterministic stub values (e.g. battery, RAM, lux, signal) rather than real sensor or runtime metrics.
- Web UI + service endpoints: `/screen` HTML, `/fullscreen`, `/backup`, auth integration, and mDNS service behavior are not emulated.
- Firmware management parity: `/api/doupdate`, `/api/reboot`, `/api/erase`, `/api/resetSettings` are state-level stubs and do not perform OTA, restart processes, or flash-level operations.

## What Is Implemented

- HTTP endpoint contract and response codes for the test-focused API surface used by `react-awtrix`.
- Custom app semantics: object/array payloads, prefix-based deletion, parse error handling.
- Notification semantics: stack behavior, dismiss behavior, clients key stripping behavior.
- App loop control endpoints (`loop`, `apps`, `switch`, `nextapp`, `previousapp`, `reorder`) at request/state level.
- Power/sleep/settings/indicator/moodlight/update endpoints at request/state level.
