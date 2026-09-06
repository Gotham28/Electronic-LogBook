// Maintainer helper: deterministic bootstrap / upgrade SQL for this feature's schema.
// Run from the repository root. Generated files are subsequently reviewed and tested.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

const root = resolve(import.meta.dirname, "../../..");
const schemaDir = resolve(root, "lib/db/src/schema");
const temp = resolve(root, "lib/db/tmp");
await mkdir(temp, { recursive: true });
const before = "f153705"; // Immutable schema baseline before this feature (not a deployment branch).
for (const variant of ["baseline", "current"]) {
  await build({
    entryPoints: [resolve(schemaDir, "index.ts")],
    outfile: resolve(temp, variant + ".mjs"),
    bundle: true, platform: "node", format: "esm", packages: "external",
    plugins: variant === "baseline" ? [{
      name: "baseline-schema",
      setup(api) {
        api.onLoad({ filter: /schema[\\/].*\.ts$/ }, (args) => ({
          contents: execFileSync("git", ["show", before + ":" + relative(root, args.path).replaceAll("\\", "/")], { cwd: root, encoding: "utf8" }),
          loader: "ts",
        }));
      },
    }] : [],
  });
}
const baseline = generateDrizzleJson(await import(pathToFileURL(resolve(temp, "baseline.mjs")).href));
const current = generateDrizzleJson(await import(pathToFileURL(resolve(temp, "current.mjs")).href));
const empty = generateDrizzleJson({});
const migrations = resolve(root, "lib/db/migrations");
await mkdir(migrations, { recursive: true });
await writeFile(resolve(migrations, "0001_baseline.sql"), (await generateMigration(empty, baseline)).join("\n") + "\n");
await writeFile(resolve(temp, "feature-generated.sql"), (await generateMigration(baseline, current)).join("\n") + "\n");
await writeFile(resolve(temp, "current-schema.sql"), (await generateMigration(empty, current)).join("\n") + "\n");
console.log("Generated baseline and candidate SQL in lib/db. Review the candidate before using it.");
