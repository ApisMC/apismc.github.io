---
title: Вимкнення систем (Kill-Switches)
description: Як працюють бінарні вимикачі систем у configs/apis.yml, внутрішній рушій FeatureRegistry та гарантії захисту від NullPointerException.
sidebar:
  order: 2
---

**Kill-Switches** у `configs/apis.yml` дозволяють одним параметром (`false`) вимкнути будь-яку непотрібну на вашому сервері механіку - AI мобів, природний спавн, редстоун, тіки чанків, рецепти чи досягнення - без шкоди для стабільності плагінів.

Нижче описано, як це працює всередині ядра для просунутих адміністраторів і розробників.

## Як працює `FeatureRegistry` (технічні деталі)

```d2 title="Схема роботи FeatureRegistry та Kill-Switches"
direction: down

cfg: "configs/apis.yml"
phase1: "Фаза 1: applyEarly()" {
  pruning: "Пропуск до диска\n(DFU, рецепти, лут, структури)"
  masks: "Бітові маски long\n(disabledMask0 / disabledMask1)"
}
phase2: "Фаза 2: resolveRegistries()" {
  sets: "ReferenceOpenHashSet\n(виміри та type-filter)"
}
tick: "Гарячі цикли тіку" {
  check: "O(1) перевірка біта"
  skip: "Пропуск або fallback\n(порожні колекції)"
  run: "Стандартна логіка Paper"
  check -> skip: "false\n(вимкнено)"
  check -> run: "true\n(увімкнено)"
}

cfg -> phase1
phase1.masks -> tick.check
phase1 -> phase2
```

### Фаза 1: Бітова маска (`applyEarly`)

Усі 77 булевих можливостей ядра описані в enum `Feature` (`MAX_SUPPORTED_FEATURES = 128`). Під час раннього завантаження `ApisConfig.loadEarly` метод `FeatureRegistry.applyEarly(config)` пакує прапорці у два `volatile long` слова:

```java
public static boolean isDisabled(final Feature feature) {
    return feature.word == 0
        ? (disabledMask0 & feature.bit) != 0L
        : (disabledMask1 & feature.bit) != 0L;
}
```

- Біт виставляється в `1`, коли значення в `configs/apis.yml` дорівнює `false` (kill-switch активовано).
- Паралельно зберігаються числові межі `packet-range-clamping` (`projectileTrackingRange`, `particleBroadcastRangeSq`, `armorEquipmentRange`).

### Фаза 2: Резолвінг реєстрів (`resolveRegistries`)

Після створення `RegistryAccess` (у `DedicatedServer.initServer()` та при `/apis reload`) виконується `FeatureRegistry.resolveRegistries(...)`:
- рядкові ідентифікатори з `dimensions.enabled`, `dimensions.always-ticking`, `dimensions.never-ticking` та `entities.ai.type-filter` перетворюються на незмінні `ReferenceOpenHashSet` (`enabledDimensions`, `alwaysTickingDimensions`, `neverTickingDimensions`, `aiTypeFilterTypes`);
- перевірка здійснюється через швидке порівняння посилань (`==` / identity hash) у пам'яті;
- основний вимір `minecraft:overworld` примусово захищений і додається до `enabledDimensions`, навіть якщо його вилучили з YAML;
- динамічний тік вимірів (`isWorldTickDisabled`): пріоритет `never-ticking` -> `always-ticking` -> наявність гравців у світі (порожні виміри поза `always-ticking` не тікають).

---

## Групи вимикачів та поведінка в коді

### 1. Штучний інтелект мобів (`entities.ai`)

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

- **Головний вимикач (`entities.ai.enabled: false`)** та **`type-filter`**:
  - у конструкторі `Mob` (`Mob.java.patch`) пропускається виклик `this.registerGoals()`;
  - у `Mob#inactiveTick()` та `Mob#serverAiStep()` виконується миттєвий `return`.
- **Гранулярні підсистеми (працюють, коли `entities.ai.enabled: true`):**
  - `goal-selector: false` - ранній `return` у `GoalSelector#tick()` та `GoalSelector#tickRunningGoals(boolean)`;
  - `brain: false` - ранній `return` у `Brain#tick(...)` і пропуск десеризації `Brain` з NBT у `LivingEntity#readAdditionalSaveData`;
  - `pathfinding: false` - ранній `return` у `PathNavigation#tick()`;
  - `sensors: false` - ранній `return` у `Brain#tickSensors(...)` та `Sensing#tick()`.

### 2. Природний спавн мобів (`spawning.natural`)

```yaml
spawning:
  natural:
    enabled: false
    sub-features:
      monsters: false
      animals: false
      custom-spawners: false
```

- `spawning.natural.enabled: false`: у `ServerChunkCache#tickChunks` виставляється `doMobSpawning = false` та `spawningCategories = List.of()`, а в `MinecraftServer#createLevel` передається `Collections.emptyList()` замість кастомних спавнерів.
- `monsters: false` / `animals: false`: у `NaturalSpawner#getFilteredSpawningCategories` пропускається `MobCategory.MONSTER` або решта категорій відповідно; в `ServerChunkCache#tickChunks` обнуляється підрахунок спавнів за цими категоріями.
- `custom-spawners: false`: при створенні Overworld не реєструються `PhantomSpawner`, `PatrolSpawner`, `CatSpawner`, `VillageSiege` та `WanderingTraderSpawner`.

### 3. Тіки чанків, блоків, рідин і фізики

- **`chunks.ticking.enabled: false`**: повністю пропускає виклик `tickChunks` у `ServerChunkCache#tick` (підпараметри `random-ticks`, `block-ticks`, `fluid-ticks` і `poi-ticking` при цьому оминаються).
- **`random-ticks: false`**: пропускає випадкові тіки блоків у `ServerLevel#tickChunk`.
- **`block-ticks: false` / `fluid-ticks: false`**: вимикають `blockTicks.tick` та `fluidTicks.tick` у `ServerLevel#tick`.
- **`poi-ticking: false`**: пропускає тікінг просторового індексу `PoiManager#tick` у `ChunkMap`.
- **`block-entities.ticking.enabled: false`**: ранній `return` у `Level#tickBlockEntities()` (зупиняє печі, маяки, воронки тощо); **`hoppers: false`** точково зупиняє `HopperBlockEntity#pushItemsTick`.
- **`blocks-and-physics`**:
  - `redstone: false` -> ранній `return` в `updateSurroundingRedstone`, `onPlace` і `neighborChanged` класу `RedstoneWireBlock`;
  - `block-gravity: false` -> ранній `return` у `FallingBlock#tick`;
  - `leaf-decay: false` -> ранній `return` у `LeavesBlock#randomTick`;
  - `fire-spread: false` -> ранній `return` у `FireBlock#tick`;
  - `item-physics: false` -> `ItemEntity#tick` викликає `this.inactiveTick(); return;` (зберігає таймери підбору й деспавну, але не обчислює гравітацію, рух і колізії);
  - `block-events: false` -> пропускає `ServerLevel#blockEvent` і `runBlockEvents` з очищенням черги `blockEvents.clear()`.

### 4. Оточення світу та сутності (`world-environment`, `entities`)

- **`world-environment`**:
  - `world-border-tick: false` - пропускає щотіковий `WorldBorder#tick` у `ServerLevel` та оновлення клієнтського `CraftWorldBorder` у гравців;
  - `environment-attributes: false` - пропускає `invalidateTickCache()` у `EnvironmentAttributeSystem`;
  - `game-events: false` - пропускає розсилку вібрацій у `ServerLevel#gameEvent` (`GameEventDispatcher#post`).
- **`entities`**:
  - `despawn-checks: false` - пропускає щотіковий `Entity#checkDespawn()` у `ServerLevel`;
  - `inside-block-checks: false` - пропускає `checkInsideBlocks` та `insideEffectCollector` (павутина, портали, кущі);
  - `fluid-interaction: false` - пропускає `updateFluidInteraction()` і `updateSwimming()` у `Entity#baseTick`, примусово скидаючи `wasEyeInWater = false`;
  - `sprint-particles: false` - пропускає `Entity#spawnSprintParticle()`.

### 5. Механіки гравців і прогресія (`players`, `gameplay.advancements`)

- **`players.locator-bar: false`**: ранній вихід у `ServerWaypointManager` (`trackWaypoint`, `updateWaypoint`, `addPlayer`, `updatePlayer`) і вимкнення трекінгу `WAYPOINT_TRANSMIT_RANGE` / `isReceivingWaypoints()` у `ServerPlayer`.
- **`players.inventory-special-item-updates: false`**: пропускає щотікове сканування слотів у `synchronizeSpecialItemUpdates` (мапи, компаси).
- **`players.vanilla-scoreboard-criteria: false`**: пропускає оновлення ванільних критеріїв скорборда в `updateScoreForCriteria`.
- **`players.floating-kick: false`**: вимикає перевірку лічильників зависання `aboveGroundTickCount` і `aboveGroundVehicleTickCount` у `ServerGamePacketListenerImpl`.
- **`players.statistics` та `gameplay.advancements`**: критеріальні тригери (`CriteriaTriggers.TICK`, `LEVITATION`, `LOCATION`) керуються виключно через `gameplay.advancements`, тоді як `players.statistics: false` блокує лише `awardStat`, `resetStat`, `checkRidingStatistics` та лічильники руху (зі збереженням витрати голоду `causeFoodExhaustion`, якщо `players.hunger: true`).
- **`players.data-saving: false` або `storage.world-saving: false`**: спільна перевірка `isPlayerDataSavingDisabled()` блокує `ServerStatsCounter#save`, `PlayerAdvancements#save` і legacy-перенос `<name>.json -> <uuid>.json` - гарантується `0` записів на диск у `stats/` та `advancements/` (навіть порожні каталоги не створюються).

### 6. Періодичне автозбереження (`storage.periodic-autosave`)

- При `storage.periodic-autosave: false` вимикається лише періодичне фонове збереження під час тіків у `MinecraftServer` (`autoSave()`, інкрементальні `playerList.saveAll`, `saveGlobalData`, `saveIncrementally`) та `ChunkMap` (`chunkHolderManager.autoSave()`).
- При цьому вивантаження чанків, команда `/save-all` і збереження при зупинці сервера працюють штатно. При `storage.world-saving: false` цей прапорець вимикається каскадно.

### 7. Обрізання реєстрів датапаків (Pre-Disk Pruning)

Коли `gameplay.recipes`, `gameplay.advancements`, `gameplay.loot-tables`, `chunks.structures`, `chunks.biome-decoration` або `startup.test-registries` встановлені у `false`, `ResourceManagerRegistryLoadTask.load` та `TagLoader` **навіть не сканують файлову систему** (`listMatchingResources`) і не запускають JSON-парсинг для відповідних реєстрів. При `chunks.structures: true` та `chunks.biome-decoration: false` вирізається лише `Registries.CARVER`, а `FEATURE`/`PLACED_FEATURE` залишаються для коректної збірки структур (декорація чанків однаково вимкнена в `ChunkGenerator`).

Якщо `gameplay.advancements: true`, а `chunks.structures: false` або `gameplay.recipes: false`, для рецептів використовується read-only lookup, а залежні досягнення (разом із нащадками за `parent`) м'яко пропускаються з одним стартовим `WARN`. Решта ванільних і кастомних досягнень працюють штатно, а реальні помилки JSON у датапаках фіксуються як помилки завантаження.

---

## Гарантії безпеки та захист від `NullPointerException`

Вимкнення систем в Apis не обнуляє внутрішні посилання в об'єктах Minecraft і не ламає контракти Bukkit/Paper API:

| Підсистема | Як гарантується безпека (Fallback-об'єкти й контракти) |
| --- | --- |
| **AI мобів** | Поля `goalSelector`, `targetSelector`, `navigation`, `sensing` у `Mob` та дефолтний `Brain` у `LivingEntity` створюються до перевірок `isAiDisabled`. Виклики API на порожньому `GoalSelector` безпечні. |
| **Спавн мобів** | `ServerChunkCache#tickChunks` та `MinecraftServer#createLevel` оперують не-null порожніми списками (`List.of()`, `Collections.emptyList()`). |
| **Обрізані реєстри датапаків** | `RegistryLoadTask#freezeRegistry` викликає `bindAllTagsToEmpty()` і `ApisHooks.bindPrunedFallbackHolders` - висячі `Holder.Reference` прив'язуються до безпечних заглушок (`LootTable.EMPTY`, `AllOfCondition`, `SequenceFunction`, `EmptySlotSource`). Запити `MappedRegistry#get(TagKey)` повертають ленивий порожній `HolderSet.Named` із `prunedFallbackTags`. |
| **Рецепти та досягнення** | `RecipeManager` ініціалізує `RecipeMap.EMPTY` та `List.of()`; `ServerAdvancementManager` створює `ImmutableMap.of()` і `new AdvancementTree()`. |
| **DFU (`startup.datafixers: false`)** | `DATA_FIXER` та `FILE_FIXER` не є `null`: `DataFixers#createFixerUpper` реєструє порожню схему `0` (`createEmptyDataFixerSchema` з `ConcurrentHashMap<>` і `DSL.remainderType()`) та no-op `DataFix`. При завантаженні світу зі старішим `DataVersion` (< `5023` для 26.3) виводиться один стартовий `WARN`. |
| **Структури й портали** | `ServerLevel#findNearestMapStructure` повертає `@Nullable BlockPos` (`null`), `EndPortalBlock` / `NetherPortalBlock#getPortalDestination` повертають `@Nullable TeleportTransition` (`null`), а `FlatLevelGeneratorSettings` повертає `Optional.empty()` і `List.of()`. |
| **Ліниві кеші блоків** | `BlockBehaviour.BlockStateBase` ініціалізує `Shapes.empty()` / `EMPTY_OCCLUSION_SHAPES`, а всі 15 публічних і Moonrise-геттерів викликають потокобезпечний `ensureCacheInitialized()` із захистом від реентерабельності `cacheInitializing`. |
| **Spark і KeyPair** | Усі методи `SparksFly` містять guard `if (this.spark == null) return;`; `MinecraftServer#getKeyPair()` при `network.generate-keypair: false` ліниво генерує ключі при першому реальному зверненні. |
| **Захист від витоків і залипань** | При `block-events: false` черга `blockEvents` очищається (`blockEvents.clear()`); при `fluid-interaction: false` скидається `wasEyeInWater = false`; при `statistics: false` і `hunger: true` витрата їжі (`causeFoodExhaustion`) зберігається. |

:::caution
Зміна стартових і реєстрових прапорців (`startup.*`, `caches.*`, `gameplay.recipes`, `gameplay.advancements`, `gameplay.loot-tables`, `chunks.structures`, `chunks.biome-decoration`) потребує **повного перезапуску** сервера, оскільки вони застосовуються на етапі завантаження JVM/реєстрів. Інші прапорці (AI, фізика, тіки, спавн, оточення, сутності, механіки гравців, періодичне автозбереження, фільтри пакетів) підхоплюються миттєво через `/apis reload`.
:::

:::note
Якщо плагін або серверний виклик натрапляє на заблоковану дію (`createWorld`, `findNearestMapStructure`, `getWorld` вимкненого виміру), `ApisDiagnostics.warnBlocked` фіксує одноразове діагностичне попередження формату:
`Blocked plugin '<name>'|server call <ctx>(<target>) - disabled by <key> in apis.yml`.
:::
