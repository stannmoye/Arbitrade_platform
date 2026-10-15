export function mysqlConnectionOptions(raw = process.env.DATABASE_URL || "") {
  if (!raw) throw new Error("DATABASE_URL is not configured");
  const url = new URL(raw);
  const sslParam = url.searchParams.get("ssl");
  let ssl: Record<string, unknown> | undefined;
  if (sslParam) {
    try {
      const parsed = JSON.parse(sslParam);
      ssl = parsed === true ? {} : parsed && typeof parsed === "object" ? parsed : undefined;
    } catch {
      ssl = undefined;
    }
  }
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl,
    timezone: "Z" as const,
  };
}
