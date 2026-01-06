import { Router } from "express";
import {
  getRetellChatCompletion,
  createRetellCallFromChat,
} from "../services/retellService";

const router = Router();

// Simple Rocket Agent web chat endpoint
router.post("/chat", async (req, res) => {
  try {
    const { message, chatId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'message' field" });
    }

    // 1) Get completion from Retell
    const { chatId: newChatId, fullReply } = await getRetellChatCompletion(
      message,
      chatId
    );

    // 2) Look for CALL_REQUEST marker in the reply
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

    // 3) If there was a CALL_REQUEST, trigger the outbound call in the background
    if (phoneForCall) {
      console.log("CALL_REQUEST detected from chat. Number:", phoneForCall);
      createRetellCallFromChat(phoneForCall).catch((err) => {
        console.error(
          "Failed to trigger Retell call from chat:",
          err?.response?.data || err.message
        );
      });
    }

    return res.json({
      chatId: newChatId,
      reply,
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

export default router;
