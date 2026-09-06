import { readFile } from "node:fs/promises";
import { z } from "zod";
import { pool } from "@workspace/db";
import { provisionDepartment } from "./lib/department-provisioning.js";

async function provision() {
  if (!process.env.DEPARTMENT_SETUP_FILE) throw new Error("Set DEPARTMENT_SETUP_FILE to a department configuration JSON file");
  const input = JSON.parse(await readFile(process.env.DEPARTMENT_SETUP_FILE, "utf8"));
  const result = await provisionDepartment(input, process.env.HOD_INITIAL_PASSWORD);
  console.log("Department and HOD provisioned:", result);
}

provision().catch((error) => {
  // Database exceptions may contain bound values. Never print credentials or SQL parameters.
  console.error(error instanceof z.ZodError ? "Invalid setup data or HOD_INITIAL_PASSWORD" : error.cause ? "Database provisioning failed; check constraints and existing records" : error instanceof SyntaxError ? "Setup file must contain valid JSON" : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
