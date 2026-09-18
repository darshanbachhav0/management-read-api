import { Router } from "express";
import { dashboard, filters, report, snapshot } from "../controllers/managementController.js";

const router = Router();

router.get("/dashboard", dashboard);
router.get("/report", report);
router.get("/filters", filters);
router.get("/snapshot", snapshot);

export default router;
