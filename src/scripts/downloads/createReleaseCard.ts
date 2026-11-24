import type { ApisRelease } from "./types";
import { appendMarkdown } from "./appendMarkdown";
import { bindDetailsCollapse } from "./bindDetailsCollapse";
import { formatBytes } from "./formatBytes";
import { formatDate } from "./formatDate";
import { safeHttpUrl } from "./safeHttpUrl";

/** Clones the ReleaseCard <template> and populates all release slots and changelog content. */
export function createReleaseCard(
  template: HTMLTemplateElement,
  rel: ApisRelease,
  baseUrl: string,
  repo: string,
): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.querySelector<HTMLElement>("article.card");
  if (!card) {
    return document.createElement("div");
  }

  card.classList.add("release-card");

  const titleRow = card.querySelector<HTMLElement>(".title");
  const titleEl = titleRow?.querySelector<HTMLElement>("span");
  if (titleEl) {
    titleEl.textContent = rel.title || `Apis ${rel.version}`;
  }

  const statusEl = card.querySelector<HTMLElement>("[data-release-status]");
  if (statusEl) {
    statusEl.textContent = rel.is_latest ? "Supported" : "Unsupported";
    statusEl.classList.toggle("success", rel.is_latest);
    statusEl.classList.toggle("danger", !rel.is_latest);
    titleRow?.append(statusEl);
  }

  const isUk = document.documentElement.lang.toLowerCase().startsWith("uk");

  const toggleEl = card.querySelector<HTMLButtonElement>("[data-release-toggle]");
  if (toggleEl) {
    toggleEl.setAttribute("aria-label", isUk ? "Показати зміни" : "Show changelog");
    titleRow?.append(toggleEl);
  }

  const versionEl = card.querySelector<HTMLElement>("[data-release-version]");
  if (versionEl) versionEl.textContent = rel.version;

  const buildEl = card.querySelector<HTMLElement>("[data-release-build]");
  if (buildEl) buildEl.textContent = String(rel.build ?? "-");

  const sizeEl = card.querySelector<HTMLElement>("[data-release-size]");
  if (sizeEl) sizeEl.textContent = formatBytes(rel.file_size);

  const dateEl = card.querySelector<HTMLElement>("[data-release-date]");
  if (dateEl) dateEl.textContent = formatDate(rel.published_at);

  const tagEl = card.querySelector<HTMLElement>("[data-release-tag]");
  if (tagEl) tagEl.textContent = rel.tag || rel.version;

  const dlLink = card.querySelector<HTMLAnchorElement>("[data-release-download]");
  if (dlLink) {
    dlLink.href = `${baseUrl}/gh/apis/download?v=${encodeURIComponent(rel.version)}`;
  }

  const dlLabel = card.querySelector<HTMLElement>("[data-release-download-label]");
  if (dlLabel) {
    dlLabel.textContent = isUk ? "Завантажити" : "Download";
  }

  const ghLink = card.querySelector<HTMLAnchorElement>("[data-release-github]");
  const releaseUrl = rel.tag
    ? safeHttpUrl(`https://github.com/${repo}/releases/tag/${encodeURIComponent(rel.tag)}`)
    : safeHttpUrl(`https://github.com/${repo}/releases`);
  if (ghLink) {
    if (releaseUrl) {
      ghLink.href = releaseUrl;
    } else {
      ghLink.remove();
    }
  }

  const detailsEl = card.querySelector<HTMLDetailsElement>("[data-release-details]");
  const previewEl = card.querySelector<HTMLElement>("[data-release-preview]");
  const changelogEl = card.querySelector<HTMLElement>("[data-release-changelog]");
  if (detailsEl && changelogEl && rel.description?.trim()) {
    if (previewEl) {
      previewEl.textContent = rel.description
        .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1")
        .replace(/^[#>*\-\s]+/gm, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    appendMarkdown(changelogEl, rel.description);
    bindDetailsCollapse(card, detailsEl, toggleEl);
  } else {
    detailsEl?.remove();
    toggleEl?.remove();
  }

  return card;
}
