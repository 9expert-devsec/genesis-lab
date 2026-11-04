/**
 * Waits for what is animating under `el`, holds, then calls `done`, once.
 *
 * Elapsed time is read off the animations themselves (getAnimations covers CSS
 * animations, transitions and Web Animations), so a level with more rows waits
 * longer with nothing to keep in step. Each pass re-reads the list, because a
 * finished animation can have started another. Only a running, finite animation
 * counts: a loop never ends, and one that has finished stays in the list while
 * its fill holds.
 *
 * `cap` is the backstop: `done` fires by then whatever the animations do. A
 * hidden tab or a stalled animation can only delay it that long.
 *
 * Returns { skip, cancel }: skip calls `done` now, cancel means it never fires.
 */
export function afterMotion(el, { hold, cap, done }) {
  let open = true;
  let holdTimer;

  const stop = () => {
    open = false;
    clearTimeout(capTimer);
    clearTimeout(holdTimer);
  };
  const skip = () => {
    if (!open) return;
    stop();
    done();
  };
  const capTimer = setTimeout(skip, cap);

  (async () => {
    for (let now = running(el); open && now.length > 0; now = running(el)) {
      await Promise.allSettled(now.map((a) => a.finished));
    }
    if (open) holdTimer = setTimeout(skip, hold);
  })();

  return { skip, cancel: stop };
}

function running(el) {
  return el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity);
}
