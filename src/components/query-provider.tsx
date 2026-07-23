"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient, type Persister } from "@tanstack/react-query-persist-client";
import { type ReactNode, useEffect, useState } from "react";

const cacheDatabase = "lenden-query-cache";
const cacheStore = "persisted-client";
const cacheKey = "workspace";
const legacyCacheKey = "lenden-query-cache-v3";
const maxPersistedQueryBytes = 500_000;

function openCacheDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(cacheDatabase, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(cacheStore)) {
        request.result.createObjectStore(cacheStore);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function indexedDbPersister(): Persister {
  return {
    persistClient: async (client) => {
      const database = await openCacheDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(cacheStore, "readwrite");
        transaction.objectStore(cacheStore).put(client, cacheKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    restoreClient: async () => {
      const database = await openCacheDatabase();
      const client = await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction(cacheStore, "readonly");
        const request = transaction.objectStore(cacheStore).get(cacheKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return client as Awaited<ReturnType<Persister["restoreClient"]>>;
    },
    removeClient: async () => {
      const database = await openCacheDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(cacheStore, "readwrite");
        transaction.objectStore(cacheStore).delete(cacheKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
  };
}

export function clearPersistedQueryCache() {
  window.localStorage.removeItem(legacyCacheKey);
  if ("indexedDB" in window) window.indexedDB.deleteDatabase(cacheDatabase);
}

function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { data: unknown } }) {
  const root = String(query.queryKey[0] ?? "");
  const compactPage = root === "operational" && query.queryKey[2] === "dashboard";
  if (root !== "bootstrap" && !compactPage) return false;
  try {
    return JSON.stringify(query.state.data).length <= maxPersistedQueryBytes;
  } catch {
    return false;
  }
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 1000 * 60 * 60 * 2,
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
    window.localStorage.removeItem(legacyCacheKey);
    if (!("indexedDB" in window)) return;

    const [unsubscribe] = persistQueryClient({
      queryClient,
      persister: indexedDbPersister(),
      buster: "lenden-operational-pages-v1",
      maxAge: 1000 * 60 * 60 * 12,
      dehydrateOptions: {
        shouldDehydrateQuery: shouldPersistQuery,
      },
    });

    return unsubscribe;
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
