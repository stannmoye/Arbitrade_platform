import type { Express } from "express";
import { basename } from "node:path";
import { getTicketAttachmentAccess, getUserById } from "../db";
import { isValidSupportAttachmentStorageKey } from "./attachmentPolicy";
import { getLocalSessionFromRequest } from "./localAuth";
import { getLocalStoragePath } from "../local-storage";

export function registerStorageProxy(app: Express) {
  app.get("/api/support/attachments/file", async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!isValidSupportAttachmentStorageKey(key)) {
      res.status(404).send("Attachment not found");
      return;
    }

    const session = getLocalSessionFromRequest(req);
    if (!session) {
      res.status(401).send("Authentication required");
      return;
    }

    try {
      const user = await getUserById(session.userId);
      if (!user || Number(user.authVersion || 0) !== session.authVersion) {
        res.status(401).send("Authentication required");
        return;
      }

      const attachment = await getTicketAttachmentAccess(key);
      if (!attachment || (user.role !== "admin" && attachment.customerId !== Number(user.id))) {
        res.status(404).send("Attachment not found");
        return;
      }

      const filePath = getLocalStoragePath(key);
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.download(filePath, basename(filePath), (error) => {
        if (error && !res.headersSent) res.status(404).send("Attachment not found");
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";
      if (code === "ENOENT") {
        res.status(404).send("Attachment not found");
        return;
      }
      console.error("[LocalStorage] Failed to authorize or serve support attachment:", error instanceof Error ? error.name : "UnknownError");
      if (!res.headersSent) res.status(500).send("Unable to retrieve attachment");
    }
  });
}
