import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studentRouter from "./student";
import professorRouter from "./professor";
import authRouter from "./auth";
import adminRouter from "./admin";
import departmentRouter from "./department";
import logsRouter from "./logs";
import assignmentsRouter from "./assignments.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", adminRouter);
router.use("/student", studentRouter);
router.use("/students", studentRouter);
router.use("/professors", professorRouter);
router.use("/departments", departmentRouter);
router.use("/logs", logsRouter);
router.use("/assignments", assignmentsRouter);

export default router;
