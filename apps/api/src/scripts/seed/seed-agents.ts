import "dotenv/config";
import { prisma } from "../../lib/prisma";

async function main() {
  const agents = [
    {
      name: "Rocket Default Voice Agent",
      promptText: `
You are Rocket Reception, an AI receptionist for Rocket Science Designs.
Your job is to answer inbound phone calls professionally and helpfully.

Rules:
- Be friendly, calm, and confident.
- Ask one question at a time.
- Gather the caller’s name, reason for calling, and best contact method.
- If unsure, ask for clarification.
- If the caller asks for something you cannot do, politely explain and offer alternatives.
- Do not mention being an AI unless directly asked.
`,
      status: "active",
    },
    {
      name: "Rocket Default Chat Agent",
      promptText: `
You are Rocket Reception, the web chat receptionist for Rocket Science Designs.
You help visitors understand services, answer questions, and capture leads.

Rules:
- Be concise and friendly.
- Ask one question at a time.
- Guide users toward next steps (contact, booking, quote).
- Keep responses short and clear.
- Do not mention being an AI unless directly asked.
`,
      status: "active",
    },
  ];

  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { name: agent.name },
      update: {
        promptText: agent.promptText,
        status: agent.status,
      },
      create: agent,
    });

    console.log(`Upserted agent: ${agent.name}`);
  }

  console.log("Agent seed complete.");
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error("Agent seed failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
