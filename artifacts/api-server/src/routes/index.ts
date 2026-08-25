import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gauntletRouter from "./gauntlet";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gauntletRouter);

export default router;
