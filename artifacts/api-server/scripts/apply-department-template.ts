// Run by the developer, by hand, against a database they have chosen. Dry run unless --apply is given.
//   pnpm db:apply-department-template --department-id 7 --expect-name "Radiology" --template radiology [--apply]
//   pnpm db:apply-department-template --department-id 3 --expect-name "Pediatrics" --set splitThesisAndCertifications=true [--apply]
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "department-id": { type: "string" },
    "expect-name": { type: "string" },
    template: { type: "string" },
    set: { type: "string", multiple: true },
    apply: { type: "boolean", default: false },
  },
  strict: true,
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const departmentId = Number(values["department-id"]);
if (!Number.isSafeInteger(departmentId) || departmentId <= 0) fail("--department-id must be a positive whole number");
const expectName = values["expect-name"];
if (!expectName) fail("--expect-name is required: the exact department name, as a guard against a wrong id");
if (!values.template && !values.set?.length) fail("Nothing to do: give --template <name> and/or --set flag=true|false");

const set: Record<string, boolean> = {};
for (const pair of values.set ?? []) {
  const match = /^([A-Za-z][A-Za-z0-9]*)=(true|false)$/.exec(pair);
  if (!match) fail(`--set expects flagName=true or flagName=false, got "${pair}"`);
  set[match[1]] = match[2] === "true";
}

try {
  console.log(`Database host: ${new URL(process.env.DATABASE_URL ?? "").host || "(unknown)"}`);
} catch {
  fail("DATABASE_URL is not set or is not a valid URL");
}
const { departmentTemplateSchema, applyDepartmentTemplate } = await import("../src/lib/department-template.js");
const { pool } = await import("@workspace/db");

let template;
if (values.template) {
  if (!/^[a-z0-9-]+$/.test(values.template)) fail("--template must be a template file name such as radiology");
  const file = new URL(`./department-templates/${values.template}.json`, import.meta.url);
  const parsed = departmentTemplateSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) fail(`Template ${values.template} is invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  template = parsed.data;
}

try {
  const result = await applyDepartmentTemplate({ departmentId, expectName, template, set, apply: values.apply });
  console.log(`${result.applied ? "APPLIED" : "DRY RUN (nothing saved; add --apply to save)"} for "${result.departmentName}" (id ${departmentId})`);
  console.log(`Feature flags before: ${JSON.stringify(result.featuresBefore)}`);
  console.log(`Feature flags after:  ${JSON.stringify(result.featuresAfter)}`);
  console.log(`Catalog rows added: ${result.catalogAdded}, already present: ${result.catalogAlreadyPresent}`);
  console.log(`Posting schedule rows written: ${result.scheduleRowsWritten}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
