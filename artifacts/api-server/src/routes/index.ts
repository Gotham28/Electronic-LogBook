import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studentRouter from "./student";
import professorRouter from "./professor";
import authRouter from "./auth";
import adminRouter from "./admin";
import departmentRouter from "./department";
import logsRouter from "./logs";
import assignmentsRouter from "./assignments.js";
import paymentsRouter from "./payments.js";
import paymentsWebhookRouter from "./payments-webhook.js";

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
// Mounted before paymentsRouter: paymentsRouter gates every route it owns behind
// requirePaymentToken (payments.ts:12), which the unauthenticated Razorpay webhook caller can
// never satisfy. Only POST /webhook is defined here, so every other /payments/* path falls
// through to paymentsRouter unchanged.
router.use("/payments", paymentsWebhookRouter);
router.use("/payments", paymentsRouter);

export default router;
