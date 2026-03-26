import express from "express";
import { join } from "path";

export function createWebServer(port: number): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(import.meta.dirname, "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.listen(port, () => {
    console.log(`DNA dashboard at http://localhost:${port}`);
  });

  return app;
}
