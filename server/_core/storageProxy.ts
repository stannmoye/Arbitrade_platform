import type { Express } from "express";
import { ENV } from "./env";
import { getTicketAttachmentAccess, getUserById } from "../db";
import { getLocalSessionFromRequest } from "./localAuth";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Support attachments contain customer evidence and must never be served
    // by the otherwise-public generated-media proxy without ownership checks.
    if (key === "support" || key.startsWith("support/")) {
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
        if (!attachment || (user.role !== "admin" && attachment.customerId !== session.userId)) {
          // Use the same response for unknown and foreign keys to avoid
          // disclosing whether another customer's attachment exists.
          res.status(404).send("Attachment not found");
          return;
        }
      } catch (err) {
        console.error("[StorageProxy] support attachment authorization failed:", err);
        res.status(500).send("Unable to authorize attachment");
        return;
      }
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
