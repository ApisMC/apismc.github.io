---
title: Core & World Commands
description: Syntax, permissions, tab-completion, and behavior of /apis, /world, /tpworld, and /setworldspawn.
sidebar:
  order: 2
---

All built-in commands register during `DedicatedServer.initServer()` via `ApisCommand.register(this)`. World commands default to `PermissionDefault.OP` and check access via `ApisMessageRenderer.hasAccess` (`sender.isOp() || sender.hasPermission(permission)`).

:::note
Command response text supports MiniMessage in the `messages.commands` section of [`configs/apis.yml`](/configuration/apis-config/#messagescommands-section). Setting a message to `""` disables output for that response.
:::

---

## `/apis` (alias: `/ap`)

Inspect `FeatureRegistry` state and reload `configs/apis.yml` + config sync without restarting.

- **Permission:** `apis.admin` (checked via `Command#testPermission(sender)`)
- **Syntax:**
  ```text
  /apis [status | reload]
  ```
- **Subcommands:**
  - `/apis` or `/apis status` - prints active kill-switch count and full list (`FeatureRegistry.activeKillSwitches()`), including non-default dimension lists (`enabled`, `always-ticking`, `never-ticking`) and `entities.ai.type-filter`.
  - `/apis reload` - runs `ApisConfig.reload()`, re-resolves `FeatureRegistry.resolveRegistries(...)`, runs `ApisConfigSync.syncAll(server)` across loaded worlds, and prints the updated kill-switch count.
- **Tab-complete:** suggests `status` and `reload` for the first arg when sender has `apis.admin`.

---

## `/world`

Manage standalone world lifecycle inside `worlds/` without external plugins.

- **Permission:** `apis.command.world` (`OP`)
- **Requirement:** works only when `dimensions.mode: standalone`; returns `messages.commands.world-standalone-only` in `vanilla` mode.
- **Syntax:**
  ```text
  /world <load <world> | unload <world> | reload [world]>
  ```

### Subcommands

1. **`/world load <world>`**
   - Rejects already-loaded worlds (`world-already-loaded`).
   - Resolves the folder in `worlds/` case-insensitively and validates `Identifier.tryParse("minecraft:" + normalizedKey)`.
   - Loads the world with `ApisVoidChunkGenerator`, `VOID_BIOME_PROVIDER`, and `generateStructures(false)`, applying `worlds/<world>/world.yml`.
2. **`/world unload <world>`**
   - Blocks unloading `fallback-world` (`world-unload-fallback-forbidden`).
   - Verifies `fallback-world` is loaded (`world-fallback-not-configured`).
   - Evacuates all players in the target world to the fallback world's spawn.
   - Unloads the world (`saveChunks` follows `storage.world-saving`) and clears `WORLD_CACHE` / `DIMENSION_FOLDERS`.
3. **`/world reload <world>`**
   - For `fallback-world`: reloads `world.yml`, spawn, and game mode without unloading chunks (`world-reload-fallback-notice`).
   - If the folder was removed from disk: evacuates players and unloads with `save=false` (`world-reload-missing-unloaded`).
   - For existing extra worlds: evacuates players to fallback, unloads with `save=false`, reloads from disk, and moves players back to spawn (`world-reload-single-success`).
4. **`/world reload` (no args)**
   - Syncs the entire `worlds/` folder: unloads removed worlds, reloads existing extra worlds, loads newly added world folders, and refreshes `world.yml` on the fallback world.

- **Tab-complete:**
  - `args[0]`: `load`, `unload`, `reload`
  - `args[1]` for `load`: unloaded valid folders in `worlds/`
  - `args[1]` for `unload`: loaded worlds excluding `fallback-world`
  - `args[1]` for `reload`: all loaded worlds in `worlds/`

---

## `/tpworld`

Async teleport between loaded standalone worlds.

- **Permission:** `apis.command.tpworld` (`OP`)
- **Syntax (1, 2, 4, 5, 6, or 7 args):**
  ```text
  /tpworld <world> [<player>] [<x> <y> <z>] [<yaw> <pitch>]
  ```
- **Behavior:**
  - resolves target world via `StandaloneWorldManager.resolveLoadedStandaloneWorld(server, args[0])`;
  - uses `<player>` for 2, 5, or 7 args; otherwise requires a player sender (`player-only`);
  - defaults to the target world's `world.yml` spawn when no coordinates are given (1 or 2 args);
  - when `<x> <y> <z>` is passed without `<yaw> <pitch>`, keeps self camera orientation or defaults to `yaw=0, pitch=0` for another player;
  - teleports asynchronously via `targetPlayer.teleportAsync(destination, TeleportCause.COMMAND)`.
- **Tab-complete:** `args[0]` loaded worlds, `args[1]` online players, followed by current coordinates and rotation angles.

---

## `/setworldspawn` (`standalone` override)

In `dimensions.mode: standalone`, `SetWorldSpawnOverrideCommand` overrides vanilla `/setworldspawn` while keeping the vanilla command registered as `minecraft:setworldspawn` in `SimpleCommandMap`.

- **Permission:** `apis.command.setspawn` (`OP`)
- **Syntax (0, 3, or 5 args; player-only):**
  ```text
  /setworldspawn [<x> <y> <z>] [<yaw> <pitch>]
  ```
- **Behavior:** writes exact decimal `x, y, z, yaw, pitch` atomically (via `.tmp` + `ATOMIC_MOVE`/`REPLACE_EXISTING`) to `worlds/<world>/world.yml`, updates the cached world config, and calls `level.setRespawnData(...)`.
