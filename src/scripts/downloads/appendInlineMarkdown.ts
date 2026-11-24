import { safeHttpUrl } from "./safeHttpUrl";

/** Parses inline Markdown links, code spans, and bold text into safe DOM nodes. */
export function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const tokenRe =
    /\[([^\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = safeHttpUrl(match[2]);
      if (href) {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = match[1];
        parent.append(a);
      } else {
        parent.append(document.createTextNode(match[0]));
      }
    } else if (match[3] !== undefined) {
      const code = document.createElement("code");
      code.textContent = match[3];
      parent.append(code);
    } else if (match[4] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[4];
      parent.append(strong);
    }
    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.append(document.createTextNode(text.slice(lastIndex)));
  }
}
