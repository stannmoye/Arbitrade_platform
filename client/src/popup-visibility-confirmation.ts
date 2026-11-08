export function waitForPopupVisibility(
  element: HTMLElement | null,
  isCurrent: () => boolean,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!element || typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);

  return new Promise(resolve => {
    let finished = false;
    let timer: number | null = null;
    let observer: IntersectionObserver | null = null;

    const finish = (visible: boolean) => {
      if (finished) return;
      finished = true;
      if (timer !== null) window.clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", check);
      signal?.removeEventListener("abort", abort);
      resolve(visible);
    };
    const abort = () => finish(false);

    const isVisibleNow = () => {
      if (signal?.aborted || !isCurrent() || !element.isConnected || document.visibilityState !== "visible") return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    };
    const confirmAfterPaint = () => {
      if (!isVisibleNow()) return;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (isVisibleNow()) finish(true);
      }));
    };
    const check = () => {
      if (signal?.aborted || !isCurrent()) return finish(false);
      if (isVisibleNow()) return confirmAfterPaint();
      // Keep checking while entrance transitions complete; do not acknowledge a hidden popup.
      if (element.isConnected && document.visibilityState === "visible" && timer === null) {
        timer = window.setTimeout(() => { timer = null; check(); }, 100);
      }
    };

    if (signal?.aborted) return finish(false);
    signal?.addEventListener("abort", abort, { once: true });
    document.addEventListener("visibilitychange", check);
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.target === element && entry.isIntersecting && entry.intersectionRatio > 0)) check();
      });
      observer.observe(element);
    }
    check();
  });
}
