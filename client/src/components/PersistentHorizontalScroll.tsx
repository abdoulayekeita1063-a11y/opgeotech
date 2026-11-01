import { useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent, ReactNode, UIEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function clampScrollOffset(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(max, value));
}

/** A horizontal control outside the vertically scrolling table, so it is always
 * accessible while scrolling rows. Native scrollbar, buttons and touch/keyboard
 * navigation all synchronize with the existing table viewport in both directions.
 */
export default function PersistentHorizontalScroll({
  children,
  label,
  className,
  onScroll,
  ...viewportProps
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; label: string }) {
  const viewportId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ width: 0, max: 0, left: 0 });
  const overflow = metrics.max > 1;

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let frame = 0;
    const measure = () => {
      if (viewport.clientWidth <= 0) return; // Inactive tabs are hidden, not empty.
      const width = viewport.scrollWidth;
      const max = Math.max(0, width - viewport.clientWidth);
      const left = clampScrollOffset(viewport.scrollLeft, max);
      if (Math.abs(viewport.scrollLeft - left) > 0.5)
        viewport.scrollLeft = left;
      setMetrics(previous =>
        previous.width === width &&
        previous.max === max &&
        previous.left === left
          ? previous
          : { width, max, left }
      );
    };
    const scheduleMeasure = () => {
      measure();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        // Adding rows or showing the control can create vertical scrollbars on
        // the page and the table. Measure again after that layout has settled.
        frame = requestAnimationFrame(measure);
      });
    };
    measure();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(content);
    if (content.firstElementChild)
      resizeObserver?.observe(content.firstElementChild);
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [children]);

  // Resize, filtering and re-showing the force-mounted Statistics tab must retain
  // the current offset after the native bar's spacer width has changed.
  useEffect(() => {
    const bar = barRef.current;
    if (bar && Math.abs(bar.scrollLeft - metrics.left) > 0.5)
      bar.scrollLeft = metrics.left;
  }, [metrics.width, metrics.max, metrics.left]);

  const syncScroll = (
    source: HTMLDivElement,
    target: HTMLDivElement | null
  ) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const left = clampScrollOffset(source.scrollLeft, max);
    if (target && Math.abs(target.scrollLeft - left) > 0.5)
      target.scrollLeft = left;
    setMetrics(previous =>
      previous.left === left && previous.max === max
        ? previous
        : { ...previous, left, max }
    );
  };
  const scrollTo = (left: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const next = clampScrollOffset(left, max);
    viewport.scrollLeft = next;
    if (barRef.current) barRef.current.scrollLeft = next;
    setMetrics(previous => ({ ...previous, left: next, max }));
  };
  const scrollByPage = (direction: number) => {
    const viewport = viewportRef.current;
    if (viewport)
      scrollTo(
        viewport.scrollLeft +
          direction * Math.max(150, viewport.clientWidth * 0.7)
      );
  };
  const handleBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const actions: Record<string, number> = {
      ArrowLeft: viewport.scrollLeft - 80,
      ArrowRight: viewport.scrollLeft + 80,
      PageUp: viewport.scrollLeft - viewport.clientWidth * 0.7,
      PageDown: viewport.scrollLeft + viewport.clientWidth * 0.7,
      Home: 0,
      End: max,
    };
    if (!(event.key in actions)) return;
    event.preventDefault();
    scrollTo(actions[event.key]);
  };
  const handleViewportScroll = (event: UIEvent<HTMLDivElement>) => {
    syncScroll(event.currentTarget, barRef.current);
    onScroll?.(event);
  };

  return (
    <div
      data-slot="persistent-horizontal-scroll"
      className="relative min-w-0 border border-foreground"
    >
      <div
        hidden={!overflow}
        data-slot="horizontal-scroll-controls"
        className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-background px-2 py-1.5 text-foreground shadow-sm"
      >
        <button
          type="button"
          aria-label={`Scroll ${label} columns left`}
          title="Scroll columns left"
          className="flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-background text-foreground disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
          disabled={metrics.left <= 0.5}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={barRef}
          role="scrollbar"
          aria-label={`${label} horizontal scroll`}
          aria-orientation="horizontal"
          aria-controls={viewportId}
          aria-valuemin={0}
          aria-valuemax={Math.round(metrics.max)}
          aria-valuenow={Math.round(metrics.left)}
          aria-valuetext="Scroll left or right to see more columns"
          tabIndex={overflow ? 0 : -1}
          className="min-w-0 flex-1 overflow-x-scroll overflow-y-hidden overscroll-x-contain [scrollbar-width:auto] [scrollbar-color:#64748b_#e2e8f0] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500 [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-200 focus-visible:outline-2 focus-visible:outline-ring"
          onScroll={event =>
            syncScroll(event.currentTarget, viewportRef.current)
          }
          onKeyDown={handleBarKeyDown}
        >
          <div
            aria-hidden="true"
            style={{ width: `calc(100% + ${metrics.max}px)`, height: 1 }}
          />
        </div>
        <button
          type="button"
          aria-label={`Scroll ${label} columns right`}
          title="Scroll columns right"
          className="flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-background text-foreground disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
          disabled={metrics.left >= metrics.max - 0.5}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div
        {...viewportProps}
        ref={viewportRef}
        id={viewportId}
        data-slot="table-scroll-viewport"
        className={cn("max-h-[680px] overflow-auto", className)}
        onScroll={handleViewportScroll}
      >
        <div ref={contentRef} className="min-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
