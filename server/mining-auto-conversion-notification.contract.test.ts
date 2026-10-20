import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./mining.ts", import.meta.url), "utf8");
const start = source.indexOf("async function processMiningConversionJob(");
const end = source.indexOf("async function settleDuePendingBoostRewards(", start);
const job = source.slice(start, end);

describe("automatic mining conversion notification transaction boundary", () => {
  it("commits conversion and job status before attempting the success notice", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const commit = job.indexOf("await conn.commit();");
    const notice = job.indexOf('createNotification(userId,"Automatic Mining conversion completed"');
    expect(commit).toBeGreaterThan(0);
    expect(notice).toBeGreaterThan(commit);
    expect(job.slice(0, commit)).not.toContain("createMiningNotification(conn,userId,\"Automatic Mining conversion completed\"");
  });

  it("keeps notice failure from entering the conversion retry/rollback path", () => {
    const commit = job.indexOf("await conn.commit();");
    const notice = job.indexOf('createNotification(userId,"Automatic Mining conversion completed"');
    const noticeBlock = job.slice(commit, job.indexOf('return "completed";', notice));
    expect(noticeBlock).toContain("try {");
    expect(noticeBlock).toContain("catch (notificationError)");
    expect(noticeBlock).toContain('console.error("[Notifications] Automatic mining conversion notice failed after commit:"');
  });
});
