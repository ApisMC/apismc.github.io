---
title: Low-Level Core Optimizations
description: Internal hot-path optimizations across Netty Connection, ServerChunkCache, CraftPlayer.canSee(), Commodore, PaperEventManager, PluginPackageIndex, and packet filtering.
sidebar:
  order: 1
---

Besides configurable kill-switches, Apis includes low-level patches on hot execution paths in Paper and Minecraft to cut allocations, JVM exceptions, thread handoffs, and network traffic.

## 1. Outbound Packet Batching in `Connection` (Netty EventLoop)

**Patch:** `net/minecraft/network/Connection.java.patch`

```d2 title="Connection Outbound Packet Batching in Netty EventLoop"
direction: down

main: "Main Thread" {
  send: "sendPacket()\nwithout flush"
}
lock: "outboundBatchLock" {
  pool: "Pool\nspareBatchPackets"
  buf: "batchPackets buffer\n(16..256)"
  pool -> buf: "Reuse"
}
netty: "Netty EventLoop" {
  drain: "drainBatchOnEventLoop()"
  write: "Single channel\nwrite"
  drain -> write
}

main.send -> lock.buf: "Buffer"
lock.buf -> netty.drain: "flush() / tick() /\n256 / scheduleNettyTask"
```

Normally, sending a burst of small packets from `main-thread` schedules a separate `eventLoop().execute(...)` task per packet. Apis adds a buffered batch queue guarded by a lightweight `outboundBatchLock`:

- Packets sent from off the Netty EventLoop without `flush` accumulate inside `batchPackets` / `batchListeners`.
- Initial capacity is **16** entries, with an auto-drain threshold (`MAX_BATCH_SIZE_BEFORE_DRAIN`) of **256** packets.
- Arrays are pooled via `spareBatchPackets` / `spareBatchListeners` to avoid GC churn.
- Batches force-flush (`flushOutboundBatch`) inside `flush()`, `tick()`, upon hitting 256 items, and right before `scheduleNettyTask` to keep strict **FIFO** ordering.
- On disconnect (`disconnect()` / `clearPacketQueue()`), pending batches drain cleanly and invoke `onPacketDispatchFinish`.

---

## 2. Direct 4-Slot Cache in `ServerChunkCache`

**Patch:** `net/minecraft/server/level/ServerChunkCache.java.patch`

Vanilla `ServerChunkCache` shifts its 4-entry arrays (`lastChunkPos` / `lastChunkStatus` / `lastChunk`) on every chunk lookup miss. Apis swaps that for a **direct O(1) hash slot with zero array shifts**:

```java
private static int cacheSlot(final int x, final int z) {
    return ((x & 1) | ((z & 1) << 1)) & 3;
}
```

- Computes the slot in two bitwise ops for adjacent 2x2 chunks (`getFullChunkCached`, `storeInCache`).
- To stay safe when chunks unload from worker threads, a `volatile` `offThreadCacheInvalidated` flag triggers cache cleanup on the main thread inside `moonrise$setFullChunk`, `getChunk`, `getChunkNow`, and `getChunkAtIfLoadedImmediately`.

---

## 3. Fast-Path for `CraftPlayer.canSee()`

**Patch:** `org/bukkit/craftbukkit/entity/CraftPlayer.java.patch`

`CraftPlayer` tracks a boolean `hasHiddenEntities = !this.invertedVisibilityEntities.isEmpty()`, kept up to date across `hideEntity0`, `showEntity0`, `unregisterEntity`, `showEntity`, and `onEntityRemove`.

- When `!this.hasHiddenEntities` (true whenever a player has no per-entity hides), `canSee(Entity)` returns `entity.isVisibleByDefault()` directly, skipping both `entity.getUniqueId()` and the `HashMap` lookup.

---

## 4. Lazy `Commodore` & Byte-Level Constant Pool Pre-Scan

**Patches:** `org/bukkit/craftbukkit/util/Commodore.java.patch`, `CraftMagicNumbers.java.patch`, `CraftServer.java.patch`

Plugin bytecode rewriting via ASM (`ClassReader` / `ClassWriter`) is one of the heaviest steps during plugin loading:

- **`CraftMagicNumbers`:** `commodore` initializes lazily on first actual demand (`synchronized getCommodore()`). If `compatibility.legacy.plugin-bytecode-rerouting` is `false`, bytecode rewriting is skipped completely.
- **`Commodore.mayNeedConversion`:** before touching ASM, a zero-allocation byte scanner parses the `.class` header (`0xCAFEBABE`) and `constant pool`. It scans `CONSTANT_Utf8` entries for `org/bukkit/`, `org/spigotmc/`, `com/destroystokyo/`, `io/papermc/`, `com.mysql.jdbc.Driver` (plus `java/lang/Enum`, `java/util/EnumSet`, `java/util/EnumMap`, and `com/google/common/` when `enum-compatibility-mode <= 1.20.6`). No match means ASM never runs.
- **`selectRenames(pluginVersion)`:** instead of allocating `new HashMap<>(RENAMES)` per class, it picks one of the prebuilt immutable maps (`RENAMES_WITH_COW`, `RENAMES_WITH_CUBE_MOB`, `RENAMES_WITH_COW_AND_CUBE_MOB`).

---

## 5. `PaperEventManager` & Event Listener Optimizations

**Patches:** `io/papermc/paper/plugin/manager/PaperEventManager.java.patch`, `ServerGamePacketListenerImpl.java.patch`

- **`getRegistrationClass` via `ClassValue`:** replaces recursive `clazz.getDeclaredMethod("getHandlerList")` calls (which throw and catch `NoSuchMethodException` at each hierarchy level) with a `ClassValue<Class<? extends Event>> EVENT_REGISTRATION_CLASSES` cache scanning `current.getDeclaredMethods()` (`name.equals("getHandlerList") && parameterCount == 0`).
- **`createRegisteredListeners` without `Sets.union`:** drops two `ImmutableSet` allocations and `Sets.union(Set.of(...), Set.of(...))` in favor of a pre-sized `ArrayList` holding `declaredMethods` plus inherited `publicMethods` (`pub.getDeclaringClass() != listenerClazz`).
- **`PlayerJumpEvent` fast-path:** in `ServerGamePacketListenerImpl#handlePlayerPositionChange`, `Location from`, `Location to`, and `PlayerJumpEvent` are only allocated if `PlayerJumpEvent.getHandlerList().hasListeners()` is `true`.
- **`PlayerMoveEvent` fast-path:** in `ServerGamePacketListenerImpl` (`handleMoveVehicle` and `handleMovePlayer`), `Location from`, `Location to`, and event dispatch are skipped whenever `PlayerMoveEvent.getHandlerList().hasListeners()` is `false`. Tracking coordinates (`updateLastEventPosIfMoved`) still update properly so later listener registration will not misfire.

---

## 6. O(1) Package Indexing (`PluginPackageIndex`)

**Patches:** `ConfiguredPluginClassLoader.java.patch`, `PluginPackageIndex.java.patch`, `PluginClassLoader.java.patch`, `PaperPluginClassLoader.java.patch`, `PaperSimplePluginClassLoader.java.patch`, `SimpleListPluginClassLoaderGroup.java.patch`, `SpigotPluginClassLoaderGroup.java.patch`

When resolving cross-plugin classes in `SimpleListPluginClassLoaderGroup`, upstream Paper walks through plugin classloaders looking up `.class` entries in every JAR. In Apis:

1. On startup, `PluginPackageIndex.fromJar(jar, libraryLoader)` scans the plugin JAR and library `URLClassLoader` entries once (including `META-INF/versions/`), storing package names in a `ConcurrentHashMap.newKeySet()`.
2. Inside `getClassByName`, any loader where `mayContainPackage(loader, packageName) == false` is skipped in **O(1)**.
3. **Runtime codegen fallback:** if a class is not found and at least one loader was skipped (`anySkipped`), a fallback scan runs only over the skipped loaders (supporting ByteBuddy / ASM / `defineClass` runtime classes). Matches register via `recordDynamicPackage(...)` for subsequent lookups.

---

## 7. Distance-Based Packet Clamping (`packet-range-clamping`)

**Patches:** `ChunkMap.java.patch`, `ServerEntity.java.patch`, `LivingEntity.java.patch`, `ServerLevel.java.patch`

When `network.packet-range-clamping.full-packet-broadcast` is set to `false` in [configs/apis.yml](/configuration/apis-config/), Apis caps broadcast distance for noisy packets in dense lobbies and spawns:

| Packet Type | `configs/apis.yml` Key | Default (Range) | Implementation |
| --- | --- | --- | --- |
| **Projectiles (`Projectile`)** | `projectile-tracking-range` | `32` (`[0, 256]`) | `ChunkMap.TrackedEntity#getEffectiveRange()` via `clampEntityTrackingRange` |
| **Armor / Equipment (`ClientboundSetEquipmentPacket`)** | `armor-equipment-range` | `32` (`[0, 256]`) | `ServerEntity#sendPairingData` and `LivingEntity#updatePlayersWithNewEquipment` (`sendToTrackingPlayersFiltered` with `canSee` check) |
| **Particles (`sendParticles`)** | `particle-broadcast-range` | `16.0` (`[0.0, 256.0]`) | `ServerLevel#sendParticles` via `shouldDropParticlePacket` |

---

## 8. Additional Engine Tweaks

- **Lazy `DefaultAttributes` (`DefaultAttributes.java.patch`):** instead of loading ~90 mob classes and building `AttributeSupplier` maps at boot, attributes build on first use via `SUPPLIER_FACTORIES` and cache in a `ConcurrentHashMap`.
- **Disable NUMA/JNA outside Linux (`OSNuma.java`, `MoonriseConstants.java.patch`, `MoonriseCommon.java.patch`, `Util.java.patch`):** macOS and Windows select `OSNuma.NoOp.INSTANCE` (`NUMA_ENABLE = false`) immediately without loading `LinuxNuma` or JNA.
- **Lazy native cipher (`Natives.java`, `ServerConnectionListener.java.patch`):** `Natives.cipher` loads only when `server.usesAuthentication()` is `true`, skipping native crypto `dlopen` behind Velocity/BungeeCord proxies.
