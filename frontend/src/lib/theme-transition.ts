export type ThemeMode = "dark" | "editorial";

export const THEME_STORAGE_KEY = "local-scope-theme" as const;
export const THEME_TRANSITIONING_CLASS = "theme-transitioning" as const;

const DEFAULT_DURATION_MS = 600;
const DEFAULT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const HIGH_RES_THRESHOLD_PX = 3000;
const HIGH_RES_DURATION_FACTOR = 0.8;

let activeTransitions = 0;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CircleGeometry {
  x: number;
  y: number;
  maxRadius: number;
}

export interface CircleThemeTransitionOptions {
  originEl?: Element | null;
  onUpdateDom: () => void | Promise<void>;
  durationMs?: number;
  easing?: string;
}

function isTransitionSkippedError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("name" in err)) {
    return false;
  }
  const name = (err as { name: unknown }).name;
  return name === "AbortError" || name === "InvalidStateError";
}

export function computeCircleGeometry(
  originEl: Element | null | undefined,
  viewport: ViewportSize
): CircleGeometry {
  let x = viewport.width / 2;
  let y = viewport.height / 2;

  if (originEl) {
    const rect = originEl.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }

  const maxRadius = Math.hypot(
    Math.max(x, viewport.width - x),
    Math.max(y, viewport.height - y)
  );

  return { x, y, maxRadius };
}

export function computeAdaptiveDuration(
  baseMs: number,
  viewport: ViewportSize
): number {
  if (Math.max(viewport.width, viewport.height) >= HIGH_RES_THRESHOLD_PX) {
    return Math.round(baseMs * HIGH_RES_DURATION_FACTOR);
  }
  return baseMs;
}

export function readSavedTheme(): ThemeMode {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(THEME_STORAGE_KEY) === "editorial"
    ) {
      return "editorial";
    }
  } catch {
    // Ignore storage access errors (e.g., restricted private mode)
  }
  return "dark";
}

export function applyThemeClass(
  mode: ThemeMode,
  root?: Element | null
): void {
  const target =
    root ?? (typeof document !== "undefined" ? document.documentElement : null);

  if (target) {
    target.classList.toggle("editorial", mode === "editorial");
    target.classList.toggle("dark", mode === "dark");
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  } catch {
    // Ignore storage quota or security errors
  }
}

/**
 * Executes a circular View Transition reveal from `originEl` around `onUpdateDom`.
 * Resolves after `transition.finished` completes (or immediately on fallback / abort).
 */
export async function runCircleThemeTransition(
  options: CircleThemeTransitionOptions
): Promise<void> {
  const {
    originEl = null,
    onUpdateDom,
    durationMs = DEFAULT_DURATION_MS,
    easing = DEFAULT_EASING,
  } = options;

  if (typeof document === "undefined") {
    await onUpdateDom();
    return;
  }

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (
    typeof document.startViewTransition !== "function" ||
    prefersReducedMotion
  ) {
    await onUpdateDom();
    return;
  }

  const root = document.documentElement;
  const viewport: ViewportSize = {
    width:
      (typeof window !== "undefined" ? window.innerWidth : 0) ||
      root?.clientWidth ||
      0,
    height:
      (typeof window !== "undefined" ? window.innerHeight : 0) ||
      root?.clientHeight ||
      0,
  };
  const { x, y, maxRadius } = computeCircleGeometry(originEl, viewport);
  const duration = computeAdaptiveDuration(durationMs, viewport);

  activeTransitions += 1;
  root?.classList?.add(THEME_TRANSITIONING_CLASS);

  try {
    const transition = document.startViewTransition(() => onUpdateDom());

    // Prevent unhandled promise rejections if a subsequent click supersedes this transition
    transition.updateCallbackDone?.catch(() => {});
    transition.finished?.catch(() => {});

    try {
      await transition.ready;
    } catch (err) {
      if (isTransitionSkippedError(err)) {
        return;
      }
      throw err;
    }

    if (typeof root?.animate === "function") {
      try {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration,
            easing,
            pseudoElement: "::view-transition-new(root)",
          }
        );
      } catch {
        // Degrade gracefully if pseudoElement animation is unsupported by the engine
      }
    }

    try {
      await transition.finished;
    } catch (err) {
      if (!isTransitionSkippedError(err)) {
        throw err;
      }
    }
  } finally {
    activeTransitions = Math.max(0, activeTransitions - 1);
    if (activeTransitions === 0) {
      root?.classList?.remove(THEME_TRANSITIONING_CLASS);
    }
  }
}
