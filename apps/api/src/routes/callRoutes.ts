import { Router } from "express";
import { createRetellCallFromForm } from "../services/retellService";

const router = Router();

// Endpoint to trigger an outbound call from the form
router.post("/call", async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Missing or invalid phone number" });
    }

    const data = await createRetellCallFromForm(phone, name);
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error("Error in /call:", err?.response?.data || err.message);

    if (err.message && err.message.startsWith("Invalid phone number format")) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: "Failed to trigger call" });
  }
});

export default router;
