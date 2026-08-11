#!/usr/bin/env node

const { DatabaseSync } = require("node:sqlite");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const [databasePath, outputPath] = process.argv.slice(2);
if (!databasePath || !outputPath) {
  console.error("Usage: node export-desktop-state.cjs <job-tracker.db> <backup.json>");
  process.exit(1);
}

const database = new DatabaseSync(resolve(databasePath), { readOnly: true });
const row = database.prepare("SELECT version, payload, updated_at AS updatedAt FROM app_state WHERE id = 1").get();
database.close();
if (!row) throw new Error("No app_state record found");

const data = JSON.parse(row.payload);
const backup = {
  version: row.version,
  data,
  exportedAt: new Date().toISOString(),
  sourceUpdatedAt: row.updatedAt,
};
writeFileSync(resolve(outputPath), JSON.stringify(backup, null, 2), "utf8");
const verified = JSON.parse(readFileSync(resolve(outputPath), "utf8"));
console.log(JSON.stringify({
  output: resolve(outputPath),
  jobs: verified.data.jobs?.length || 0,
  statuses: verified.data.statuses?.length || 0,
  comparisons: verified.data.comparisons?.length || 0,
}, null, 2));
