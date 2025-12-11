import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const RETELL_FROM_NUMBER = process.env.RETELL_FROM_NUMBER!;
const RETELL_API_KEY = process.env.RETELL_API_KEY!;
// Optional but nice to have if you’re not binding the agent to the number:
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

// Basic test route
app.get("/", (_req, res) => {
  res.send("Rocket Science AI receptionist API is running 🚀");
});

// Endpoint to trigger an outbound call
app.post("/call", async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Missing or invalid phone number" });
    }

    // Normalize phone into something like E.164
    let toNumber = phone.trim();
    if (!toNumber.startsWith("+")) {
      // Assume North America if they forgot the +1
      if (/^\d{10}$/.test(toNumber)) {
        toNumber = "+1" + toNumber;
      }
    }

    // Use Retell’s dash-style pauses instead of SSML
    const greeting = name
      ? `Hi - this is Rocket, the AI receptionist from Rocket Science Designs. - Is this ${name}?`
      : `Hi - this is Rocket, the AI receptionist from Rocket Science Designs. - You requested a call from us through the website. - Is now a good time to chat?`;

    const payload: any = {
      from_number: RETELL_FROM_NUMBER,
      to_number: toNumber,
      // agent_id is optional if your Retell number is already bound to the agent;
      // include it if you have it in env.
      ...(RETELL_AGENT_ID ? { agent_id: RETELL_AGENT_ID } : {}),
      retell_llm_dynamic_variables: {
        call_type: "outbound",
        greeting, // must be a string
      },
    };

    console.log("Creating Retell phone call with payload:", payload);

    const response = await axios.post(
      "https://api.retellai.com/v2/create-phone-call",
      payload,
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ success: true, data: response.data });
  } catch (err: any) {
    console.error(
      "Error triggering Retell call:",
      err?.response?.status,
      err?.response?.statusText,
      err?.response?.data || err.message
    );
    return res.status(500).json({ error: "Failed to trigger call" });
  }
});

// Render uses PORT env var
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI receptionist listening on port ${PORT}`);
});
