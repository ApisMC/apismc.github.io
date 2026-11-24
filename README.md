<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/badge-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="public/badge-white.svg" />
    <img alt="Apis" src="public/badge-white.svg" width="250" />
  </picture>

  <p>
    <a href="https://astro.build"><img src="https://astro.badg.es/v2/built-with-astro/tiny.svg" alt="Built with Astro" /></a>
    <a href="https://starlight.astro.build"><img src="https://astro.badg.es/v2/built-with-starlight/tiny.svg" alt="Built with Starlight" /></a>
  </p>

<p>
  Documentation site for <a href="https://github.com/ApisMC/Apis">Apis</a>, a specialized Paper fork for Minecraft built for lobbies, hubs, queues, and minigames.
</p>
</div>

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server (foreground, http://localhost:4321)
bun run dev

# Or start dev server in background
bun run astro dev --background
```

## Stop & Manage

```bash
# Stop foreground server
Ctrl+C

# Manage background server
bun run astro dev stop
bun run astro dev status
bun run astro dev logs
```

## Build & Preview

```bash
bun run build
bun run preview
```

## License [![MIT License](https://img.shields.io/badge/license-MIT-18181b?style=flat&labelColor=09090b)](LICENSE)

This project is licensed under the [MIT License](LICENSE).

