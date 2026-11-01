import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PersistentHorizontalScroll, {
  clampScrollOffset,
} from "../client/src/components/PersistentHorizontalScroll";

// Vitest executes the project's preserved JSX in Node, where the classic JSX
// runtime needs this binding while the component is server-rendered.
const globalReact = globalThis as typeof globalThis & { React?: typeof React };
globalReact.React = React;

function renderScrollWrapper() {
  const table = React.createElement(
    "table",
    { "data-test-table": "source-table", "aria-label": "Source results" },
    React.createElement(
      "tbody",
      null,
      React.createElement(
        "tr",
        null,
        React.createElement("td", null, "Unchanged cell content")
      )
    )
  );

  return renderToStaticMarkup(
    React.createElement(
      PersistentHorizontalScroll,
      {
        label: "Borehole results",
        id: "borehole-scroll-viewport",
        className: "viewport-probe",
      },
      table
    )
  );
}

function scrollbarElement(markup: string) {
  const match = markup.match(/<[^>]+\brole="scrollbar"[^>]*>/);
  if (!match) throw new Error("Expected a horizontal scrollbar control");
  return match[0];
}

function controlsElement(markup: string) {
  const match = markup.match(
    /<div\b(?=[^>]*\bdata-slot="horizontal-scroll-controls")[^>]*>/
  );
  if (!match) throw new Error("Expected horizontal scroll controls");
  return match[0];
}

function viewportElement(markup: string) {
  const match = markup.match(
    /<div\b(?=[^>]*\bdata-slot="table-scroll-viewport")(?=[^>]*\bid="([^"]+)")[^>]*>/
  );
  if (!match) throw new Error("Expected the table scroll viewport");
  return { element: match[0], id: match[1] };
}

describe("clampScrollOffset", () => {
  it("keeps finite offsets within the available horizontal range", () => {
    expect(clampScrollOffset(0, 120)).toBe(0);
    expect(clampScrollOffset(48.5, 120)).toBe(48.5);
    expect(clampScrollOffset(120, 120)).toBe(120);
  });

  it("clamps finite offsets below zero and above the maximum", () => {
    expect(clampScrollOffset(-0.01, 120)).toBe(0);
    expect(clampScrollOffset(-250, 120)).toBe(0);
    expect(clampScrollOffset(120.01, 120)).toBe(120);
    expect(clampScrollOffset(999, 120)).toBe(120);
  });

  it("returns zero for non-finite offsets or a non-positive/non-finite maximum", () => {
    expect(clampScrollOffset(Number.NaN, 120)).toBe(0);
    expect(clampScrollOffset(Number.POSITIVE_INFINITY, 120)).toBe(0);
    expect(clampScrollOffset(Number.NEGATIVE_INFINITY, 120)).toBe(0);
    expect(clampScrollOffset(50, 0)).toBe(0);
    expect(clampScrollOffset(50, -1)).toBe(0);
    expect(clampScrollOffset(50, Number.NaN)).toBe(0);
    expect(clampScrollOffset(50, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("PersistentHorizontalScroll server markup", () => {
  it("keeps the provided table intact inside the designated scroll viewport", () => {
    const markup = renderScrollWrapper();

    const viewportIndex = markup.indexOf('data-slot="table-scroll-viewport"');
    const tableIndex = markup.indexOf('<table data-test-table="source-table"');

    expect(viewportIndex).toBeGreaterThanOrEqual(0);
    expect(tableIndex).toBeGreaterThan(viewportIndex);
    expect(markup).toContain(
      '<table data-test-table="source-table" aria-label="Source results">'
    );
    expect(markup).toContain("Unchanged cell content");
  });

  it("forwards div properties to the viewport and connects the accessible scrollbar to it", () => {
    const markup = renderScrollWrapper();
    const viewport = viewportElement(markup);
    const scrollbar = scrollbarElement(markup);

    expect(viewport.element).toMatch(/\bclass="[^"]*\bviewport-probe\b/);
    expect(scrollbar).toContain('aria-orientation="horizontal"');
    expect(scrollbar).toContain(`aria-controls="${viewport.id}"`);
    expect(markup).toContain("Borehole results");
  });

  it("server-renders both direction buttons and scrollbar controls hidden before measurement", () => {
    const markup = renderScrollWrapper();
    const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const controls = controlsElement(markup);
    const scrollbar = scrollbarElement(markup);

    expect(buttons).toHaveLength(2);
    expect(/\bhidden(?:=|\b)/.test(controls)).toBe(true);
    expect(scrollbar).toContain('aria-orientation="horizontal"');
  });
});
