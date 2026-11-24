---
title: Plugin Impact & Real Benchmarks
description: Startup breakdown for Apis, head-to-head Minecraft 26.3 benchmarks against Paper, and practical plugin stack recommendations.
sidebar:
  order: 1
---

**Apis** itself finishes engine initialization up to `Starting minecraft server` in under a second (**~0.85s** measured by `initToMcMs`). In production, most startup time and runtime load comes from plugins inside `addons/`. Below are real numbers comparing **Apis** against **Paper 26.3** under identical test conditions.

## Test Setup (Direct Minecraft 26.3 Protocol)

All benchmarks ran in isolated Docker containers (`linux/arm64`, capped at **4 vCPU**, **4 GiB RAM**, **Java 25 Temurin**, `-Xms2G -Xmx3G`, with AOT cache enabled).  
Both servers loaded the exact same set of **9 popular plugins**: `ViaVersion 5.12.2`, `LuckPerms 5.5.71`, `KaMenu 2.1.0`, `FancyNpcs 2.12.1`, `Skript 2.17.1`, `emotecraft 3.5.0`, `TAB 6.2.1`, `WorldEdit 7.4.6`, and `GrimAC 2.3.74` (along with `PacketEvents 2.14.1`). Apis ran with 70 kill-switches active in `configs/apis.yml`.

---

## Where Startup Time Goes

Profiling Apis boot with all 9 plugins loaded (3-run average `Done` time: **5.52s**, best run: **5.01s**):

| Boot Stage | Avg Time | Share of Startup |
| --- | --- | --- |
| Core init up to `Starting minecraft server` | **0.85s** (`845.8 ms`) | ~15% |
| Provider setup before `onLoad` | **0.43s** (`433.4 ms`) | ~8% |
| `onLoad` phase across 9 plugins | **1.49s** (`1485.3 ms`) | ~27% |
| `onEnable` phase across 9 plugins (`LuckPerms`, `WorldEdit`, `Skript`, `GrimAC`, etc.) | **2.44s** (`2435.6 ms`) | ~44% |

Because plugins unpack their own libs, databases (such as H2 in `LuckPerms`), `Skript` aliases, and `PacketEvents` packet mappings, total production boot time depends mostly on plugin weight once core overhead is trimmed.

---

## Apis vs Paper (100 Bots, 90s Plateau)

Tested over direct Minecraft `26.3` protocol (`100` bots, `5` workers, `8` bots/s join rate, 2 runs per server, `0` kicks and `0` errors):

| Metric (same 9 plugins) | Paper 26.3 | Apis 26.3 | Delta |
| --- | --- | --- | --- |
| **Cold start (`Done`, avg)** | 12.27s | **6.28s** | **~1.95x faster** |
| **Cold start (`Done`, best)** | 12.04s | **5.91s** | **~2.08x faster** |
| **Idle RAM** | 1886.7 MiB | **1021.3 MiB** *(best; 1140.9 avg)* | **~1.85x less (-46%)** |
| **Avg MSPT (100 bots, 5s avg)** | 27.53 ms | **10.19 ms** | **~2.70x lower MSPT** |
| **Avg CPU (100 bots)** | 380.35% | **186.43%** | **~2.04x lower CPU** |
| **Live Heap after GC** | 757.2 MiB | **519.6 MiB** | **~31% smaller** |
| **Max GC pause** | 516.8 - 573.7 ms | **92.7 - 140.3 ms** | **~4x shorter pauses** |

## Scaling Under Load (Limit Test)

Step test adding `+50` bots per stage (same 9-plugin stack with `GrimAC`; stop threshold at `60 ms` for Apis and `70 ms` for Paper):

| Bot Count | Paper 26.3 (MSPT / TPS / CPU) | Apis 26.3 (MSPT / TPS / CPU) |
| --- | --- | --- |
| **50 bots** | - | **3.81 ms / 20.00 TPS / 83.2% CPU** |
| **100 bots** | 33.70 ms / 14.93 TPS / 386.2% CPU | **4.92 ms / 20.00 TPS / 103.0% CPU** |
| **150 bots** | 111.75 ms / 12.52 TPS / 403.8% CPU *(stopped: over 70 ms)* | **5.95 ms / 20.00 TPS / 114.8% CPU** |
| **200 bots** | CRASH (Watchdog) | **8.59 ms / 20.00 TPS / 151.6% CPU** |
| **250 bots** | - | **16.99 ms / 20.0 TPS** *(19.29 avg)* **/ 273.8% CPU** |
| **300 bots** | - | **32.59 ms / 19.9 TPS** *(18.78 avg)* **/ 402.4% CPU** |
| **350 bots** | - | **64.32 ms / 15.4 TPS** *(13.57 avg)* **/ 411.5% CPU** *(60 ms cap)* |

**Paper** hit its limit at **150 bots** and crashed at **200**, while **Apis** held a flat **`20.00 TPS`** at **`8.59 ms` MSPT** through **200 bots**, stayed at **`19.9 TPS`** (`32.59 ms`) at **300 bots**, and reached **350 bots** (`64.32 ms`, `15.4 TPS`) with **`0` kicks and `0` errors**.

## 250-Bot Repeatability & Fast Join (`4/s` vs `12/s`)

Dedicated stability runs at **250 bots** (3 independent runs with `90s` plateaus at `4` bots/s plus a burst run at `12` bots/s; `0` kicks and `0` errors across all runs):

- **250-bot plateau (`4/s`, best of 3):** settled `5s MSPT` was **`14.80 ms`** (`16.70 ms` avg; 3-run mean `17.18 ms`), settled TPS was **`20.0 TPS`** (`19.65 avg`, min `19.4`), CPU **`253.86%`** (`265.66%` avg), live heap after GC **`800.7 MiB`**, max GC pause **`88.97 ms`**.
- **Burst join (`12/s`):** triple connection speed (`~26s` vs `~65s`) kept **`250/250`** players connected, settling at **`20.50 ms` MSPT** (`20.0 TPS` by end of plateau, `318.22%` CPU, max GC pause `83.33 ms`).

---

## Plugin Stack Recommendations

To avoid undoing the engine's startup and memory savings:

| Server Role | Avoid | Use Instead |
| --- | --- | --- |
| **World Management** | Multiverse-Core and heavy world managers | Built-in [`worlds/` + `world.yml` + `/world` + `/tpworld`](/worlds/standalone-mode/) |
| **Hub / Lobby Logic** | Bloated all-in-one suites and heavy scripts | Small purpose-built plugins targeting modern Paper API |
| **Holograms & NPCs** | Live entities or armor stands with AI/collisions | Modern Display entities (`TextDisplay`) or packet NPCs with `entities.ai.enabled: false` |
| **Lobby State Persistence** | Constant chunk and `playerdata/` disk writes | `storage.world-saving: false` + external storage (Redis/SQL) only if needed |
| **Legacy Compatibility** | Outdated `1.12 - 1.20.4` builds | Native modern builds (`1.21+`) with `compatibility.legacy.plugin-bytecode-rerouting: false` |

:::tip
Measure plugins one by one: log the `Done (...)!` time on bare Apis first, then drop JARs into `addons/` individually to spot heavy startups and RAM spikes.
:::
