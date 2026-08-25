import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const configuredCorsOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const corsOptions: CorsOptions | undefined =
  process.env.NODE_ENV === "production"
    ? {
        origin(origin, callback) {
          if (!origin || configuredCorsOrigins.has(origin)) {
            callback(null, true);
            return;
          }

          callback(new Error("Origin is not allowed by CORS"));
        },
      }
    : undefined;

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

app.use("/api", router);

export default app;
