import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { validateEnv, getEnv } from "./env";
import { NatsBridge } from "./nats-bridge";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate environment variables on startup
  const env = validateEnv();
  console.log('✅ Environment validation passed');
  
  const server = await registerRoutes(app);
  
  // Initialize NATS WebSocket bridge (skip in development without NATS_URL)
  if (process.env.NATS_URL) {
    const natsBridge = new NatsBridge(server);
    try {
      await natsBridge.connect();
      console.log('✅ NATS WebSocket bridge initialized');
    } catch (error) {
      console.log('⚠️  NATS connection failed, continuing without real-time features:', error.message);
    }
  } else {
    console.log('⚠️  NATS_URL not set, skipping real-time features for development');
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use validated environment port
  const port = env.PORT;
  server.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();
