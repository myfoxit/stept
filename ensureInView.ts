export function ensureInViewY(el: HTMLElement, parent: HTMLElement) {
  const top = el.offsetTop;
  const bottom = top + el.offsetHeight;
  const viewTop = parent.scrollTop;
  const viewBottom = viewTop + parent.clientHeight;
  if (top < viewTop) {
    parent.scrollTop = top - 4;
  } else if (bottom > viewBottom) {
    parent.scrollTop = bottom - parent.clientHeight + 4;
  }
}
