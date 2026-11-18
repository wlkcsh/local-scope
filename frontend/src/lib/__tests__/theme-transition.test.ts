import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  THEME_STORAGE_KEY,
  THEME_TRANSITIONING_CLASS,
  applyThemeClass,
  computeAdaptiveDuration,
  computeCircleGeometry,
  readSavedTheme,
  runCircleThemeTransition,
} from "../theme-transition";

function createMockClassList(initial: string[] = []) {
  const classes = new Set<string>(initial);
  return {
    add: (...tokens: string[]) => tokens.forEach((t) => classes.add(t)),
    remove: (...tokens: string[]) => tokens.forEach((t) => classes.delete(t)),
    toggle: (token: string, force?: boolean) => {
      if (force === undefined) {
        if (classes.has(token)) {
          classes.delete(token);
          return false;
        }
        classes.add(token);
        return true;
      }
      if (force) {
        classes.add(token);
      } else {
        classes.delete(token);
      }
      return force;
    },
    contains: (token: string) => classes.has(token),
  };
}

describe("theme-transition utilities", () => {
  const g = globalThis as Record<string, unknown>;
  const originalWindow = g.window;
  const originalDocument = g.document;
  const originalLocalStorage = g.localStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWindow === undefined) delete g.window;
    else g.window = originalWindow;

    if (originalDocument === undefined) delete g.document;
    else g.document = originalDocument;

    if (originalLocalStorage === undefined) delete g.localStorage;
    else g.localStorage = originalLocalStorage;
  });

  describe("computeCircleGeometry", () => {
    it("computes button center and farthest-corner radius for top-right toggle", () => {
      const originEl = {
        getBoundingClientRect: () => ({
          left: 1180,
          top: 18,
          width: 60,
          height: 28,
        }),
      } as unknown as Element;

      const geo = computeCircleGeometry(originEl, { width: 1440, height: 900 });

      expect(geo.x).toBe(1210);
      expect(geo.y).toBe(32);
      // Farthest corner is bottom-left: dx = max(1210, 230) = 1210, dy = max(32, 868) = 868
      expect(geo.maxRadius).toBeCloseTo(Math.hypot(1210, 868), 6);
    });

    it("falls back to viewport center when originEl is null or omitted", () => {
      const geoNull = computeCircleGeometry(null, { width: 1000, height: 600 });
      const geoUndef = computeCircleGeometry(undefined, { width: 1000, height: 600 });

      expect(geoNull).toEqual(geoUndef);
      expect(geoNull.x).toBe(500);
      expect(geoNull.y).toBe(300);
      expect(geoNull.maxRadius).toBeCloseTo(Math.hypot(500, 300), 6);
    });
  });

  describe("computeAdaptiveDuration", () => {
    it("keeps base duration on standard viewports", () => {
      expect(computeAdaptiveDuration(600, { width: 1440, height: 900 })).toBe(600);
      expect(computeAdaptiveDuration(600, { width: 2560, height: 1440 })).toBe(600);
    });

    it("reduces duration by 20% on high-resolution viewports (>= 3000px)", () => {
      expect(computeAdaptiveDuration(600, { width: 3840, height: 2160 })).toBe(480);
      expect(computeAdaptiveDuration(600, { width: 1440, height: 3000 })).toBe(480);
    });
  });

  describe("applyThemeClass and readSavedTheme", () => {
    it("toggles editorial and dark classes mutually exclusively and persists to localStorage", () => {
      const store = new Map<string, string>();
      g.localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      };

      const classList = createMockClassList(["dark"]);
      const root = { classList } as unknown as Element;

      applyThemeClass("editorial", root);
      expect(classList.contains("editorial")).toBe(true);
      expect(classList.contains("dark")).toBe(false);
      expect(store.get(THEME_STORAGE_KEY)).toBe("editorial");
      expect(readSavedTheme()).toBe("editorial");

      applyThemeClass("dark", root);
      expect(classList.contains("editorial")).toBe(false);
      expect(classList.contains("dark")).toBe(true);
      expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
      expect(readSavedTheme()).toBe("dark");
    });

    it("defaults to document.documentElement when root argument is omitted", () => {
      const classList = createMockClassList(["dark"]);
      g.document = { documentElement: { classList } };
      g.localStorage = { getItem: () => null, setItem: vi.fn() };

      applyThemeClass("editorial");

      expect(classList.contains("editorial")).toBe(true);
      expect(classList.contains("dark")).toBe(false);
    });

    it("returns dark when localStorage is empty or holds an unknown value", () => {
      let stored: string | null = null;
      g.localStorage = {
        getItem: () => stored,
        setItem: vi.fn(),
      };

      expect(readSavedTheme()).toBe("dark");
      stored = "invalid-theme";
      expect(readSavedTheme()).toBe("dark");
    });

    it("handles localStorage failures gracefully without throwing", () => {
      g.localStorage = {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      };

      const classList = createMockClassList(["dark"]);
      const root = { classList } as unknown as Element;

      expect(() => applyThemeClass("editorial", root)).not.toThrow();
      expect(classList.contains("editorial")).toBe(true);
      expect(readSavedTheme()).toBe("dark");
    });
  });

  describe("runCircleThemeTransition", () => {
    it("runs startViewTransition, toggles scoped transitioning class, animates clipPath, and awaits finished", async () => {
      const classList = createMockClassList(["dark"]);
      const animateMock = vi.fn();
      const onUpdateDom = vi.fn();

      let resolveFinished!: () => void;
      const finishedPromise = new Promise<void>((resolve) => {
        resolveFinished = resolve;
      });

      const startViewTransition = vi.fn((cb: () => void | Promise<void>) => {
        const result = cb();
        return {
          updateCallbackDone: Promise.resolve(result),
          ready: Promise.resolve(),
          finished: finishedPromise,
        };
      });

      g.window = {
        innerWidth: 1440,
        innerHeight: 900,
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      };
      g.document = {
        startViewTransition,
        documentElement: { classList, animate: animateMock },
      };

      const originEl = {
        getBoundingClientRect: () => ({ left: 100, top: 20, width: 40, height: 20 }),
      } as unknown as Element;

      let settled = false;
      const runPromise = runCircleThemeTransition({
        originEl,
        onUpdateDom,
        durationMs: 600,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }).then(() => {
        settled = true;
      });

      await Promise.resolve();
      await Promise.resolve();

      // Still transitioning until finished resolves
      expect(classList.contains(THEME_TRANSITIONING_CLASS)).toBe(true);
      expect(settled).toBe(false);
      expect(startViewTransition).toHaveBeenCalledTimes(1);
      expect(onUpdateDom).toHaveBeenCalledTimes(1);
      expect(animateMock).toHaveBeenCalledTimes(1);

      const expectedRadius = Math.hypot(Math.max(120, 1440 - 120), Math.max(30, 900 - 30));
      expect(animateMock).toHaveBeenCalledWith(
        {
          clipPath: [
            "circle(0px at 120px 30px)",
            `circle(${expectedRadius}px at 120px 30px)`,
          ],
        },
        {
          duration: 600,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );

      resolveFinished();
      await runPromise;

      expect(settled).toBe(true);
      expect(classList.contains(THEME_TRANSITIONING_CLASS)).toBe(false);
    });

    it("forwards async onUpdateDom promises to startViewTransition and awaits fallback paths", async () => {
      let updated = false;
      const asyncUpdate = vi.fn(async () => {
        await Promise.resolve();
        updated = true;
      });

      // SSR fallback (document undefined)
      delete g.document;
      await runCircleThemeTransition({ onUpdateDom: asyncUpdate });
      expect(updated).toBe(true);

      // ViewTransition path forwards promise return value
      let returnedFromCallback: unknown;
      g.window = {
        innerWidth: 1280,
        innerHeight: 720,
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      };
      g.document = {
        startViewTransition: vi.fn((cb: () => unknown) => {
          returnedFromCallback = cb();
          return {
            updateCallbackDone: Promise.resolve(),
            ready: Promise.resolve(),
            finished: Promise.resolve(),
          };
        }),
        documentElement: { classList: createMockClassList(), animate: vi.fn() },
      };

      await runCircleThemeTransition({ onUpdateDom: asyncUpdate });
      expect(returnedFromCallback).toBeInstanceOf(Promise);
    });

    it("falls back when document.startViewTransition is unsupported", async () => {
      const onUpdateDom = vi.fn();
      g.window = {
        innerWidth: 1440,
        innerHeight: 900,
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      };
      g.document = {
        documentElement: { classList: createMockClassList() },
      };

      await runCircleThemeTransition({ onUpdateDom });

      expect(onUpdateDom).toHaveBeenCalledTimes(1);
    });

    it("skips animation when prefers-reduced-motion: reduce is active", async () => {
      const onUpdateDom = vi.fn();
      const startViewTransition = vi.fn();

      g.window = {
        innerWidth: 1440,
        innerHeight: 900,
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      };
      g.document = {
        startViewTransition,
        documentElement: { classList: createMockClassList(), animate: vi.fn() },
      };

      await runCircleThemeTransition({ onUpdateDom });

      expect(onUpdateDom).toHaveBeenCalledTimes(1);
      expect(startViewTransition).not.toHaveBeenCalled();
    });

    it("degrades gracefully when animate is missing or throws", async () => {
      const classList = createMockClassList();
      const onUpdateDom = vi.fn();

      g.window = {
        innerWidth: 0,
        innerHeight: 0,
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      };
      g.document = {
        startViewTransition: vi.fn((cb: () => void) => {
          cb();
          return {
            updateCallbackDone: Promise.resolve(),
            ready: Promise.resolve(),
            finished: Promise.resolve(),
          };
        }),
        documentElement: {
          classList,
          clientWidth: 1200,
          clientHeight: 800,
          animate: vi.fn(() => {
            throw new TypeError("pseudoElement unsupported");
          }),
        },
      };

      await expect(runCircleThemeTransition({ onUpdateDom })).resolves.toBeUndefined();
      expect(onUpdateDom).toHaveBeenCalledTimes(1);
      expect(classList.contains(THEME_TRANSITIONING_CLASS)).toBe(false);
    });

    it("absorbs AbortError cleanly and removes transitioning class", async () => {
      const classList = createMockClassList();
      const animateMock = vi.fn();
      const onUpdateDom = vi.fn();
      const abortErr = new DOMException("Transition aborted", "AbortError");

      g.window = {
        innerWidth: 1440,
        innerHeight: 900,
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      };
      g.document = {
        startViewTransition: vi.fn((cb: () => void) => {
          cb();
          return {
            updateCallbackDone: Promise.resolve(),
            ready: Promise.reject(abortErr),
            finished: Promise.reject(abortErr),
          };
        }),
        documentElement: { classList, animate: animateMock },
      };

      await expect(runCircleThemeTransition({ onUpdateDom })).resolves.toBeUndefined();

      expect(onUpdateDom).toHaveBeenCalledTimes(1);
      expect(animateMock).not.toHaveBeenCalled();
      expect(classList.contains(THEME_TRANSITIONING_CLASS)).toBe(false);
    });

    it("re-throws unexpected non-abort errors from transition.ready", async () => {
      const classList = createMockClassList();
      const boom = new Error("DOM update crashed");

      g.window = {
        innerWidth: 1440,
        innerHeight: 900,
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      };
      g.document = {
        startViewTransition: vi.fn(() => ({
          updateCallbackDone: Promise.reject(boom),
          ready: Promise.reject(boom),
          finished: Promise.reject(boom),
        })),
        documentElement: { classList, animate: vi.fn() },
      };

      await expect(
        runCircleThemeTransition({ onUpdateDom: vi.fn() })
      ).rejects.toThrow("DOM update crashed");
      expect(classList.contains(THEME_TRANSITIONING_CLASS)).toBe(false);
    });
  });
});
