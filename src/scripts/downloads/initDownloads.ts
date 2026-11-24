import type { ApisInfoResponse } from "./types";
import { createReleaseCard } from "./createReleaseCard";
import { normalizeBaseUrl } from "./normalizeBaseUrl";

/** Fetches release metadata and replaces the placeholder card with cloned ReleaseCard entries. */
export async function initDownloads(): Promise<void> {
  const placeholder = document.querySelector<HTMLElement>(".sl-markdown-content > article.card");
  const template = document.querySelector<HTMLTemplateElement>("[data-release-card-template]");
  if (!placeholder || !template || placeholder.dataset.ready === "1") return;
  placeholder.dataset.ready = "1";

  const isUk = document.documentElement.lang.toLowerCase().startsWith("uk");
  const titleEl = placeholder.querySelector<HTMLElement>(".title span");
  const bodyEl = placeholder.querySelector<HTMLElement>(".body");
  const baseUrl = normalizeBaseUrl(import.meta.env.PUBLIC_APIS_API_URL ?? "");

  if (!baseUrl) {
    if (titleEl) titleEl.textContent = isUk ? "Помилка конфігурації" : "Configuration error";
    if (bodyEl) {
      bodyEl.textContent = isUk
        ? "Не задано PUBLIC_APIS_API_URL."
        : "PUBLIC_APIS_API_URL is not configured.";
    }
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/gh/apis/info`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as ApisInfoResponse;
    const repo =
      data.repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(data.repo.trim())
        ? data.repo.trim()
        : "ApisMC/Apis";
    const releases = Array.isArray(data.releases) ? data.releases : [];
    if (releases.length === 0) {
      throw new Error(isUk ? "Список релізів порожній." : "Release list is empty.");
    }

    const supported = releases.filter((rel) => rel.is_latest);
    const unsupported = releases.filter((rel) => !rel.is_latest);
    const fragment = document.createDocumentFragment();

    for (const rel of supported) {
      fragment.append(createReleaseCard(template, rel, baseUrl, repo));
    }

    if (supported.length > 0 && unsupported.length > 0) {
      const divider = document.createElement("div");
      divider.className = "release-divider";
      divider.setAttribute("role", "separator");
      const label = document.createElement("span");
      label.textContent = isUk ? "Непідтримувані версії" : "Unsupported versions";
      divider.append(label);
      fragment.append(divider);
    }

    for (const rel of unsupported) {
      fragment.append(createReleaseCard(template, rel, baseUrl, repo));
    }

    placeholder.replaceWith(fragment);
  } catch (err) {
    if (titleEl) {
      titleEl.textContent = isUk ? "Не вдалося завантажити релізи" : "Failed to load releases";
    }
    if (bodyEl) {
      bodyEl.textContent =
        err instanceof Error
          ? err.message
          : isUk
            ? "Невідома помилка запиту."
            : "Unknown request error.";
    }
  }
}

void initDownloads();
document.addEventListener("astro:after-swap", initDownloads);
