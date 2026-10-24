import type { Express } from "express";
import { getTicketAttachmentAccess, getUserById } from "../db";
import { readStorageObject } from "../storage";
import { getLocalSessionFromRequest } from "./localAuth";

export function registerStorageProxy(app: Express) {
  app.get("/storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key || key.includes("\\\\") || key.split("/").some((part) => part === "." || part === "..")) {
      res.status(404).send("File not found");
      return;
    }

    // Generated images are public assets; customer evidence is owner/admin-only.
    // Unknown private namespaces are denied rather than exposed by guessable keys.
    if (!key.startsWith("generated/")) {
      const session = getLocalSessionFromRequest(req);
      if (!session) {
        res.status(401).send("Authentication required");
        return;
      }
      try {
        const user = await getUserById(session.userId);
        if (!user || Number(user.authVersion ?? 0) !== Number(session.authVersion ?? 0) || user.loginMethod === "closed") {
          res.status(401).send("Authentication required");
          return;
        }
        if (!key.startsWith("support/")) {
          res.status(404).send("File not found");
          return;
        }
        const attachment = await getTicketAttachmentAccess(key);
        if (!attachment || (user.role !== "admin" && Number(attachment.customerId) !== Number(user.id))) {
          res.status(404).send("File not found");
          return;
        }
      } catch (error) {
        console.error("[LocalStorage] Attachment authorization failed:", error instanceof Error ? error.name : "UnknownError");
        res.status(500).send("Unable to authorize file");
        return;
      }
    }

    try {
      const stored = await readStorageObject(key);
      res.set("Cache-Control", key.startsWith("generated/") ? "public, max-age=3600" : "no-store, private");
      res.set("X-Content-Type-Options", "nosniff");
      res.type(stored.contentType);
      return res.send(stored.buffer);
    } catch (error) {
      const code = error && typeof error === "object" ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "ENOENT") console.error("[LocalStorage] File read failed:", error instanceof Error ? error.name : "UnknownError");
      return res.status(404).send("File not found");
    }
  });
}
