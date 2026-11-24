---
title: Консольний інтерфейс (Log4j2)
description: Кастомний рівень логування OK (350), кольорові бейджі %levelBadge, схема %highlightApis та форматування консолі й файлів.
sidebar:
  order: 2
---

Apis оновлює форматування термінальної консолі (`TerminalConsole` у `log4j2.xml.patch`) через два власні Log4j2-конвертери в `org.apismc.apis.console`: **`ApisHighlightConverter`** та **`ApisLevelBadgeConverter`**.

## Кастомний рівень `OK` (пріоритет `350`)

В `ApisLog` та `ApisLevelBadgeConverter` зареєстровано рівень Log4j2:

```java
Level.forName("OK", 350)
```

- Пріоритет **350** розташований між `WARN` (`300`) та `INFO` (`400`).
- Завдяки цьому стандартний поріг фільтрації `<AppenderRef ref="TerminalConsole" level="info"/>` і `<Root level="info">` пропускає повідомлення `OK` без додаткових змін правил логування.
- `ApisLevelBadgeConverter#isOkEvent(LogEvent)` також розпізнає події з маркером `"OK"`, якщо рівень події не вищий за `WARN`.

---

## Шаблони `log4j2.xml` і конвертери

### Консольний апендер (`TerminalConsole`)

У `log4j2.xml.patch` консольний вивід переведено на компактний патерн:

- **Стандартні логери:**
  ```text
  %highlightApis{[%d{HH:mm:ss}] %levelBadge [%logger] %msg%n%xEx{full}}
  ```
- **Системні / Minecraft / Mojang логери** (без зайвого імені логера):
  ```text
  %highlightApis{[%d{HH:mm:ss}] %levelBadge %msg%n%xEx{full}}
  ```

### Файловий апендер (`logs/latest.log`)

Апендер `RollingRandomAccessFile name="File"` **не змінюється** - у файл логів і далі записується чистий текст без ANSI-керуючих послідовностей (`%stripAnsi{%msg}`) у стандартному форматі `[%d{HH:mm:ss}] [%t/%level]: ...`.

---

## Колірні схеми `%highlightApis` та `%levelBadge`

### `%highlightApis` (`ApisHighlightConverter`)

Забарвлює весь рядок повідомлення, коли `TerminalConsoleAppender.isAnsiSupported()` повертає `true` (у кінці додається скидання `ESC[m`):

| Рівень / Маркер | ANSI-код | Колір |
| --- | --- | --- |
| `ERROR` / `FATAL` | `ESC[31;1m` | Яскраво-червоний |
| `WARN` | `ESC[33;1m` | Яскраво-жовтий |
| `OK` (рівень або маркер) | `ESC[32;1m` | Яскраво-зелений |
| `INFO`, `DEBUG` та інші | - | Стандартний колір термінала |

### `%levelBadge` (`ApisLevelBadgeConverter`)

Формує контрастний бейдж із відновленням основного кольору рядка після бейджа:

| Рівень | ANSI увімкнено | Без ANSI (`isAnsiSupported() == false`) |
| --- | --- | --- |
| `ERROR` / `FATAL` | `ESC[0;1;30;101m <LEVEL> ESC[0;31;1m` (чорний жирний текст на червоному фоні) | Чиста назва рівня (`ERROR` / `FATAL`) |
| `WARN` | `ESC[0;1;30;103m <LEVEL> ESC[0;33;1m` (чорний жирний текст на жовтому фоні) | `WARN` |
| `OK` | `ESC[0;1;30;102m OK ESC[0;32;1m` (чорний жирний текст на зеленому фоні) | `OK` |
| `INFO` та інші | Назва рівня без бейджа (`INFO`) | Назва рівня без бейджа |

---

## Ключові повідомлення ядра (`ApisLog.ok` і компактний `WARN`)

Наступні етапи запуску та діагностики логуються рівнем `OK`:
- `ApisConfig.loadEarly`: `Loaded <path> (active kill-switches: <N>)`
- `DedicatedServer.java.patch`: `Done preparing level "<name>" (<time>s)`
- `MinecraftServer.java.patch`: `Done (<time>s)! For help, type "help"`
- `StandaloneWorldManager`: `Initialized standalone fallback world '...' at ...` та `Loaded standalone world '...' from ...`
- `ApisHooks.tryBreakStaleSessionLock`: `Cleared stale session.lock for world '...' (previous process not running)`
- `ApisDiagnostics.warnBlocked`: `Blocked plugin '<name>'|server call <ctx>(<target>) - disabled by <key> in apis.yml`

:::note
Багаторядкове попередження Paper про запуск в `online-mode=false` у `DedicatedServer.java.patch` скорочено до одного рядка `WARN`:
- `Server running in offline mode behind <Velocity|BungeeCord> proxy (online-mode=false).`
- або `Server running in offline/insecure mode without Mojang authentication (online-mode=false).`
:::
