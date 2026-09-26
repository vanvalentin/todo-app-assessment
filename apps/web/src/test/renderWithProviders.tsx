import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

interface RenderOptions {
  route?: string;
}

/** Renders UI inside a fresh query client and an in-memory router. */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = createTestQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? "/"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

/** Builds a router with extra destinations used to observe navigation. */
export function renderRoutes(
  routes: ReactElement,
  options: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  return renderWithProviders(<Routes>{routes}</Routes>, options);
}

export { Route, Routes };
