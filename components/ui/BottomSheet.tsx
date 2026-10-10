"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * White sheet, 32px top radius, scrim. Modal behaviour: focus moves in, Tab is trapped,
 * Esc / scrim / close button dismiss, the rest of the page is inert, focus returns to the trigger.
 */
export function BottomSheet({ open, onClose, title, children, className = "" }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !mounted) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Make everything outside the sheet unreachable (keyboard, screen reader) while it is open.
    const inerted: HTMLElement[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el instanceof HTMLElement && el !== rootRef.current && !el.inert) {
        el.inert = true;
        inerted.push(el);
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => {
      for (const el of inerted) el.inert = false;
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === firstItem || active === panelRef.current)) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && active === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  }

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50 flex items-end justify-center" onKeyDown={onKeyDown}>
      <div
        aria-hidden="true"
        onClick={() => onCloseRef.current()}
        className="absolute inset-0 animate-fade-in bg-ink/50"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative max-h-[90dvh] w-full max-w-[430px] animate-sheet-in overflow-y-auto rounded-t-sheet bg-white px-4 pb-6 pt-3 outline-none ${className}`}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-[22px] font-semibold leading-7 text-ink">
            {title}
          </h2>
          <IconButton label="Close" icon={<X size={20} strokeWidth={1.75} />} onClick={() => onCloseRef.current()} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
