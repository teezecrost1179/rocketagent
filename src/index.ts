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
const RETELL_CHAT_AGENT_ID = process.env.RETELL_CHAT_AGENT_ID!;


// Normalize to something close to E.164 for North America
function normalizePhone(raw: string): string {
  if (!raw) return raw;
  let digits = raw.trim();

  // Strip non-digits except leading +
  digits = digits.replace(/(?!^\+)\D/g, "");

  if (!digits.startsWith("+")) {
    // Assume North America if 10 digits
    if (/^\d{10}$/.test(digits)) {
      return "+1" + digits;
    }
  }
  return digits;
}

async function triggerRetellCall(toNumberRaw: string) {
  const to_number = normalizePhone(toNumberRaw);

  const payload = {
    from_number: RETELL_FROM_NUMBER,
    to_number,
    // If you later add RETELL_AGENT_ID, you can include it here:
    // ...(RETELL_AGENT_ID ? { agent_id: RETELL_AGENT_ID } : {}),
    variables: {
      call_type: "outbound",
      greeting:
        "Hi - this is Rocket, the AI receptionist from Rocket Science Designs. " +
        "You requested a call from us through the website. - Is now a good time to chat?"
    }
  };

  console.log("Triggering Retell call from chat with payload:", payload);

  await axios.post("https://api.retellai.com/v2/create-phone-call", payload, {
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json"
    }
  });
}




// Basic test route
app.get("/", (_req, res) => {
  res.send("Rocket Science AI receptionist API is running 🚀");
});

// Endpoint to trigger an outbound call
// Endpoint to trigger an outbound call
app.post("/call", async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Missing or invalid phone number" });
    }

    // Use the shared normalizer
    const toNumber = normalizePhone(phone);

    // Basic validation: must be E.164-ish, e.g. +12045551234
    if (!toNumber.startsWith("+") || !/^\+\d{11,15}$/.test(toNumber)) {
      console.warn("Invalid phone format after normalization:", phone, "→", toNumber);
      return res
        .status(400)
        .json({ error: "Invalid phone number format. Please include area code." });
    }

    // Use Retell’s dash-style pauses instead of SSML
    const greeting = name
      ? `Hi - this is Rocket, the AI receptionist from Rocket Science Designs. - Is this ${name}?`
      : `Hi - this is Rocket, the AI receptionist from Rocket Science Designs. - You requested a call from us through the website. - Is now a good time to chat?`;

    const payload: any = {
      from_number: RETELL_FROM_NUMBER,
      to_number: toNumber,
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


// Simple Rocket Agent web chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message, chatId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'message' field" });
    }

    let chat_id = chatId as string | undefined;

    // 1) Create chat if needed
    if (!chat_id) {
      const createChatResp = await axios.post(
        "https://api.retellai.com/create-chat",
        {
          agent_id: RETELL_CHAT_AGENT_ID
        },
        {
          headers: {
            Authorization: `Bearer ${RETELL_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      chat_id = createChatResp.data.chat_id;
      console.log("Created new Retell chat:", chat_id);
    }

    // 2) Ask Retell for a completion in this chat
    const completionResp = await axios.post(
      "https://api.retellai.com/create-chat-completion",
      {
        chat_id,
        content: message
      },
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const messages = completionResp.data.messages || [];
    const last = messages[messages.length - 1];

    let fullReply =
      last && typeof last.content === "string"
        ? last.content
        : "(Sorry, I couldn't generate a response.)";

    // 3) Look for CALL_REQUEST marker in the reply
    let phoneForCall: string | null = null;

    const lines = fullReply.split(/\r?\n/);
    const cleanedLines: string[] = [];

    for (const line of lines) {
      const match = line.match(/^CALL_REQUEST:\s*(.+)$/i);
      if (match) {
        phoneForCall = match[1].trim();
      } else {
        cleanedLines.push(line);
      }
    }

    const reply = cleanedLines.join("\n").trim();

    // 4) If there was a CALL_REQUEST, trigger the outbound call in the background
    if (phoneForCall) {
      console.log("CALL_REQUEST detected from chat. Number:", phoneForCall);
      triggerRetellCall(phoneForCall).catch((err) => {
        console.error("Failed to trigger Retell call from chat:", err?.response?.data || err.message);
      });
    }

    return res.json({
      chatId: chat_id,
      reply
    });
  } catch (err: any) {
    console.error(
      "Error in /chat:",
      err?.response?.status,
      err?.response?.statusText,
      err?.response?.data || err.message
    );
    return res.status(500).json({ error: "Failed to get chat response" });
  }
});



// Render uses PORT env var
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI receptionist listening on port ${PORT}`);
});
