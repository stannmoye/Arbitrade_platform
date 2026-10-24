function splitTopLevelComma(input) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === "\\" && quote !== String.fromCharCode(96)) { i++; continue; }
      if (ch === quote) {
        if (input[i + 1] === quote && quote !== String.fromCharCode(96)) { i++; continue; }
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === String.fromCharCode(96)) { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(input.slice(start).trim());
  return parts.filter(Boolean);
}

function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (ch === "\\" && quote !== String.fromCharCode(96)) { i++; continue; }
      if (ch === quote) {
        if (next === quote && quote !== String.fromCharCode(96)) { i++; continue; }
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === String.fromCharCode(96)) { quote = ch; continue; }
    if (ch === "-" && next === "-") { lineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i++; continue; }
    if (ch === ";") {
      statements.push(sql.slice(start, i));
      start = i + 1;
    }
  }
  statements.push(sql.slice(start));
  return statements;
}

function stripLeadingComments(input) {
  return input.replace(/^(?:\s*(?:--[^\r\n]*|\/\*[\s\S]*?\*\/)\s*)+/, "").trim();
}

const unquoteIdentifier = value => value.replace(new RegExp(String.fromCharCode(96), "g"), "");

function safeStatementLabel(statement) {
  const compact = stripLeadingComments(statement).replace(/\\s+/g, " ").trim();
  const patterns = [
    [/^ALTER\\s+TABLE\\s+(`?[\w$]+`?)/i, "ALTER TABLE"],
    [/^CREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+`?[\w$]+`?\\s+ON\\s+(`?[\w$]+`?)/i, "CREATE INDEX ON"],
    [/^CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(`?[\w$]+`?)/i, "CREATE TABLE"],
    [/^INSERT\\s+INTO\\s+(`?[\w$]+`?)/i, "INSERT INTO"],
    [/^UPDATE\\s+(`?[\w$]+`?)/i, "UPDATE"],
    [/^DELETE\\s+FROM\\s+(`?[\w$]+`?)/i, "DELETE FROM"],
    [/^REPLACE\\s+INTO\\s+(`?[\w$]+`?)/i, "REPLACE INTO"],
  ];
  for (const [pattern, verb] of patterns) {
    const match = compact.match(pattern);
    if (match) return verb + " " + unquoteIdentifier(match[1]);
  }
  const verb = compact.match(/^([A-Z]+)/i)?.[1]?.toUpperCase();
  return verb ? verb + " statement" : "SQL statement";
}

export async function executeCompatibleMigrationSql(connection, sql, options = {}) {
  // Historical migrations are trusted repository SQL. This adapter implements
  // the idempotent MariaDB syntax in a way that also works on MySQL 8.0.
  // The callback is intentionally given only a safe statement label, never SQL
  // text or literal values, so callers can report a failure location without
  // exposing data or connection settings.
  let statementIndex = 0;
  for (const raw of splitStatements(sql)) {
    const statement = stripLeadingComments(raw);
    if (!statement) continue;
    statementIndex += 1;
    options.onStatement?.({ index: statementIndex, label: safeStatementLabel(statement) });

    const alter = statement.match(/^ALTER\s+TABLE\s+(\S+)\s+([\s\S]+)$/i);
    if (alter) {
      const tableName = unquoteIdentifier(alter[1]);
      const clauses = splitTopLevelComma(alter[2]);
      const compatibleClauses = [];
      for (const clause of clauses) {
        const addition = clause.trim().match(/^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\S+)([\s\S]*)$/i);
        if (!addition) {
          compatibleClauses.push(clause);
          continue;
        }
        const columnName = unquoteIdentifier(addition[1]);
        const [existing] = await connection.execute(
          "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1",
          [tableName, columnName],
        );
        if (existing.length) {
          console.log("Skipping existing column " + tableName + "." + columnName);
        } else {
          compatibleClauses.push("ADD COLUMN " + addition[1] + addition[2]);
        }
      }
      if (compatibleClauses.length) {
        await connection.query("ALTER TABLE " + alter[1] + " " + compatibleClauses.join(", "));
      }
      continue;
    }

    const createIndex = statement.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(\S+)\s+ON\s+(\S+)([\s\S]*)$/i);
    if (createIndex) {
      const indexName = unquoteIdentifier(createIndex[2]);
      const tableName = unquoteIdentifier(createIndex[3]);
      const [existing] = await connection.execute(
        "SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1",
        [tableName, indexName],
      );
      if (existing.length) {
        console.log("Skipping existing index " + tableName + "." + indexName);
      } else {
        await connection.query(
          "CREATE " + (createIndex[1] || "") + "INDEX " + createIndex[2] + " ON " + createIndex[3] + createIndex[4],
        );
      }
      continue;
    }

    await connection.query(statement);
  }
}
