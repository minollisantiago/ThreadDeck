// jsdom has no layout observer; Radix uses it to measure tooltip arrows.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
