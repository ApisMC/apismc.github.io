// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightAutoSidebar from "starlight-auto-sidebar";
import starlightThemeBlack from "starlight-theme-black";

import d2 from "astro-d2";

// https://astro.build/config
export default defineConfig({
  site: "https://apismc.github.io",
  integrations: [
    starlight({
      title: "ApisMC",
      components: {
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      logo: {
        src: "./src/assets/icon.svg",
        replacesTitle: false,
      },
      head: [
        {
          tag: "meta",
          attrs: {
            name: "google-site-verification",
            content: "VVvplXwidUUBokEq4-IV0wZfwodcVFtuwMqup1xDdJk",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            sizes: "128x128",
            href: "/favicon.png",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: "/favicon.png",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "theme-color",
            content: "#0a0a0b",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://apismc.github.io/favicon.png",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:type",
            content: "image/png",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:width",
            content: "128",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:height",
            content: "128",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "ApisMC Logo",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:card",
            content: "summary",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: "https://apismc.github.io/favicon.png",
          },
        },
        {
          tag: "script",
          attrs: {
            type: "application/ld+json",
          },
          content: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                name: "ApisMC",
                url: "https://apismc.github.io/",
                inLanguage: ["en", "uk"],
              },
              {
                "@type": "SoftwareApplication",
                name: "Apis",
                applicationCategory: "GameApplication",
                operatingSystem: "Linux, Windows, macOS",
                url: "https://apismc.github.io/",
                downloadUrl: "https://apismc.github.io/downloads/",
                image: "https://apismc.github.io/favicon.png",
                sameAs: [
                  "https://github.com/ApisMC/Apis",
                  "https://ko-fi.com/kotop21",
                ],
                description:
                  "High-performance Paper fork for Minecraft lobbies, hubs, queues, and minigames with sub-2s startup, Java 25+ AOT cache support, kill-switches, and built-in multi-world management.",
              },
            ],
          }),
        },
      ],
      defaultLocale: "root",
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        uk: {
          label: "Українська",
          lang: "uk",
        },
      },
      customCss: ["./src/styles/custom.css"],
      plugins: [
        starlightAutoSidebar(),
        starlightThemeBlack({
          navLinks: [
            {
              label: "Home",
              link: "/",
              attrs: { class: "apis-mobile-home-link" },
            },
            {
              label: "Downloads",
              link: "/downloads",
            },
            {
              label: "AOT Guide",
              link: "/internals/aot",
            },
            {
              label: "FAQ",
              link: "/faq",
            },
          ],
          docs: {
            showMarkdownActions: {
              agents: {
                chatgpt: false,
                claude: false,
                v0: false,
                scira: false,
              },
            },
          },
        }),
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/ApisMC/Apis",
        },
      ],
      sidebar: [
        {
          autogenerate: { directory: "" },
        },
      ],
    }),
    d2({
      inline: true,
      pad: 24,
      sketch: true,
      experimental: {
        useD2js: true,
      },
    }),
  ],
});
