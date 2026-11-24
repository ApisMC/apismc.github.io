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
