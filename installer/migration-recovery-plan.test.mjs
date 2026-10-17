import { describe, expect, it } from "vitest";
import { planMigrationRecovery } from "./migration-recovery-plan.mjs";

describe("planMigrationRecovery", () => {
  it("requires a verified restorable backup before any recovery decision", () => {
    expect(planMigrationRecovery({
      stage: "main-database-migrations",
      trackerStatus: "not_started",
      schemaVerified: true,
    }).decision).toBe("backup_required");
  });

  it("does not retry when migration evidence is unknown", () => {
    const plan = planMigrationRecovery({
      stage: "main-database-migrations",
      trackerStatus: "unknown",
      backupVerified: true,
    });
    expect(plan.decision).toBe("inspect_migration_state");
    expect(plan.retryAllowed).toBe(false);
  });

  it("requires manual repair for a partially applied migration", () => {
    const plan = planMigrationRecovery({
      stage: "portal-database-migrations",
      trackerStatus: "partial",
      backupVerified: true,
      schemaVerified: true,
    });
    expect(plan.decision).toBe("manual_repair_required");
    expect(plan.retryAllowed).toBe(false);
  });

  it("requires schema verification even when the tracker says complete", () => {
    expect(planMigrationRecovery({
      stage: "mining-database-migrations",
      trackerStatus: "complete",
      backupVerified: true,
    }).decision).toBe("verify_schema_before_resume");
  });

  it("does not rerun migrations whose tracker and schema were verified complete", () => {
    const plan = planMigrationRecovery({
      stage: "main-database-migrations",
      trackerStatus: "complete",
      backupVerified: true,
      schemaVerified: true,
    });
    expect(plan.decision).toBe("migrations_verified");
    expect(plan.retryAllowed).toBe(false);
    expect(plan.nextStep).toContain("Do not rerun completed migrations");
  });

  it("only labels a verified non-started migration as a reviewed retry candidate", () => {
    const plan = planMigrationRecovery({
      stage: "initial-reward-rate-migration",
      trackerStatus: "not_started",
      backupVerified: true,
      schemaVerified: true,
    });
    expect(plan.decision).toBe("reviewed_retry_candidate");
    expect(plan.retryAllowed).toBe(false);
    expect(plan.nextStep).toContain("administrator may approve");
  });

  it("requires inspection before retrying a non-migration stage", () => {
    expect(planMigrationRecovery({
      stage: "production-build",
      backupVerified: true,
    }).decision).toBe("inspect_stage_before_retry");
  });

  it("fails conservatively for a missing stage or invalid tracker state", () => {
    expect(planMigrationRecovery({ backupVerified: true }).decision).toBe("manual_review_required");
    expect(planMigrationRecovery({
      stage: "main-database-migrations",
      trackerStatus: "looks-good",
      backupVerified: true,
    }).decision).toBe("manual_review_required");
  });
});
