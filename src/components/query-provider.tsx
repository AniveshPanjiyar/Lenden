"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { type ReactNode, useEffect, useState } from "react";

const persistedQueryRoots = new Set(["bootstrap", "dashboard"]);

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 1000 * 60 * 60 * 12,
            networkMode: "offlineFirst",
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  useEffect(() => {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: "lenden-query-cache-v3",
    });

    const [unsubscribe] = persistQueryClient({
      queryClient,
      persister,
      buster: "lenden-multi-business-v1",
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => persistedQueryRoots.has(String(query.queryKey[0])),
      },
    });

    return unsubscribe;
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
