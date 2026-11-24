---
title: Standalone Worlds & Storage
description: Built-in worlds/ management replacing Multiverse-Core, world.yml config, RAM-only mode (0 disk writes), and stale session.lock recovery.
sidebar:
  order: 1
---

Apis includes built-in multi-world management that replaces external plugins like Multiverse-Core. It works out of the box when `dimensions.mode: standalone` is set in [`configs/apis.yml`](/configuration/apis-config/).

## The `worlds/` Folder & Auto-Loading

```d2 title="Standalone World Management Architecture"
direction: down

boot: "Server Boot (dimensions.mode = standalone)"
lock: "session.lock Check (PID & hostId)"
hub: "worlds/hub (fallback-world + world.yml)"
extra: "Other worlds/* dirs (Void generator + world.yml)"
unload: "/world unload"
save: "storage.world-saving?"
disk: "Disk Writes (region/*.mca)"
ram: "RAM-Only Mode (0 disk writes)"

boot -> lock
lock -> hub: "Primary world"
boot -> extra: "Auto-load subfolders"
extra -> unload
unload -> hub: "Evacuate players to spawn"
hub -> save
save -> disk: "true"
save -> ram: "false"
```

Instead of cluttering the root folder with `world/`, `world_nether/`, and `world_the_end/`, Apis keeps all worlds inside `worlds/` (configurable via `--worlds-dir`):

- Nether and End are not auto-created or loaded in `standalone` mode.
- Every subfolder inside `worlds/` (excluding hidden dot-folders like `.git`) auto-loads at startup as an empty **Void** world with no ore, biome, or structure generation.
- Each world lives cleanly at `worlds/<name>/` without nested `dimensions/minecraft/...` subdirectories.

---

## Fallback World (`fallback-world`)

`dimensions.fallback-world` (default `hub`) defines the primary server world:

- Players spawn here on join and get evacuated to its spawn point when another world is unloaded via `/world unload`.
- If `worlds/hub/` is empty on first boot, Apis generates a starter bedrock platform at `(0, 60, 0)` and writes `worlds/hub/world.yml` with spawn `(0.5, 61.0, 0.5)`.

---

## World Config: `worlds/<world>/world.yml`

Each world folder in `worlds/` gets its own `world.yml`:

```yaml
spawn:
  x: 0.5
  y: 61.0
  z: 0.5
  yaw: 0.0
  pitch: 0.0
force-spawn: true
default-game-mode: adventure
```

| Key | Default | Behavior |
| --- | --- | --- |
| `spawn.x`, `spawn.y`, `spawn.z` | `0.5`, `61.0`, `0.5` | Exact spawn coordinates |
| `spawn.yaw`, `spawn.pitch` | `0.0`, `0.0` | Player camera orientation |
| `force-spawn` | `true` | Teleports joining players to `world.yml` spawn every time instead of last logout position |
| `default-game-mode` | `"survival"` | `survival`, `creative`, `adventure`, or `spectator`. Enforced on join, respawn, and world change |

:::tip
To set spawn in-game, stand on the target block and run [`/setworldspawn`](/worlds/commands/#setworldspawn-standalone-override). Exact coordinates are saved straight to `world.yml`.
:::

---

## RAM-Only Mode (`storage.world-saving: false`)

For hubs and minigame arenas that should reset cleanly on every restart, disable disk saving in `configs/apis.yml`:

```yaml
storage:
  world-saving: false
```

In this mode:
- chunks, region files, `level.dat`, and `data/*.dat` are never written to disk;
- player data (`playerdata/`, `stats/`, `advancements/`) is not written and creates zero empty folders (legacy stats migration is skipped too);
- empty worlds outside `dimensions.always-ticking` automatically sleep with 0 players (`dimensions.never-ticking` blocks ticking even when players are inside);
- server shutdown skips flushing world buffers (especially fast when paired with `system.lifecycle.graceful-shutdown: false`).

:::tip
If you want `/save-all`, unloads, and shutdown saves to work while disabling background tick saves, keep `storage.world-saving: true` and set `storage.periodic-autosave: false`. Setting `world-saving: false` automatically disables periodic autosaves as well.
:::

---

## Stale `session.lock` Auto-Recovery

After an abrupt container kill (`SIGKILL`), leftover `session.lock` files normally block startup.

- **Normal mode:** Apis stores the owning process PID and host ID inside `session.lock`. If a lock conflict occurs on boot and that PID is no longer alive on the same host, Apis clears the stale `session.lock` and continues starting.
- **With `storage.world-saving: false`:** any old `session.lock` is deleted automatically and no new disk lock file is created.

---

## Returning to Standard Mode (`vanilla`)

If you need normal terrain generation, Nether, and End for a survival server, switch mode in `configs/apis.yml`:

```yaml
dimensions:
  mode: vanilla
  enabled:
    - minecraft:overworld
    - minecraft:the_nether
    - minecraft:the_end
```
