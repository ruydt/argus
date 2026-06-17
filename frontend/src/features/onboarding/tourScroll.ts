// driver.js appends its overlay to <body> and sets `pointer-events: none` on
// every element except the highlighted one (`.driver-active *{pointer-events:none}`).
// argus also scrolls inner per-page containers (the app shell is overflow-hidden),
// so a wheel over the dimmed overlay finds nothing to scroll and the page feels
// frozen. This forwards wheel deltas to the highlighted element's scroll container
// and re-pins the highlight after — matching the scroll-along on driverjs.com.

function getScrollableAncestor(el: Element | null): Element | null {
  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node)
    // driver forces `overflow: hidden` on the active element's direct parent;
    // getComputedStyle reflects that, so such wrappers are skipped naturally.
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  const root = document.scrollingElement
  if (root && root.scrollHeight > root.clientHeight) return root
  return null
}

/**
 * Forward wheel scrolling anywhere over the tour to the highlighted element's
 * scroll container. Returns a cleanup function; call it when the tour is destroyed.
 */
export function enableTourScrollForwarding(refresh: () => void): () => void {
  const onWheel = (e: WheelEvent) => {
    // Let the popover scroll its own overflow.
    const hit = document.elementFromPoint(e.clientX, e.clientY)
    if (hit && hit.closest('.driver-popover')) return

    const active = document.querySelector('.driver-active-element')
    const scroller = getScrollableAncestor(active)
    if (!scroller) return

    e.preventDefault()
    const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1
    scroller.scrollTop += e.deltaY * factor
    scroller.scrollLeft += e.deltaX * factor

    // Inner-element scroll doesn't bubble to window, so driver's own scroll
    // listener never fires — refresh synchronously so the cutout pins exactly to
    // the element with no trailing/animation.
    refresh()
  }

  window.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    window.removeEventListener('wheel', onWheel)
  }
}
