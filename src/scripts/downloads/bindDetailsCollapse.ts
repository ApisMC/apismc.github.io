import { isClickOnText } from "./isClickOnText";

/** Toggles a card's <details> block via toggle button or empty space clicks while updating cursor affordance. */
export function bindDetailsCollapse(
  card: HTMLElement,
  details: HTMLDetailsElement,
  toggleBtn: HTMLButtonElement | null,
): void {
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      details.open = !details.open;
    });

    details.addEventListener("toggle", () => {
      toggleBtn.setAttribute("aria-expanded", String(details.open));
    });
  }

  card.addEventListener("mousemove", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target || target.closest("a, button, summary")) {
      card.style.cursor = "";
      return;
    }
    if (target.closest(".sl-badge")) {
      card.style.cursor = "default";
      return;
    }
    card.style.cursor = isClickOnText(target, event.clientX, event.clientY)
      ? "text"
      : "pointer";
  });

  card.addEventListener("mouseleave", () => {
    card.style.cursor = "";
  });

  card.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (
      !target ||
      target.closest("a, button, summary, .sl-badge, input, textarea, select, label")
    ) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    if (isClickOnText(target, event.clientX, event.clientY)) {
      return;
    }
    details.open = !details.open;
  });
}
