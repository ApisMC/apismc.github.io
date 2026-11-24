---
title: Console UI (Log4j2)
description: Custom OK (350) log level, colored %levelBadge tags, %highlightApis line colors, and file vs terminal formatting.
sidebar:
  order: 2
---

Apis updates terminal console formatting (`TerminalConsole` in `log4j2.xml.patch`) using two custom Log4j2 converters under `org.apismc.apis.console`: **`ApisHighlightConverter`** and **`ApisLevelBadgeConverter`**.

## Custom `OK` Log Level (Priority `350`)

`ApisLog` and `ApisLevelBadgeConverter` register a custom Log4j2 level:

```java
Level.forName("OK", 350)
```

- Priority **350** sits between `WARN` (`300`) and `INFO` (`400`).
- Because it ranks above `INFO` (`400`), standard `<AppenderRef ref="TerminalConsole" level="info"/>` and `<Root level="info">` filters pass `OK` messages through without extra logger rules.
- `ApisLevelBadgeConverter#isOkEvent(LogEvent)` also detects events carrying the `"OK"` marker when severity is not above `WARN`.

---

## `log4j2.xml` Patterns & Converters

### Terminal Appender (`TerminalConsole`)

`log4j2.xml.patch` uses compact patterns for console output:

- **Standard loggers:**
  ```text
  %highlightApis{[%d{HH:mm:ss}] %levelBadge [%logger] %msg%n%xEx{full}}
  ```
- **System / Minecraft / Mojang loggers** (drops redundant logger name):
  ```text
  %highlightApis{[%d{HH:mm:ss}] %levelBadge %msg%n%xEx{full}}
  ```

### File Appender (`logs/latest.log`)

`RollingRandomAccessFile name="File"` stays unchanged. Log files still receive clean plain text stripped of ANSI codes (`%stripAnsi{%msg}`) in the standard `[%d{HH:mm:ss}] [%t/%level]: ...` format.

---

## Color Rules for `%highlightApis` and `%levelBadge`

### `%highlightApis` (`ApisHighlightConverter`)

Colors the entire log line when `TerminalConsoleAppender.isAnsiSupported()` is `true` and appends reset code `ESC[m`:

| Level / Marker | ANSI Code | Color |
| --- | --- | --- |
| `ERROR` / `FATAL` | `ESC[31;1m` | Bright red |
| `WARN` | `ESC[33;1m` | Bright yellow |
| `OK` (level or marker) | `ESC[32;1m` | Bright green |
| `INFO`, `DEBUG`, others | - | Default terminal foreground |

### `%levelBadge` (`ApisLevelBadgeConverter`)

Builds a high-contrast level badge and restores the parent line color right after it:

| Level | ANSI Enabled | Plain Text (`isAnsiSupported() == false`) |
| --- | --- | --- |
| `ERROR` / `FATAL` | `ESC[0;1;30;101m <LEVEL> ESC[0;31;1m` (bold black on red) | Plain level (`ERROR` / `FATAL`) |
| `WARN` | `ESC[0;1;30;103m <LEVEL> ESC[0;33;1m` (bold black on yellow) | `WARN` |
| `OK` | `ESC[0;1;30;102m OK ESC[0;32;1m` (bold black on green) | `OK` |
| `INFO` & others | Plain level name without badge (`INFO`) | Plain level name |

---

## Core Log Messages (`ApisLog.ok` & Compact `WARN`)

Key startup and diagnostic events log at level `OK`:
- `ApisConfig.loadEarly`: `Loaded <path> (active kill-switches: <N>)`
- `DedicatedServer.java.patch`: `Done preparing level "<name>" (<time>s)`
- `MinecraftServer.java.patch`: `Done (<time>s)! For help, type "help"`
- `StandaloneWorldManager`: `Initialized standalone fallback world '...' at ...` and `Loaded standalone world '...' from ...`
- `ApisHooks.tryBreakStaleSessionLock`: `Cleared stale session.lock for world '...' (previous process not running)`
- `ApisDiagnostics.warnBlocked`: `Blocked plugin '<name>'|server call <ctx>(<target>) - disabled by <key> in apis.yml`

:::note
The verbose multi-line Paper `online-mode=false` banner in `DedicatedServer.java.patch` is condensed into a single `WARN` line:
- `Server running in offline mode behind <Velocity|BungeeCord> proxy (online-mode=false).`
- or `Server running in offline/insecure mode without Mojang authentication (online-mode=false).`
:::
