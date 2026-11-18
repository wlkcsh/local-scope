"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface TacticalSelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
  badge?: string;
  dotClassName?: string;
}

interface TacticalSelectProps<T extends string = string> {
  value: T;
  options: TacticalSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  icon?: React.ReactNode;
  align?: "left" | "right";
  placement?: "auto" | "top" | "bottom";
  minMenuWidth?: number;
  className?: string;
}

interface MenuCoords {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

export function TacticalSelect<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  icon,
  align = "right",
  placement = "auto",
  minMenuWidth = 220,
  className = "",
}: TacticalSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, minMenuWidth);
    const estimatedHeight = Math.min(options.length * 36 + 16, 296);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    const openUpward =
      placement === "top" ||
      (placement === "auto" && spaceBelow < estimatedHeight && spaceAbove > spaceBelow);

    let left = align === "right" ? rect.right - menuWidth : rect.left;
    left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12));

    const top = openUpward ? rect.top - 6 : rect.bottom + 6;

    setCoords({ top, left, width: menuWidth, openUpward });
  }, [align, minMenuWidth, options.length, placement]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    updatePosition();

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      updatePosition();
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [open, selectedIndex, updatePosition]);

  // Scroll highlighted option into view inside menu
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const activeEl = menuRef.current.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`
    );
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const commitSelection = (idx: number) => {
    const opt = options[idx];
    if (opt) {
      onChange(opt.value);
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (open) {
      // Prevent replay shortcuts (Space / Arrows) from firing while choosing an option
      e.stopPropagation();
    }

    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          commitSelection(activeIndex);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((prev) => (prev + 1) % options.length);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
        }
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Escape":
      case "Tab":
        if (open) {
          if (e.key === "Escape") e.preventDefault();
          setOpen(false);
          if (e.key === "Escape") triggerRef.current?.focus();
        }
        break;
    }
  };

  const menu =
    open && coords && mounted
      ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              width: `${coords.width}px`,
              transform: coords.openUpward ? "translateY(-100%)" : undefined,
            }}
            className="tactical-select-menu z-[9990] rounded-xl bg-obsidian-surface border border-obsidian-border-hover shadow-2xl p-1.5 backdrop-blur-md max-h-72 overflow-y-auto"
          >
            <div className="space-y-0.5">
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === activeIndex;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-option-index={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => commitSelection(idx)}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left font-mono text-[11px] transition-colors cursor-pointer focus:outline-none ${
                      isSelected
                        ? "bg-rust-subtle text-white font-semibold"
                        : isActive
                        ? "bg-obsidian-subtle text-white"
                        : "text-slate-300 hover:bg-obsidian-subtle"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-rust stroke-[2.5]" />
                        ) : opt.dotClassName ? (
                          <span className={`w-2 h-2 rounded-full ${opt.dotClassName}`} />
                        ) : null}
                      </span>
                      <span className="truncate tracking-wide">{opt.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {opt.hint && (
                        <span className="text-[10px] text-slate-500 font-normal">
                          {opt.hint}
                        </span>
                      )}
                      {opt.badge !== undefined && (
                        <span className="px-1.5 py-0.5 rounded bg-obsidian-subtle border border-obsidian-border text-[9px] font-bold text-slate-400 tabular-nums">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-obsidian-surface border text-xs font-mono font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 ${
          open
            ? "border-rust text-white shadow-sm"
            : "border-obsidian-border hover:border-obsidian-border-hover text-slate-200"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
          {selectedOption?.dotClassName && (
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedOption.dotClassName}`} />
          )}
          <span className="truncate tracking-wide">{selectedOption?.label}</span>
          {selectedOption?.hint && (
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              {selectedOption.hint}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-150 ${
            open ? "rotate-180 text-rust" : ""
          }`}
        />
      </button>
      {menu}
    </div>
  );
}
