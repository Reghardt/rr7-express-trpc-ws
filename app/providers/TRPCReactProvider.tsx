import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  loggerLink,
  splitLink,
  wsLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import SuperJSON from "superjson";
import type { AppRouter } from "../../server";
import { remember } from "@epic-web/remember";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;
function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

const getBaseUrl = () => {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
};

const wsClient =
  typeof window !== "undefined"
    ? remember("wsClient", () => createWSClient({ url: "ws://localhost:3001" }))
    : null;

// const wsClient = createWSClient({
//   url: `ws://localhost:3001`,
// });

const links = [
  loggerLink({
    enabled: (op) =>
      process.env.NODE_ENV === "development" ||
      (op.direction === "down" && op.result instanceof Error),
  }),
];

if (wsClient) {
  links.push(
    splitLink({
      condition: (op) => op.type === "subscription",
      true: wsLink({ client: wsClient, transformer: SuperJSON }),
      false: httpBatchLink({
        transformer: SuperJSON,
        url: getBaseUrl() + "/trpc",
        headers() {
          const headers = new Headers();
          headers.set("x-trpc-source", "react");
          return headers;
        },
      }),
    })
  );
}

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links,
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
