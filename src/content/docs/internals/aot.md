---
title: Java 25 AOT
description: Налаштування профілю Java 25 AOT (AppCDS) та швидкий прямий запуск сервера Apis без ручного збирання classpath.
sidebar:
  hidden: false
---

Apis підтримує **Java 25 Ahead-of-Time (AOT) Cache** прямо «з коробки» без окремих shell-скриптів перебору `libraries/*.jar` чи сторонніх лончерів.

## Чому AOT працює в Apis без додаткового налаштування


1. У маніфесті `META-INF/MANIFEST.MF` серверного JAR (`versions/<mcVersion>/apis-<mcVersion>.jar`) прописано:
   - `Main-Class: org.bukkit.craftbukkit.Main`
   - `Multi-Release: true`
   - **`Class-Path`** - повний відносний список усіх залежностей `runtimeClasspath` (включно з `apis-api`) у форматі `../../libraries/<group>/<module>/<version>/<fileName>`, що точно збігається з розкладкою `libraries/` після першого запуску Paperclip.
2. Задачі пакування (`CreateBundlerJar`) також додають атрибут `Enable-Native-Access: ALL-UNNAMED`.
3. Для звичайного запуску через Paperclip лончер використовує `cache/.paperclip-stamp` (`PaperclipStamp`) - перевірка `size`, `mtimeMillis` і SHA-256 маніфестів пропускає повторне хешування ~100 МБ залежностей.

:::note
Перед записом AOT-профілю обов'язково виконайте один стартовий запуск Paperclip JAR (`java --enable-native-access=ALL-UNNAMED -jar apis-paperclip-26.3-release.jar --nogui`), щоб лончер розпакував `versions/26.3/apis-26.3.jar` та каталог `libraries/`.
:::

---

## Крок 1. Створення AOT-конфігурації та кешу

Скрипт `build-aot.sh` записує профіль завантаження класів під час холодного старту (`-XX:AOTMode=record`), після чого компілює його у файл кешу `cache/apis-cp.aot` (`-XX:AOTMode=create`).

```bash
#!/usr/bin/env bash
set -euo pipefail

MC_VERSION="26.3"
SERVER_JAR="versions/${MC_VERSION}/apis-${MC_VERSION}.jar"
AOT_CONF="cache/apis-cp.aotconf"
AOT_CACHE="cache/apis-cp.aot"

mkdir -p cache

# 1. Запис профілю AOT (зупиніть сервер командою 'stop' після повідомлення Done)
java -Xms1G -Xmx1G \
  -XX:AOTMode=record \
  -XX:AOTConfiguration="${AOT_CONF}" \
  --enable-native-access=ALL-UNNAMED \
  -cp "${SERVER_JAR}" \
  org.bukkit.craftbukkit.Main --nogui

# 2. Генерація AOT-кешу
java \
  -XX:AOTMode=create \
  -XX:AOTConfiguration="${AOT_CONF}" \
  -XX:AOTCache="${AOT_CACHE}" \
  -cp "${SERVER_JAR}"

echo "AOT cache created at ${AOT_CACHE}"
```

:::tip
Якщо в сервері активовані kill-switch-прапорці у [configs/apis.yml](../../configuration/apis-config/) (наприклад, `startup.datafixers: false` або `caches.eager-blockstate-cache: false`), налаштуйте їх **до** етапу `record`. Так AOT-кеш зафіксує точний мінімальний набір класів без зайвих схем DFU.
:::

---

## Крок 2. Продакшн-запуск із `AOTCache`

У продакшн-скрипті сервер запускається безпосередньо через `-cp versions/26.3/apis-26.3.jar` із підключеним кешем `cache/apis-cp.aot`:

```bash
#!/usr/bin/env sh
set -eu

MC_VERSION="26.3"
SERVER_JAR="versions/${MC_VERSION}/apis-${MC_VERSION}.jar"
AOT_CACHE="cache/apis-cp.aot"

exec java \
  -Xms2G -Xmx2G \
  -XX:+UseZGC \
  -XX:AOTCache="${AOT_CACHE}" \
  --enable-native-access=ALL-UNNAMED \
  -cp "${SERVER_JAR}" \
  org.bukkit.craftbukkit.Main --nogui
```

:::caution
При оновленні збірки Apis або зміні версії Java перезбирайте `cache/apis-cp.aot` заново. Якщо нативні бібліотеки або JVM не збігаються з тими, на яких створювався кеш, JVM проігнорує `AOTCache` або видасть попередження.
:::

## Порівняння режимів запуску

| Режим | Команда запуску | Призначення |
| --- | --- | --- |
| **Стандартний Paperclip** | `java --enable-native-access=ALL-UNNAMED -jar apis-paperclip-*.jar --nogui` | Перше розпакування `versions/` та `libraries/`, прості оновлення з перевіркою `cache/.paperclip-stamp` |
| **Прямий AOT (`AOTCache`)** | `java -XX:AOTCache=cache/apis-cp.aot --enable-native-access=ALL-UNNAMED -cp versions/26.3/apis-26.3.jar org.bukkit.craftbukkit.Main --nogui` | Максимально швидкий холодний старт та прогрів у Docker/Kubernetes-контейнерах |
