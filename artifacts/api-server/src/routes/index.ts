import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gauntletRouter from "./gauntlet";

const router: IRouter = Router();

router.get("/", (_req, res) => {
  res.json({
    name: "Technocore Gauntlet API",
    status: "ok",
    website: "https://vaibhav0xq.github.io/technocore-gauntlet/",
    health: "/api/healthz",
    repository: "https://github.com/vaibhav0xq/technocore-gauntlet",
  });
});

router.use(healthRouter);
router.use(gauntletRouter);

export default router;
