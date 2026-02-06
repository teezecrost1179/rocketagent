import axios from "axios";
import { RETELL_API_KEY } from "../config/env";
import { normalizePhone } from "../utils/phone";

/**
 * Outbound call triggered from the form (/call)
 */
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
  agentId?: string,
  historySummary?: string,
  dynamicVariables?: Record<string, string>
): Promise<{ chatId: string; fullReply: string; chatEnded?: boolean }> {
  let chat_id = chatId;
  const resolvedAgentId = agentId;

  // 1) Create chat if needed
  if (!chat_id) {
    if (!resolvedAgentId) {
      throw new Error("Missing Retell chat agent id");
    }

    const createChatResp = await axios.post(
      "https://api.retellai.com/create-chat",
      {
        agent_id: resolvedAgentId,
        ...(dynamicVariables
          ? { retell_llm_dynamic_variables: dynamicVariables }
          : historySummary
          ? { retell_llm_dynamic_variables: { history_summary: historySummary } }
          : {}),
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
  // Temporary: log full completion payload for debugging tool calls.
  console.log("[retell] chat completion payload", completionResp.data);

  let chatEnded = false;
  let endMessage: string | null = null;

  for (const msg of messages) {
    if (msg?.role === "tool_call_invocation" && (msg?.name === "end_call" || msg?.type === "end_call")) {
      chatEnded = true;
      if (typeof msg.arguments === "string") {
        try {
          const parsed = JSON.parse(msg.arguments);
          if (parsed?.execution_message) {
            endMessage = String(parsed.execution_message);
          }
        } catch {
          // Ignore parse errors; fall back to agent content.
        }
      }
    }
  }

  const lastAgent = [...messages].reverse().find((msg: any) => msg?.role === "agent" && typeof msg.content === "string");
  const fullReply =
    endMessage ||
    (lastAgent ? lastAgent.content : "(Sorry, I couldn't generate a response.)");

  return { chatId: chat_id!, fullReply, chatEnded: chatEnded || undefined };
}
