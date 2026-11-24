---
title: Kill-Switches
description: How binary kill-switches work in configs/apis.yml, the internal FeatureRegistry engine, and NullPointerException safety guarantees.
sidebar:
  order: 2
---

**Kill-Switches** in `configs/apis.yml` let you turn off any subsystem you do not need (mob AI, natural spawning, redstone, chunk ticks, recipes, or advancements) with a single `false` flag without breaking plugin compatibility.

Here is how the internals work under the hood for server admins and plugin developers.

## How `FeatureRegistry` Works

```d2 title="FeatureRegistry and Kill-Switches Flow"
direction: down

cfg: "configs/apis.yml"
phase1: "Phase 1: applyEarly()" {
  pruning: "Pre-disk skip\n(DFU, recipes, loot, structures)"
  masks: "long bitmasks\n(disabledMask0 / disabledMask1)"
}
phase2: "Phase 2: resolveRegistries()" {
  sets: "ReferenceOpenHashSet\n(dimensions & type-filter)"
}
tick: "Hot tick loops" {
  check: "O(1) bit check"
  skip: "Skip or fallback\n(empty collections)"
  run: "Standard Paper logic"
  check -> skip: "false\n(disabled)"
  check -> run: "true\n(enabled)"
}

cfg -> phase1
phase1.masks -> tick.check
phase1 -> phase2
```

### Phase 1: Bitmask Packing (`applyEarly`)

All 77 boolean engine flags live in the `Feature` enum (`MAX_SUPPORTED_FEATURES = 128`). During early startup in `ApisConfig.loadEarly`, `FeatureRegistry.applyEarly(config)` packs them into two `volatile long` fields:

```java
public static boolean isDisabled(final Feature feature) {
    return feature.word == 0
        ? (disabledMask0 & feature.bit) != 0L
        : (disabledMask1 & feature.bit) != 0L;
}
```

- A bit is set to `1` when its value in `configs/apis.yml` is `false` (kill-switch active).
- Numeric limits from `packet-range-clamping` (`projectileTrackingRange`, `particleBroadcastRangeSq`, `armorEquipmentRange`) are cached alongside the bitmasks.

### Phase 2: Registry Resolution (`resolveRegistries`)

Once `RegistryAccess` exists (inside `DedicatedServer.initServer()` and on `/apis reload`), `FeatureRegistry.resolveRegistries(...)` resolves runtime sets:
- String keys from `dimensions.enabled`, `dimensions.always-ticking`, `dimensions.never-ticking`, and `entities.ai.type-filter` are converted into immutable `ReferenceOpenHashSet` instances (`enabledDimensions`, `alwaysTickingDimensions`, `neverTickingDimensions`, `aiTypeFilterTypes`).
- Runtime lookups use fast identity comparisons (`==` / identity hash) in memory.
- `minecraft:overworld` is always protected and force-added to `enabledDimensions`, even if removed from YAML.
- Dynamic dimension ticking (`isWorldTickDisabled`) checks in order: `never-ticking` -> `always-ticking` -> active players in world (empty worlds outside `always-ticking` do not tick).

---

## Switch Groups & Code Behavior

### 1. Mob AI (`entities.ai`)

```yaml
entities:
  ai:
    enabled: false
    type-filter:
      - minecraft:villager
    sub-features:
      goal-selector: false
      brain: false
      pathfinding: false
      sensors: false
```

- **Master switch (`entities.ai.enabled: false`)** and **`type-filter`**:
  - Skips `this.registerGoals()` in the `Mob` constructor (`Mob.java.patch`).
  - Returns immediately in `Mob#inactiveTick()` and `Mob#serverAiStep()`.
- **Sub-features (applied when `entities.ai.enabled: true`):**
  - `goal-selector: false` - early `return` in `GoalSelector#tick()` and `GoalSelector#tickRunningGoals(boolean)`.
  - `brain: false` - early `return` in `Brain#tick(...)` and skips `Brain` NBT deserialization in `LivingEntity#readAdditionalSaveData`.
  - `pathfinding: false` - early `return` in `PathNavigation#tick()`.
  - `sensors: false` - early `return` in `Brain#tickSensors(...)` and `Sensing#tick()`.

### 2. Natural Spawning (`spawning.natural`)

```yaml
spawning:
  natural:
    enabled: false
    sub-features:
      monsters: false
      animals: false
      custom-spawners: false
```

- `spawning.natural.enabled: false`: sets `doMobSpawning = false` and `spawningCategories = List.of()` in `ServerChunkCache#tickChunks`, and passes `Collections.emptyList()` for custom spawners in `MinecraftServer#createLevel`.
- `monsters: false` / `animals: false`: drops `MobCategory.MONSTER` or the remaining categories in `NaturalSpawner#getFilteredSpawningCategories`, and zeros spawn counts per category in `ServerChunkCache#tickChunks`.
- `custom-spawners: false`: skips registering `PhantomSpawner`, `PatrolSpawner`, `CatSpawner`, `VillageSiege`, and `WanderingTraderSpawner` when initializing the Overworld.

### 3. Chunk, Block, Fluid & Physics Ticks

- **`chunks.ticking.enabled: false`**: skips `tickChunks` completely in `ServerChunkCache#tick` (`random-ticks`, `block-ticks`, `fluid-ticks`, and `poi-ticking` are bypassed).
- **`random-ticks: false`**: skips random block ticks in `ServerLevel#tickChunk`.
- **`block-ticks: false` / `fluid-ticks: false`**: disables `blockTicks.tick` and `fluidTicks.tick` in `ServerLevel#tick`.
- **`poi-ticking: false`**: skips `PoiManager#tick` spatial index updates in `ChunkMap`.
- **`block-entities.ticking.enabled: false`**: early `return` in `Level#tickBlockEntities()` (stops furnaces, beacons, hoppers, etc.); **`hoppers: false`** targets `HopperBlockEntity#pushItemsTick`.
- **`blocks-and-physics`**:
  - `redstone: false` -> early `return` in `updateSurroundingRedstone`, `onPlace`, and `neighborChanged` on `RedstoneWireBlock`.
  - `block-gravity: false` -> early `return` in `FallingBlock#tick`.
  - `leaf-decay: false` -> early `return` in `LeavesBlock#randomTick`.
  - `fire-spread: false` -> early `return` in `FireBlock#tick`.
  - `item-physics: false` -> `ItemEntity#tick` runs `this.inactiveTick(); return;` (keeps pickup and despawn timers running, skips gravity, movement, and collisions).
  - `block-events: false` -> skips `ServerLevel#blockEvent` and `runBlockEvents`, clearing `blockEvents.clear()`.

### 4. World Environment & Entities (`world-environment`, `entities`)

- **`world-environment`**:
  - `world-border-tick: false` - skips per-tick `WorldBorder#tick` in `ServerLevel` and client `CraftWorldBorder` updates.
  - `environment-attributes: false` - skips `invalidateTickCache()` in `EnvironmentAttributeSystem`.
  - `game-events: false` - skips vibration broadcasts in `ServerLevel#gameEvent` (`GameEventDispatcher#post`).
- **`entities`**:
  - `despawn-checks: false` - skips per-tick `Entity#checkDespawn()` in `ServerLevel`.
  - `inside-block-checks: false` - skips `checkInsideBlocks` and `insideEffectCollector` (cobwebs, portals, berry bushes).
  - `fluid-interaction: false` - skips `updateFluidInteraction()` and `updateSwimming()` in `Entity#baseTick`, forcing `wasEyeInWater = false`.
  - `sprint-particles: false` - skips `Entity#spawnSprintParticle()`.

### 5. Player Mechanics & Progression (`players`, `gameplay.advancements`)

- **`players.locator-bar: false`**: early exit in `ServerWaypointManager` (`trackWaypoint`, `updateWaypoint`, `addPlayer`, `updatePlayer`) and disables `WAYPOINT_TRANSMIT_RANGE` / `isReceivingWaypoints()` tracking in `ServerPlayer`.
- **`players.inventory-special-item-updates: false`**: skips per-tick inventory slot scans in `synchronizeSpecialItemUpdates` (maps, compasses).
- **`players.vanilla-scoreboard-criteria: false`**: skips updating vanilla scoreboard criteria in `updateScoreForCriteria`.
- **`players.floating-kick: false`**: disables hover kick counters (`aboveGroundTickCount` and `aboveGroundVehicleTickCount`) in `ServerGamePacketListenerImpl`.
- **`players.statistics` and `gameplay.advancements`**: criteria triggers (`CriteriaTriggers.TICK`, `LEVITATION`, `LOCATION`) follow `gameplay.advancements` exclusively, while `players.statistics: false` only blocks `awardStat`, `resetStat`, `checkRidingStatistics`, and movement stat counters (`causeFoodExhaustion` still works if `players.hunger: true`).
- **`players.data-saving: false` or `storage.world-saving: false`**: unified `isPlayerDataSavingDisabled()` check blocks `ServerStatsCounter#save`, `PlayerAdvancements#save`, and legacy migration (`<name>.json -> <uuid>.json`), guaranteeing `0` disk writes under `stats/` and `advancements/` (even empty folders are never created).

### 6. Periodic Autosave (`storage.periodic-autosave`)

- `storage.periodic-autosave: false` disables background tick-time saving in `MinecraftServer` (`autoSave()`, incremental `playerList.saveAll`, `saveGlobalData`, `saveIncrementally`) and `ChunkMap` (`chunkHolderManager.autoSave()`).
- Chunk unloads, `/save-all`, and shutdown saves still run normally. Setting `storage.world-saving: false` disables this automatically too.

### 7. Datapack Registry Pruning (Pre-Disk Pruning)

When `gameplay.recipes`, `gameplay.advancements`, `gameplay.loot-tables`, `chunks.structures`, `chunks.biome-decoration`, or `startup.test-registries` are set to `false`, `ResourceManagerRegistryLoadTask.load` and `TagLoader` **skip scanning the filesystem** (`listMatchingResources`) and skip JSON parsing altogether for those registries. When `chunks.structures: true` and `chunks.biome-decoration: false`, only `Registries.CARVER` is pruned while `FEATURE` / `PLACED_FEATURE` remain intact for structure generation (`ChunkGenerator` still skips chunk decoration).

If `gameplay.advancements: true` while `chunks.structures: false` or `gameplay.recipes: false`, recipes use a read-only lookup and any dependent advancements (plus their `parent` children) are softly skipped with a single startup `WARN`. Remaining vanilla and custom advancements keep working, while real broken datapack JSON files still report normal load errors.

---

## Safety Guarantees & `NullPointerException` Protection

Disabling systems in Apis never leaves internal Minecraft fields `null` or breaks Bukkit/Paper API contracts:

| Subsystem | Safety Mechanism (Fallback Objects & Contracts) |
| --- | --- |
| **Mob AI** | `goalSelector`, `targetSelector`, `navigation`, `sensing` on `Mob`, plus default `Brain` on `LivingEntity`, are built before checking `isAiDisabled`. Calling API methods on an empty `GoalSelector` is safe. |
| **Mob Spawning** | `ServerChunkCache#tickChunks` and `MinecraftServer#createLevel` work with non-null empty lists (`List.of()`, `Collections.emptyList()`). |
| **Pruned Datapack Registries** | `RegistryLoadTask#freezeRegistry` calls `bindAllTagsToEmpty()` and `ApisHooks.bindPrunedFallbackHolders`, binding dangling `Holder.Reference` entries to safe stubs (`LootTable.EMPTY`, `AllOfCondition`, `SequenceFunction`, `EmptySlotSource`). `MappedRegistry#get(TagKey)` returns a lazy empty `HolderSet.Named` backed by `prunedFallbackTags`. |
| **Recipes & Advancements** | `RecipeManager` initializes `RecipeMap.EMPTY` and `List.of()`; `ServerAdvancementManager` builds `ImmutableMap.of()` and `new AdvancementTree()`. |
| **DFU (`startup.datafixers: false`)** | `DATA_FIXER` and `FILE_FIXER` are never `null`: `DataFixers#createFixerUpper` builds an empty schema `0` (`createEmptyDataFixerSchema` using `ConcurrentHashMap<>` and `DSL.remainderType()`) with a no-op `DataFix`. Loading a world with an older `DataVersion` prints a single startup `WARN`. |
| **Structures & Portals** | `ServerLevel#findNearestMapStructure` returns `@Nullable BlockPos` (`null`), `EndPortalBlock` / `NetherPortalBlock#getPortalDestination` return `@Nullable TeleportTransition` (`null`), and `FlatLevelGeneratorSettings` returns `Optional.empty()` and `List.of()`. |
| **Lazy Block Caches** | `BlockBehaviour.BlockStateBase` initializes `Shapes.empty()` / `EMPTY_OCCLUSION_SHAPES`, and all 15 public and Moonrise getters call thread-safe `ensureCacheInitialized()` with reentrancy protection via `cacheInitializing`. |
| **Spark & KeyPair** | Every method in `SparksFly` guards with `if (this.spark == null) return;`. When `network.generate-keypair: false`, `MinecraftServer#getKeyPair()` generates keys lazily on first actual access. |
| **Leak & State Reset Protection** | `block-events: false` clears the `blockEvents` queue (`blockEvents.clear()`); `fluid-interaction: false` resets `wasEyeInWater = false`; `statistics: false` with `hunger: true` preserves `causeFoodExhaustion`. |

:::caution
Changing startup or registry flags (`startup.*`, `caches.*`, `gameplay.recipes`, `gameplay.advancements`, `gameplay.loot-tables`, `chunks.structures`, `chunks.biome-decoration`) requires a **full server restart**, since they apply during JVM and registry boot. Runtime switches (AI, physics, ticks, spawning, environment, entities, player mechanics, periodic autosave, packet clamping) apply right away on `/apis reload`.
:::

:::note
Whenever a plugin or server path hits a blocked operation (`createWorld`, `findNearestMapStructure`, `getWorld` on a disabled dimension), `ApisDiagnostics.warnBlocked` logs a one-time diagnostic line:
`Blocked plugin '<name>'|server call <ctx>(<target>) - disabled by <key> in apis.yml`.
:::
