import mysql from "mysql2/promise";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is required");
const url = new URL(rawUrl);
url.searchParams.set("multipleStatements", "true");
url.searchParams.set("timezone", "Z");
const db = await mysql.createConnection(url.toString());
const terms = "This package provides a simulated package-based Mining entitlement only. Its configured expected CoinKi (CKI) reward is an estimate prorated by eligible contract time; it is not physical mining, verified pool output, or a guaranteed return. Simulated CKI is not withdrawable and there is no cash payout. No live mining hardware, external pool, investment return, custody, or market valuation is promised.";
const packages = [
  ["CKI_PULSE", "CKI Pulse", 6, "3500.00", "60", "6.000000000000000000"],
  ["CKI_VECTOR", "CKI Vector", 7, "5000.00", "90", "9.500000000000000000"],
  ["CKI_ORBIT", "CKI Orbit", 8, "7000.00", "125", "13.500000000000000000"],
  ["CKI_NEXUS", "CKI Nexus", 9, "9500.00", "175", "18.500000000000000000"],
  ["CKI_APEX", "CKI Apex", 10, "13000.00", "240", "25.000000000000000000"],
  ["CKI_SOVEREIGN", "CKI Sovereign", 11, "17000.00", "320", "33.500000000000000000"],
  ["CKI_HORIZON", "CKI Horizon", 12, "24000.00", "450", "45.500000000000000000"],
];
const [admins] = await db.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
const adminId = Number(admins[0]?.id || 1);
const now = new Date();
const created = [];
try {
  await db.beginTransaction();
  for (const [code, name, order, price, ths, daily] of packages) {
    const [existing] = await db.execute("SELECT id,currentVersionId FROM mining_packages WHERE code=? LIMIT 1 FOR UPDATE", [code]);
    if (existing[0]) { created.push({ code, created: false, packageId: Number(existing[0].id), versionId: Number(existing[0].currentVersionId || 0) }); continue; }
    const [p] = await db.execute("INSERT INTO mining_packages (code,name,displayOrder,status,createdBy) VALUES (?,?,?,'published',?)", [code, name, order, adminId]);
    const packageId = Number(p.insertId);
    const [v] = await db.execute(`INSERT INTO mining_package_versions
      (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,boostDurationSeconds,maxPerCustomer,stackingPolicy,expirySeconds,durationMonths,expectedDailyRewardCki,termsText,simulationAcknowledgementRequired,effectiveAt,createdBy)
      VALUES (?,1,?,'published',?,'USD',?,'0',120,1,'replace',NULL,24,?,?,1,?,?)`,
      [packageId, name, price, ths, daily, terms, now, adminId]);
    const versionId = Number(v.insertId);
    await db.execute("UPDATE mining_packages SET currentVersionId=?,updatedAt=? WHERE id=?", [versionId, now, packageId]);
    created.push({ code, created: true, packageId, versionId });
  }
  await db.commit();
  console.log(JSON.stringify({ status: "ok", packages: created }));
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
