import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import fs from "fs";

async function run() {
  try {
    const query = fs.readFileSync("../../generate_missing.sql", "utf8");
    await db.execute(sql.raw(query));
    console.log("Successfully ran the SQL script.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
