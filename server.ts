import compression from "compression";
import express from "express";
import morgan from "morgan";
import * as trpcExpress from "@trpc/server/adapters/express";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { WebSocketServer } from "ws";
import {
  applyWSSHandler,
  type CreateWSSContextFnOptions,
} from "@trpc/server/adapters/ws";
import { observable } from "@trpc/server/observable";
import z from "zod";

function createContext(
  opts: trpcExpress.CreateExpressContextOptions | CreateWSSContextFnOptions
) {
  return {};
}
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const greetingRouter = router({
  hello: publicProcedure
    .input(
      z.object({
        name: z.string(),
      })
    )
    .query(({ input }) => `Hello, ${input.name}!`),
});

const postRouter = router({
  createPost: publicProcedure
    .input(
      z.object({
        title: z.string(),
        text: z.string(),
      })
    )
    .mutation(({ input }) => {
      // imagine db call here
      return {
        id: `${Math.random()}`,
        ...input,
      };
    }),
  randomNumber: publicProcedure.subscription(async function* (opts) {
    let i = 0;

    const controller = new AbortController();

    const interval = setInterval(() => {
      i++;
    }, 1000);

    // Handle external cancellation
    opts.signal?.addEventListener("abort", () => {
      console.log("unsub");
      controller.abort(); // useful if other async operations are inside
      clearInterval(interval);
    });

    try {
      while (!opts.signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        yield { randomNumber: Math.random() };
      }
    } finally {
      console.log("DONE");
      clearInterval(interval);
    }
  }),
});

const appRouter = router({
  greeting: greetingRouter,
  post: postRouter,
});

export type AppRouter = typeof appRouter;

const wss = new WebSocketServer({
  port: 3001,
});

const handler = applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
  keepAlive: {
    enabled: false,
    pingMs: 1000,
    pongWaitMs: 5000,
  },
});

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  const id = Math.random().toString(36).slice(2, 7);
  (ws as any)._id = id;
  console.log(`++ Client ${id} (${ip}) connected (${wss.clients.size} total)`);

  ws.once("close", () => {
    setTimeout(() => {
      console.log(
        `-- Client ${id} disconnected (${wss.clients.size} remaining)`
      );
    }, 0);
  });
});
console.log("✅ WebSocket Server listening on ws://localhost:3001");
process.on("SIGTERM", () => {
  console.log("SIGTERM");
  handler.broadcastReconnectNotification();
  wss.close();
});

// Short-circuit the type-checking of the built output.
const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "3000");

const app = express();

app.use(compression());
app.disable("x-powered-by");

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

if (DEVELOPMENT) {
  console.log("Starting development server");
  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({
      server: { middlewareMode: true },
    })
  );
  app.use(viteDevServer.middlewares);
  app.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule("./server/app.ts");
      return await source.app(req, res, next);
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  console.log("Starting production server");
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" })
  );
  app.use(express.static("build/client", { maxAge: "1h" }));
  app.use(await import(BUILD_PATH).then((mod) => mod.app));
}

app.use(morgan("tiny"));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
