---
title: Міграція з Paper / Purpur
description: Покроковий перехід існуючого сервера Paper або Purpur на ядро Apis без втрати світів, конфігів і даних плагінів.
sidebar:
  order: 1
---

Apis розроблений як пряма заміна Paper або Purpur зі збереженням сумісності світів і плагінів. Головна відмінність при переході - **розподіл файлів по окремих папках**, щоб корінь сервера залишався чистим.

## Що змінюється після Paper / Purpur

| Що саме | Paper / Purpur | Apis (за замовчуванням) |
| --- | --- | --- |
| **Конфіги сервера** | Корінь сервера та `config/` | `configs/` (`--configs-dir`) |
| **JAR-файли плагінів** | `plugins/*.jar` | `addons/*.jar` (`--addons-dir`) |
| **Автооновлення плагінів** | `plugins/update/` | `addons/update/` |
| **Дані й конфіги плагінів** | `plugins/<Plugin>/` | `plugins/<Plugin>/` (`-P` / `--plugins`) |
| **Світи** | Корінь (`world/`, `world_nether/`, `world_the_end/`) | `worlds/` (`--worlds-dir`) |
| **Списки гравців (`ops.json`, ...)** | Корінь сервера | `users/` (або корінь, якщо файли вже там є) |

---

## Покрокове перенесення

### Крок 1. Резервна копія та зупинка

Зупиніть сервер командою `stop` і зробіть резервну копію поточних світів, конфігів та теки `plugins/`.

### Крок 2. Заміна JAR-файлу ядра

Видаліть старий JAR (`paper-*.jar` або `purpur-*.jar`) і покладіть релізний JAR Apis (`apis-paperclip-26.3-release.jar` із `github.com/ApisMC/Apis`) у корінь сервера.

### Крок 3. Перенесення конфігів у `configs/`

Створіть папку `configs/` і перемістіть туди налаштування сервера:

```bash
mkdir -p configs
mv server.properties bukkit.yml spigot.yml commands.yml help.yml permissions.yml configs/ 2>/dev/null || true

# Якщо використовувалися конфіги Paper із папки config/
if [ -d config ]; then
  mv config/* configs/
  rmdir config
fi
```

:::note
Під час першого запуску Apis автоматично прибере дублюючі налаштування зі старих конфігів (`allow-nether`, `spawn-monsters` у `server.properties`, `allow-end` у `bukkit.yml` тощо), щоб усіма вимикачами можна було керувати з одного файлу `configs/apis.yml`.
:::

### Крок 4. Розділення JAR-файлів і даних плагінів

Перенесіть самі `.jar`-файли плагінів у `addons/`, залишивши всі теки з конфігами та базами даних у `plugins/`:

```bash
mkdir -p addons addons/update
mv plugins/*.jar addons/ 2>/dev/null || true

# Якщо є невиконані оновлення плагінів
if [ -d plugins/update ]; then
  mv plugins/update/* addons/update/ 2>/dev/null || true
  rmdir plugins/update 2>/dev/null || true
fi
```

### Крок 5. Перенесення світів та списків гравців

Оберіть потрібний режим:

- **Для лобі / хабів / мініігор (`dimensions.mode: standalone`, за замовчуванням):**
  1. Створіть теку `worlds/` і перенесіть туди потрібні світи (наприклад, `mv world worlds/hub`).
  2. Перевірте `dimensions.fallback-world` у `configs/apis.yml` (за замовчуванням `hub`).
  3. За бажанням перенесіть `ops.json`, `whitelist.json`, `banned-players.json`, `banned-ips.json` і `usercache.json` у `users/` (якщо залишити їх у корені, Apis усе одно їх підхопить).

- **Для звичайного survival-сервера (`dimensions.mode: vanilla`):**
  1. У `configs/apis.yml` встановіть `dimensions.mode: vanilla`.
  2. Перемістіть `world/`, `world_nether/`, `world_the_end/` до `worlds/` (або запустіть сервер із `--worlds-dir .`).

### Крок 6. Запуск і перевірка

```bash
java --enable-native-access=ALL-UNNAMED -jar apis-paperclip-26.3-release.jar --nogui
```

Перевірте активні параметри командою `/apis status`.

:::caution
Якщо старий плагін жорстко шукає `server.properties`, `bukkit.yml` або `ops.json` у корені сервера й видає помилку, Apis покаже в консолі коротку підказку, на який файл створити символічне посилання (symlink).
:::
