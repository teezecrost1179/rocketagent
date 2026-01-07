import { Router } from "express";
import { prisma } from "../lib/prisma"; // adjust path if needed

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
        offlineMessage: true,
      },
    });

    // Hide existence details and prevent cross-tenant “probing”
    if (!s || s.status !== "active" || s.widgetEnabled === false) {
      return res.status(404).json({});
    }

    // Return widget-safe fields only, matching your old JSON keys
    return res.json({
      title: s.widgetTitle ?? "",
      subtitle: s.widgetSubtitle ?? "",
      greeting: s.widgetGreeting ?? "",
      avatarUrl: s.widgetAvatarUrl ?? "",
      offlineMessage: s.offlineMessage ?? "",
    });
  } catch (err) {
    console.error("widget-config error:", err);
    return res.status(500).json({});
  }
});

export default router;
