---
title: Низькорівневі оптимізації ядра
description: Внутрішні оптимізації Netty Connection, ServerChunkCache, CraftPlayer.canSee(), Commodore, PaperEventManager, PluginPackageIndex і фільтрації пакетів.
sidebar:
  order: 1
---

Окрім конфігурованих kill-switches, Apis містить низку низькорівневих доопрацювань гарячих шляхів виконання (hot paths) у Paper та Minecraft, які зменшують алокації, кількість винятків JVM, перемикання потоків та мережевий трафік.

## 1. Батчинг вихідних пакетів `Connection` (Netty EventLoop)

**Патч:** `net/minecraft/network/Connection.java.patch`

```d2 title="Батчинг вихідних пакетів Connection у Netty EventLoop"
direction: down

main: "Main Thread" {
  send: "sendPacket()\nбез flush"
}
lock: "outboundBatchLock" {
  pool: "Пул\nspareBatchPackets"
  buf: "Буфер batchPackets\n(16..256)"
  pool -> buf: "Повторне\nвикористання"
}
netty: "Netty EventLoop" {
  drain: "drainBatchOnEventLoop()"
  write: "Один запис\nу канал"
  drain -> write
}

main.send -> lock.buf: "Накопичення"
lock.buf -> netty.drain: "flush() / tick() /\n256 / scheduleNettyTask"
```

У стандартній реалізації відправка серії дрібних пакетів з головного потоку (`main-thread`) створює окрему задачу `eventLoop().execute(...)` на кожен пакет. Apis впроваджує буферизовану чергу батчів під легким `outboundBatchLock`:

- пакети без прапорця `flush`, що відправляються з-поза меж Netty EventLoop, накопичуються в масивах `batchPackets` / `batchListeners`;
- початкова ємність буфера - **16** елементів, поріг автоматичного скидання (`MAX_BATCH_SIZE_BEFORE_DRAIN`) - **256** пакетів;
- масиви перевикористовуються через пул `spareBatchPackets` / `spareBatchListeners`, що усуває зайвий тиск на GC;
- примусове скидання батча (`flushOutboundBatch`) відбувається в `flush()`, у `tick()`, при переповненні 256 елементів, а також перед `scheduleNettyTask` для суворого збереження порядку **FIFO**;
- при розриві з'єднання (`disconnect()` / `clearPacketQueue()`) незавершений батч коректно очищується з викликом `onPacketDispatchFinish`.

---

## 2. Прямий 4-слотовий кеш `ServerChunkCache`

**Патч:** `net/minecraft/server/level/ServerChunkCache.java.patch`

Ванільний `ServerChunkCache` при кожному зверненні до нового чанка зсуває масив останніх 4 чанків (`lastChunkPos` / `lastChunkStatus` / `lastChunk`). Apis замінює це на **прямий O(1) хеш-слот без зсувів масиву**:

```java
private static int cacheSlot(final int x, final int z) {
    return ((x & 1) | ((z & 1) << 1)) & 3;
}
```

- Слот обчислюється двома бітовими операціями для сусідніх 2×2 чанків (`getFullChunkCached`, `storeInCache`).
- Для безпечної роботи з вивантаженням чанків із паралельних потоків додано `volatile`-прапорець `offThreadCacheInvalidated`, який очищує кеш головного потоку в `moonrise$setFullChunk`, `getChunk`, `getChunkNow` та `getChunkAtIfLoadedImmediately`.

---

## 3. Fast-path `CraftPlayer.canSee()`

**Патч:** `org/bukkit/craftbukkit/entity/CraftPlayer.java.patch`

У `CraftPlayer` підтримується булеве поле `hasHiddenEntities = !this.invertedVisibilityEntities.isEmpty()`, яке оновлюється у `hideEntity0`, `showEntity0`, `unregisterEntity`, `showEntity` та `onEntityRemove`.

- Коли `!this.hasHiddenEntities` (типовий сценарій, якщо гравець не приховував конкретних сутностей), `canSee(Entity)` миттєво повертає `entity.isVisibleByDefault()`, **оминаючи** виклик `entity.getUniqueId()` та пошук у `HashMap`.

---

## 4. Ледачий `Commodore` та побайтовий прескан пулу констант

**Патчі:** `org/bukkit/craftbukkit/util/Commodore.java.patch`, `CraftMagicNumbers.java.patch`, `CraftServer.java.patch`

Переписування байткоду плагінів через ASM (`ClassReader` / `ClassWriter`) - одна з найдорожчих операцій при завантаженні плагінів:

- **`CraftMagicNumbers`:** об'єкт `commodore` ініціалізується ліниво лише при першому реальному зверненні (`synchronized getCommodore()`), а при `compatibility.legacy.plugin-bytecode-rerouting: false` трансформація класів взагалі пропускається.
- **`Commodore.mayNeedConversion`:** перед запуском ASM виконується без-алокаційний побайтовий парсинг заголовка `.class` (`0xCAFEBABE`) та таблиці `constant pool`. Метод перевіряє `CONSTANT_Utf8` на наявність префіксів `org/bukkit/`, `org/spigotmc/`, `com/destroystokyo/`, `io/papermc/`, `com.mysql.jdbc.Driver` (та `java/lang/Enum`, `java/util/EnumSet`, `java/util/EnumMap`, `com/google/common/` для `enum-compatibility-mode <= 1.20.6`). Якщо збігів немає - ASM не викликається.
- **`selectRenames(pluginVersion)`:** замість створення `new HashMap<>(RENAMES)` на кожен клас обирається одна з наперед створених незмінних карт (`RENAMES_WITH_COW`, `RENAMES_WITH_CUBE_MOB`, `RENAMES_WITH_COW_AND_CUBE_MOB`).

---

## 5. Оптимізація `PaperEventManager` та слухачів подій

**Патчі:** `io/papermc/paper/plugin/manager/PaperEventManager.java.patch`, `ServerGamePacketListenerImpl.java.patch`

- **`getRegistrationClass` через `ClassValue`:** замість рекурсивного `clazz.getDeclaredMethod("getHandlerList")` із генерацією і перехватом `NoSuchMethodException` на кожному рівні ієрархії події, використовується кеш `ClassValue<Class<? extends Event>> EVENT_REGISTRATION_CLASSES` та перевірка `current.getDeclaredMethods()` (`name.equals("getHandlerList") && parameterCount == 0`).
- **`createRegisteredListeners` без `Sets.union`:** вилучено створення двох `ImmutableSet` і `Sets.union(Set.of(...), Set.of(...))`; тепер використовується попередньо виділений `ArrayList`, куди додаються `declaredMethods` та лише успадковані `publicMethods` (`pub.getDeclaringClass() != listenerClazz`).
- **`PlayerJumpEvent` fast-path:** у `ServerGamePacketListenerImpl#handlePlayerPositionChange` об'єкти `Location from`, `Location to` та `PlayerJumpEvent` створюються лише тоді, коли `PlayerJumpEvent.getHandlerList().hasListeners()` повертає `true`.
- **`PlayerMoveEvent` fast-path:** у `ServerGamePacketListenerImpl` (методи `handleMoveVehicle` та `handleMovePlayer`) створення `Location from`, `Location to` та виклик `PlayerMoveEvent` пропускаються, коли `PlayerMoveEvent.getHandlerList().hasListeners()` повертає `false`. Позиції відстеження (`updateLastEventPosIfMoved`) водночас оновлюються коректно, щоб уникнути хибних спрацьовувань при пізнішому підключенні слухача.

---

## 6. O(1) Package Indexing (`PluginPackageIndex`)

**Патчі:** `ConfiguredPluginClassLoader.java.patch`, `PluginPackageIndex.java.patch`, `PluginClassLoader.java.patch`, `PaperPluginClassLoader.java.patch`, `PaperSimplePluginClassLoader.java.patch`, `SimpleListPluginClassLoaderGroup.java.patch`, `SpigotPluginClassLoaderGroup.java.patch`

При кросплагінному пошуку класів у `SimpleListPluginClassLoaderGroup` стандартний Paper перебирає завантажувачі плагінів і шукає `.class` в їхніх JAR-файлах. В Apis:

1. Під час ініціалізації `PluginPackageIndex.fromJar(jar, libraryLoader)` один раз сканує записи основного JAR та `URLClassLoader` бібліотек (враховуючи `META-INF/versions/`), зберігаючи імена пакетів у `ConcurrentHashMap.newKeySet()`.
2. Під час `getClassByName` завантажувачі, у яких `mayContainPackage(loader, packageName) == false`, пропускаються за **O(1)**.
3. **Fallback для runtime-кодогенерації:** якщо клас не знайдено, а хоча б один завантажувач було пропущено (`anySkipped`), виконується резервний прохід лише по пропущених завантажувачах (для класів, згенерованих у runtime через ByteBuddy / ASM / `defineClass`). При успіху динамічний пакет реєструється через `recordDynamicPackage(...)`.

---

## 7. Обрізання пакетів за дистанцією (`packet-range-clamping`)

**Патчі:** `ChunkMap.java.patch`, `ServerEntity.java.patch`, `LivingEntity.java.patch`, `ServerLevel.java.patch`

Коли `network.packet-range-clamping.full-packet-broadcast` переведено у `false` у [configs/apis.yml](../../configuration/apis-config/), Apis обмежує радіус розсилки «гучних» пакетів у натовпах (наприклад, у лобі чи на спавні):

| Тип пакетів | Параметр у `configs/apis.yml` | Дефолт (діапазон) | Реалізація |
| --- | --- | --- | --- |
| **Снаряди (`Projectile`)** | `projectile-tracking-range` | `32` (`[0, 256]`) | `ChunkMap.TrackedEntity#getEffectiveRange()` через `clampEntityTrackingRange` |
| **Екіпіровка (`ClientboundSetEquipmentPacket`)** | `armor-equipment-range` | `32` (`[0, 256]`) | `ServerEntity#sendPairingData` і `LivingEntity#updatePlayersWithNewEquipment` (`sendToTrackingPlayersFiltered` із додатковою перевіркою `canSee`) |
| **Частинки (`sendParticles`)** | `particle-broadcast-range` | `16.0` (`[0.0, 256.0]`) | `ServerLevel#sendParticles` через `shouldDropParticlePacket` |

---

## 8. Додаткові системні оптимізації

- **Ленива ініціалізація `DefaultAttributes` (`DefaultAttributes.java.patch`):** замість завантаження класів усіх ~90 мобів та побудови `AttributeSupplier` при старті, атрибути створюються на першу вимогу через `SUPPLIER_FACTORIES` і кешуються в `ConcurrentHashMap`.
- **Відключення NUMA/JNA поза Linux (`OSNuma.java`, `MoonriseConstants.java.patch`, `MoonriseCommon.java.patch`, `Util.java.patch`):** на macOS/Windows одразу використовується `OSNuma.NoOp.INSTANCE` (`NUMA_ENABLE = false`) без завантаження `LinuxNuma` та JNA.
- **Лениве нативне шифрування (`Natives.java`, `ServerConnectionListener.java.patch`):** `Natives.cipher` завантажується лише коли `server.usesAuthentication()` є `true`, уникаючи `dlopen` нативної криптографії за проксі Velocity/BungeeCord.
