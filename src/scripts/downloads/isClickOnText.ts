/** Returns true when viewport coordinates (x, y) hit any visible text rect inside target. */
export function isClickOnText(target: Node, x: number, y: number): boolean {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node = walker.nextNode();

  while (node) {
    if (node.textContent && node.textContent.trim().length > 0) {
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return true;
        }
      }
    }
    node = walker.nextNode();
  }

  return false;
}
