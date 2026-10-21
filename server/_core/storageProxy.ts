import type { Express } from "express";
import { ENV } from "./env";
import { getTicketAttachmentAccess, getUserById } from "../db";
import { getLocalSessionFromRequest } from "./localAuth";
import { sdk } from "./sdk";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Support attachments may contain sensitive customer evidence. Authorize
    // the request against the persisted attachment row and ticket owner before
    // requesting a signed storage URL.
    if (key === "support" || key.startsWith("support/")) {
      const session = getLocalSessionFromRequest(req);
      try {
        let user = session ? await getUserById(session.userId) : null;
        if (session && (!user || Number(user.authVersion || 0) !== session.authVersion)) {
          res.status(401).send("Authentication required");
          return;
        }
        if (!user) {
          try { user = await sdk.authenticateRequest(req); } catch { user = null; }
        }
        if (!user) {
          res.status(401).send("Authentication required");
          return;
        }
        const attachment = await getTicketAttachmentAccess(key);
        if (!attachment || (user.role !== "admin" && attachment.customerId !== Number(user.id))) {
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
