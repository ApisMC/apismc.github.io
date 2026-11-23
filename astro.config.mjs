// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightAutoSidebar from "starlight-auto-sidebar";
import starlightThemeBlack from "starlight-theme-black";

import d2 from "astro-d2";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "ApisMC",
      logo: {
        src: "./src/assets/icon.svg",
        replacesTitle: false,
      },
      defaultLocale: "root",
      locales: {
        root: {
          label: "Українська",
          lang: "uk",
        },
        // Щоб увімкнути англійську версію, створіть дзеркальну структуру в src/content/docs/en/
        // та розкоментуйте блок нижче:
        // en: {
        //   label: "English",
        //   lang: "en",
        // },
      },
      customCss: ["./src/styles/custom.css"],
      plugins: [
        starlightAutoSidebar(),
        starlightThemeBlack({
          navLinks: [
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
