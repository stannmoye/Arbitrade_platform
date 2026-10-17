import { access, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { safeDisplayText, safeFailureDetail } from "./recovery-utils.mjs";
import { planMigrationRecovery } from "./migration-recovery-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const progressPath = resolve(root, "installer/.install-in-progress.json");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const stageGuidance = {
  "preparing-dependencies": "Dependency installation may have failed or been interrupted. Inspect the private terminal output and disk space before deciding whether to retry dependency installation.",
  "main-database-migrations": "Check the Drizzle migration tracker and inspect the exact migration state before rerunning. Do not assume a failed command rolled back all changes.",
  "portal-database-migrations": "Inspect the portal migration tracker and compare the database schema with the migration files before rerunning.",
  "mining-database-migrations": "Inspect mining_schema_migrations and the actual mining schema before rerunning the mining migration.",
  "initial-reward-rate-migration": "Inspect the reward-rate migration's documented idempotency and the database state before rerunning.",
  "production-build": "The database migration steps may already be complete. Inspect build output and run the build again only after confirming the recorded migration stages are consistent.",
  "administrator-creation": "Check whether the administrator account already exists before retrying. Do not create a duplicate account or reset existing credentials as a recovery shortcut.",
  "finalizing-installation": "Check the install lock, bootstrap file, build artifact, database migration state, and private logs. Do not delete locks or rerun migrations until an administrator approves a recovery plan.",
};

console.log("Arbitrade installer recovery report (read-only)");
console.log("This report does not connect to or modify the database, clear markers, or rerun commands.");
console.log("It never reads or prints .env values or credentials.\n");

const [envPresent, lockPresent, bootstrapPresent, markerPresent] = await Promise.all([
  exists(resolve(root, ".env")),
  exists(resolve(root, "installer/.installed")),
  exists(resolve(root, ".installer-bootstrap.json")),
  exists(progressPath),
]);
console.log(`Environment file present: ${envPresent ? "yes" : "no"} (contents not read)`);
console.log(`Installation lock present: ${lockPresent ? "yes" : "no"}`);
console.log(`One-time bootstrap file present: ${bootstrapPresent ? "yes" : "no"}`);
console.log(`Interrupted-install marker present: ${markerPresent ? "yes" : "no"}`);

if (!markerPresent) {
  console.log("\nNo interrupted-install marker exists.");
  if (lockPresent) {
    console.log("The installer lock exists; do not rerun installation to repair unrelated runtime problems.");
  } else {
    console.log("No install lock exists. Confirm the actual database and application state before starting or restarting an installation.");
  }
  process.exit(0);
}

let marker;
try {
  marker = JSON.parse(await readFile(progressPath, "utf8"));
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    throw new Error("Invalid progress marker structure");
  }
} catch {
  console.error("\nERROR: The progress marker is unreadable or invalid JSON.");
  console.error("Preserve it, restrict file access, inspect private logs and database state, and involve an administrator. Do not delete it just to bypass the installer guard.");
  process.exitCode = 1;
}

if (marker && typeof marker === "object" && !Array.isArray(marker)) {
  console.log("\nRecorded progress:");
  console.log(`Mode: ${safeDisplayText(marker.mode)}`);
  console.log(`Status: ${safeDisplayText(marker.status, "legacy marker; status not recorded")}`);
  console.log(`Stage: ${safeDisplayText(marker.stage)}`);
  console.log(`Started: ${safeDisplayText(marker.startedAt)}`);
  console.log(`Stage started: ${safeDisplayText(marker.stageStartedAt)}`);
  console.log(`Last updated: ${safeDisplayText(marker.updatedAt)}`);
  if (marker.failedAt) console.log(`Failure recorded at: ${safeDisplayText(marker.failedAt)}`);
  if (marker.failure && typeof marker.failure === "object" && !Array.isArray(marker.failure)) {
    console.log(`Failed command: ${safeDisplayText(marker.failure.command)}`);
    console.log(`Failure detail: ${safeFailureDetail(marker.failure.detail)}`);
  }
  console.log("\nStage-specific guidance:");
  console.log(stageGuidance[marker.stage] || "Inspect private terminal output, database migration tracking, application artifacts, and backup state to determine what completed.");
}

console.log("\nRequired safe recovery sequence:");
console.log("1. Stop repeated installer runs; keep this marker and all private logs.");
console.log("2. Verify that a current database backup exists and can be restored.");
console.log("3. Inspect the actual database migration trackers and schema; a failed command does not guarantee rollback.");
console.log("4. Decide the recovery action with an administrator and document it before removing the marker.");
console.log("5. Only after the database/application state is understood, follow the repository recovery procedure and rerun the verifier.");
console.log("Never run fresh-install mode against a database containing existing data. This report does not authorize marker removal.");
