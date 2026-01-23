import axios from "axios";
import {
  RETELL_API_KEY,
  RETELL_FROM_NUMBER,
  RETELL_AGENT_ID,
  RETELL_CHAT_AGENT_ID,
} from "../config/env";
import { normalizePhone } from "../utils/phone";

/**
 * Outbound call triggered from the form (/call)
 */
export async function createRetellCallFromForm(phone: string, name?: string) {
  const toNumber = normalizePhone(phone);

  // Basic validation: must be E.164-ish, e.g. +12045551234
  if (!toNumber.startsWith("+") || !/^\+\d{11,15}$/.test(toNumber)) {
    throw new Error(`Invalid phone number format after normalization: ${toNumber}`);
  }

  return createRetellOutboundCall({
    fromNumber: RETELL_FROM_NUMBER,
    toNumber,
    agentId: RETELL_AGENT_ID || undefined,
    dynamicVariables: {
      call_type: "outbound",
    },
  });
}

/**
 * Outbound call triggered from chat when CALL_REQUEST is detected
 */
export async function createRetellCallFromChat(phone: string) {
  const toNumber = normalizePhone(phone);

  await createRetellOutboundCall({
    fromNumber: RETELL_FROM_NUMBER,
    toNumber,
    agentId: RETELL_AGENT_ID || undefined,
    dynamicVariables: {
      call_type: "outbound",
    },
  });
}

export async function createRetellOutboundCall({
  fromNumber,
  toNumber,
  agentId,
  dynamicVariables,
}: {
  fromNumber: string;
  toNumber: string;
  agentId?: string;
  dynamicVariables?: Record<string, string>;
}) {
  const payload: any = {
    from_number: fromNumber,
    to_number: toNumber,
    ...(agentId ? { agent_id: agentId } : {}),
    retell_llm_dynamic_variables: dynamicVariables || {},
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

  return response.data;
}

/**
 * Get a chat completion from Retell (creates a chat if needed)
 */
export async function getRetellChatCompletion(
  message: string,
  chatId?: string,
  agentId?: string
): Promise<{ chatId: string; fullReply: string }> {
  let chat_id = chatId;
  const resolvedAgentId = agentId || RETELL_CHAT_AGENT_ID;

  // 1) Create chat if needed
  if (!chat_id) {
    if (!resolvedAgentId) {
      throw new Error("Missing Retell chat agent id");
    }

    const createChatResp = await axios.post(
      "https://api.retellai.com/create-chat",
      {
        agent_id: resolvedAgentId,
      },
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          "Content-Type": "application/json",
        },
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
      content: message,
    },
    {
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const messages = completionResp.data.messages || [];
  const last = messages[messages.length - 1];

  const fullReply =
    last && typeof last.content === "string"
      ? last.content
      : "(Sorry, I couldn't generate a response.)";

  return { chatId: chat_id!, fullReply };
}
