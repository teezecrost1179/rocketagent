import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const RETELL_API_KEY = process.env.RETELL_API_KEY!;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID!;

// Basic test route
app.get("/", (_req, res) => {
  res.send("Rocket Science AI receptionist API is running 🚀");
});

// Endpoint to trigger an outbound call
app.post("/call", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Missing or invalid phone number" });
    }

    // TODO: replace with Retell's real outbound-call API
    const response = await axios.post(
      "https://api.retell.ai/v1/outbound-call",
      {
        agent_id: RETELL_AGENT_ID,
        to: phone
      },
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err: any) {
    console.error("Error triggering call:", err?.response?.data || err.message);
    res.status(500).json({ error: "Failed to trigger call" });
  }
});

// Render uses PORT env var
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI receptionist listening on port ${PORT}`);
});
