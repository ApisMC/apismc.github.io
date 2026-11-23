---
title: Команди ядра та керування мирами
description: Синтаксис, права доступу, tab-completion і поведінка вбудованих команд /apis, /world, /tpworld та /setworldspawn.
sidebar:
  order: 2
---

Усі вбудовані команди реєструються в `DedicatedServer.initServer()` через `ApisCommand.register(this)`. Права для команд світів за замовчуванням мають рівень `PermissionDefault.OP` і перевіряються через `ApisMessageRenderer.hasAccess` (`sender.isOp() || sender.hasPermission(permission)`).

:::note
Тексти всіх відповідей команд світів налаштовуються у форматі MiniMessage в секції `messages.commands` файлу [`configs/apis.yml`](../../configuration/apis-config/#секція-messagescommands-minimessage). Порожній рядок `""` вимикає надсилання повідомлення.
:::

---

## `/apis` (аліас: `/ap`)

Команда адміністрування матриці можливостей `FeatureRegistry` і синхронізації конфігів.

- **Дозвіл:** `apis.admin` (перевірка через `Command#testPermission(sender)`)
- **Синтаксис:**
  ```text
  /apis [status | reload]
  ```
- **Підкоманди:**
  - `/apis` або `/apis status` - виводить кількість і повний перелік активних kill-switches (`FeatureRegistry.activeKillSwitches()`), включно з перевизначеними списками вимірів (`enabled`, `always-ticking`, `never-ticking`) і `entities.ai.type-filter`.
  - `/apis reload` - виконує `ApisConfig.reload()`, повторно резолвить `FeatureRegistry.resolveRegistries(...)` та запускає `ApisConfigSync.syncAll(server)` для всіх завантажених світів, після чого виводить оновлену кількість активних kill-switches.
- **Tab-complete:** для першого аргументу при наявності `apis.admin` пропонує `status` та `reload`.

---

## `/world`

Керування життєвим циклом standalone-світів у контейнері `worlds/` без сторонніх плагінів.

- **Дозвіл:** `apis.command.world` (`OP`)
- **Передумова:** працює лише при `dimensions.mode: standalone`; у `vanilla`-режимі повертає `messages.commands.world-standalone-only`.
- **Синтаксис:**
  ```text
  /world <load <world> | unload <world> | reload [world]>
  ```

### Підкоманди

1. **`/world load <world>`**
   - Перевіряє, чи не завантажено світ (`world-already-loaded`).
   - Шукає папку в `worlds/` без урахування регістру та валідує ім'я через `Identifier.tryParse("minecraft:" + normalizedKey)`.
   - Завантажує світ із `ApisVoidChunkGenerator`, `VOID_BIOME_PROVIDER` і `generateStructures(false)`, застосовуючи `worlds/<world>/world.yml`.
2. **`/world unload <world>`**
   - Забороняє вивантаження базового `fallback-world` (`world-unload-fallback-forbidden`).
   - Перевіряє наявність завантаженого `fallback-world` (`world-fallback-not-configured`).
   - Евакуює всіх гравців із цільового світу на спавн базового світу.
   - Вивантажує світ (`saveChunks` відповідає `storage.world-saving`) та очищає кеші `WORLD_CACHE` / `DIMENSION_FOLDERS`.
3. **`/world reload <world>`**
   - Для `fallback-world`: оновлює лише `world.yml`, спавн і режим гри без перезавантаження чанків (`world-reload-fallback-notice`).
   - Для додаткового світу, якщо тека видалена з диска: евакуює гравців і вивантажує світ із `save=false` (`world-reload-missing-unloaded`).
   - Для додаткового світу, присутнього на диску: евакуює гравців на fallback, вивантажує світ із `save=false`, заново завантажує з диска та повертає гравців на спавн (`world-reload-single-success`).
4. **`/world reload` (без аргументів)**
   - Синхронізує весь контейнер `worlds/`: вивантажує видалені з диска світи, перезавантажує наявні додаткові, завантажує нові знайдені теки та оновлює `world.yml` для базового світу.

- **Tab-complete:**
  - `args[0]`: `load`, `unload`, `reload`;
  - `args[1]` для `load`: незавантажені валідні теки в `worlds/`;
  - `args[1]` для `unload`: завантажені світи, крім `fallback-world`;
  - `args[1]` для `reload`: усі завантажені світи в `worlds/`.

---

## `/tpworld`

Асинхронна телепортація гравця між завантаженими standalone-світами.

- **Дозвіл:** `apis.command.tpworld` (`OP`)
- **Синтаксис (1, 2, 4, 5, 6 або 7 аргументів):**
  ```text
  /tpworld <world> [<player>] [<x> <y> <z>] [<yaw> <pitch>]
  ```
- **Поведінка:**
  - шукає світ через `StandaloneWorldManager.resolveLoadedStandaloneWorld(server, args[0])`;
  - при 2, 5 або 7 аргументах ціллю виступає вказаний `<player>`; інакше команда вимагає виконання від імені гравця (`player-only`);
  - якщо координати не вказано (1 або 2 аргументи) - використовується точка спавну з `world.yml`;
  - якщо вказано `<x> <y> <z>` без `<yaw> <pitch>` - для себе зберігається поточна орієнтація камери, для іншого гравця виставляється `yaw=0, pitch=0`;
  - телепортація виконується асинхронно через `targetPlayer.teleportAsync(destination, TeleportCause.COMMAND)`.
- **Tab-complete:** `args[0]` - завантажені світи, `args[1]` - онлайн-гравці, далі - поточні координати та кути огляду гравця.

---

## `/setworldspawn` (перевизначення в `standalone`)

У режимі `dimensions.mode: standalone` команда `SetWorldSpawnOverrideCommand` замінює стандартну команду спавну, зберігаючи ванільний варіант під ключем `minecraft:setworldspawn` у `SimpleCommandMap`.

- **Дозвіл:** `apis.command.setspawn` (`OP`)
- **Синтаксис (0, 3 або 5 аргументів; лише від імені гравця):**
  ```text
  /setworldspawn [<x> <y> <z>] [<yaw> <pitch>]
  ```
- **Поведінка:** записує точні дробові координати `x, y, z, yaw, pitch` атомарно (через тимчасовий `.tmp` + `ATOMIC_MOVE`/`REPLACE_EXISTING`) у `worlds/<world>/world.yml`, оновлює внутрішній кеш світу та викликає `level.setRespawnData(...)`.
