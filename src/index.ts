import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());


const RETELL_FROM_NUMBER = process.env.RETELL_FROM_NUMBER!;
const RETELL_API_KEY = process.env.RETELL_API_KEY!;

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

    // Normalize phone into something close to E.164
    let toNumber = phone.trim();
    if (!toNumber.startsWith("+")) {
      // Assume North America if they forgot the +1
      if (/^\d{10}$/.test(toNumber)) {
        toNumber = "+1" + toNumber;
      }
    }

    const payload = {
      from_number: RETELL_FROM_NUMBER,
      to_number: toNumber,
      variables: {
        call_type: "outbound",
        greeting:
          "<speak>Hi there. <break time='400ms'/> This is the Rocket Science assistant calling from Rocket Science Designs. You requested a call from us - how can I help?</speak>"
      }
    };

    console.log("Creating Retell phone call with payload:", payload);

    const response = await axios.post(
      "https://api.retellai.com/v2/create-phone-call",
      payload,
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          "Content-Type": "application/json"
        }
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
