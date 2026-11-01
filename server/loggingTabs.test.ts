import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LoggingData from "../client/src/pages/LoggingData";
import { trpc } from "../client/src/lib/trpc";
import type { AppRouter } from "./routers";

// Vitest executes the project's preserved JSX in Node, where the classic JSX
// runtime needs this binding while the component is server-rendered.
Object.assign(globalThis, { React });

function renderLoggingData() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  queryClient.setQueryData(getQueryKey(trpc.logging.list), []);

  const client = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "http://test.invalid/api/trpc",
        fetch: async () => {
          throw new Error("Logging Data SSR test must not make a tRPC request");
        },
      }),
    ],
  });

  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        trpc.Provider,
        { client, queryClient },
        React.createElement(LoggingData)
      )
    )
  );
}

function tabElements(markup: string) {
  return (
    markup.match(/<button\b[^>]*\brole="tab"[^>]*>[\s\S]*?<\/button>/g) ?? []
  );
}

function activeTabPanel(markup: string) {
  const openingPanel =
    /<div\b(?=[^>]*\brole="tabpanel")(?=[^>]*\bdata-state="active")[^>]*>/g.exec(
      markup
    );
  if (!openingPanel || openingPanel.index === undefined) {
    throw new Error("Expected an active tab panel in the rendered markup");
  }

  const start = openingPanel.index;
  const elementPattern = /<\/?div\b[^>]*>/g;
  elementPattern.lastIndex = start;
  let depth = 0;
  let element: RegExpExecArray | null;
  while ((element = elementPattern.exec(markup))) {
    depth += element[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return markup.slice(start, elementPattern.lastIndex);
  }

  throw new Error("Expected the active tab panel to have a closing element");
}

describe("Logging Data tabs", () => {
  it("renders the three labelled tabs with Rock mass classification selected by default", () => {
    const tabs = tabElements(renderLoggingData());

    expect(tabs).toHaveLength(3);
    expect(tabs.map(tab => tab.replace(/<[^>]+>/g, "").trim())).toEqual([
      "Rock mass classification",
      "Discontinuity data",
      "Statistics",
    ]);
    expect(
      tabs.filter(tab => tab.includes('aria-selected="true"'))
    ).toHaveLength(1);
    expect(tabs[0]).toContain('aria-selected="true"');
  });

  it("keeps Statistics only as a tab, without a duplicate toolbar button", () => {
    const markup = renderLoggingData();
    const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const statisticsButtons = buttons.filter(
      button => button.replace(/<[^>]+>/g, "").trim() === "Statistics"
    );
    expect(statisticsButtons).toHaveLength(1);
    expect(statisticsButtons[0]).toContain('role="tab"');
  });

  it("renders only the rock mass table in the active default panel", () => {
    const rockPanel = activeTabPanel(renderLoggingData());

    expect(rockPanel).toContain('aria-label="Rock mass classification table"');
    expect(rockPanel).toContain("RQD");
    expect(rockPanel).not.toContain("Structure Depth");
    expect(rockPanel).not.toContain("Alpha / Dip");
    expect(rockPanel).not.toContain("Beta / Dip Dir.");
  });

  it("does not server-render the inactive discontinuity table", () => {
    const markup = renderLoggingData();

    expect(markup).not.toContain('aria-label="Discontinuity data table"');
  });
});
