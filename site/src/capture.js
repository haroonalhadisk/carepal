// Capture mode (?capture): a virtual clock so a video renderer can step the
// site frame by frame. Must be imported before gsap/three so they read the
// patched clocks. Without ?capture this module does nothing.
export const CAPTURE = new URLSearchParams(location.search).has('capture');

export const clock = { now: 0 }; // ms

if (CAPTURE) {
  const epoch = Date.UTC(2026, 9, 20);
  let queue = [];
  let nextId = 1;
  // defineProperty, not assignment: a renderer's own time shim may already
  // have pinned these as read-only
  const pin = (obj, key, value) => Object.defineProperty(obj, key, { configurable: true, writable: true, value });
  pin(performance, 'now', () => clock.now);
  pin(Date, 'now', () => epoch + clock.now);
  pin(window, 'requestAnimationFrame', (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  });
  pin(window, 'cancelAnimationFrame', (id) => {
    queue = queue.filter((q) => q.id !== id);
  });
  // run one animation frame at the current virtual time
  clock.flush = () => {
    const run = queue;
    queue = [];
    run.forEach((q) => q.cb(clock.now));
  };
  // walk the clock forward in small steps so tweens and lerps see real frames
  clock.advanceTo = (ms, step = 1000 / 60) => {
    if (ms < clock.now) return;
    while (clock.now < ms) {
      clock.now = Math.min(ms, clock.now + step);
      clock.flush();
    }
  };
}
