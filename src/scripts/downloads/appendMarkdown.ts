import { appendInlineMarkdown } from "./appendInlineMarkdown";

/** Renders block-level Markdown changelog sections and bullet lists into a container. */
export function appendMarkdown(container: HTMLElement, markdown: string): void {
  const allowedHeadings = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
  const rawHeading = (container.dataset.heading ?? "h3").toLowerCase();
  const headingTag = allowedHeadings.has(rawHeading) ? rawHeading : "h3";

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let ul: HTMLUListElement | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (ul) {
        container.append(ul);
        ul = null;
      }
      continue;
    }

    const hMatch = /^#{1,6}\s+(.+)$/.exec(line);
    if (hMatch) {
      if (ul) {
        container.append(ul);
        ul = null;
      }
      const h = document.createElement(headingTag);
      appendInlineMarkdown(h, hMatch[1]);
      container.append(h);
      continue;
    }

    const liMatch = /^[-*]\s+(.+)$/.exec(line);
    if (liMatch) {
      if (!ul) ul = document.createElement("ul");
      const li = document.createElement("li");
      appendInlineMarkdown(li, liMatch[1]);
      ul.append(li);
      continue;
    }

    if (ul) {
      container.append(ul);
      ul = null;
    }

    const next = lines[i + 1]?.trim() ?? "";
    if (/^[-*]\s+/.test(next) && !/\[.+\]\(.+\)/.test(line)) {
      const h = document.createElement(headingTag);
      appendInlineMarkdown(h, line);
      container.append(h);
    } else {
      const p = document.createElement("p");
      appendInlineMarkdown(p, line);
      container.append(p);
    }
  }

  if (ul) {
    container.append(ul);
  }
}
