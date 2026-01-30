import { Router } from "express";
import { prisma } from "../lib/prisma"; // adjust path if needed

function extractHost(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedDomain(allowedDomains: string[] | null | undefined, host: string) {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  return allowedDomains.map((d) => d.toLowerCase()).includes(host);
}

const DEFAULT_WIDGET_PRIMARY = "#081d49";
const DEFAULT_WIDGET_SECONDARY = "#c6c6c6";

const router = Router();

router.get("/widget-config", async (req, res) => {
  try {
    const subscriber = ((req.query.subscriber as string) || "").toLowerCase().trim();

    if (!subscriber) {
      return res.status(400).json({ error: "subscriber query param is required" });
    }

    const s = await prisma.subscriber.findUnique({
      where: { slug: subscriber },
      select: {
        status: true,
        widgetEnabled: true,
        widgetTitle: true,
        widgetSubtitle: true,
        widgetGreeting: true,
        widgetAvatarUrl: true,
        widgetPrimaryColorHex: true,
        widgetSecondaryColorHex: true,
        offlineMessage: true,
        allowedDomains: true,
      },
    });

    // Hide existence details and prevent cross-tenant “probing”
    if (!s || s.status !== "active" || s.widgetEnabled === false) {
      return res.status(404).json({});
    }

    // Domain allowlist: use Origin or Referer, log and allow if missing.
    const originHost = extractHost(req.headers.origin as string | undefined);
    const refererHost = extractHost(req.headers.referer as string | undefined);
    const host = originHost || refererHost;
    if (!host) {
      console.warn("[widget-config] Missing Origin/Referer", { subscriber });
    } else if (!isAllowedDomain(s.allowedDomains, host)) {
      console.warn("[widget-config] Origin not allowed", { subscriber, host });
      return res.status(404).json({});
    }

    // Return widget-safe fields only, matching your old JSON keys
    return res.json({
      title: s.widgetTitle ?? "",
      subtitle: s.widgetSubtitle ?? "",
      greeting: s.widgetGreeting ?? "",
      avatarUrl: s.widgetAvatarUrl ?? "",
      widgetPrimaryColorHex: s.widgetPrimaryColorHex ?? DEFAULT_WIDGET_PRIMARY,
      widgetSecondaryColorHex: s.widgetSecondaryColorHex ?? DEFAULT_WIDGET_SECONDARY,
      offlineMessage: s.offlineMessage ?? "",
    });
  } catch (err) {
    console.error("widget-config error:", err);
    return res.status(500).json({});
  }
});

export default router;
