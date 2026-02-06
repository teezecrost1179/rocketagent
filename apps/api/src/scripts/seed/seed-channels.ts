import "dotenv/config";
import { prisma } from "../../lib/prisma";

async function main() {
  const DEMO_NUMBER = "+14316005505";
  const RSD_NUMBER = "+12048082733";
  const GATEKEEPER_INBOUND_AGENT_ID = "agent_7ace7a26b3a6e5a2d9f3cea066";
  const GATEKEEPER_OUTBOUND_AGENT_ID = "agent_81717625726392f58730b83fd7";
  const RSD_INBOUND_AGENT_ID = "agent_59a0cc2b7135463c3acc7cadd5";
  const RSD_OUTBOUND_AGENT_ID = "agent_957038f7f980c276a6af3ec3b6";
  const subscribers = await prisma.subscriber.findMany({
    select: { id: true, slug: true },
  });

  for (const sub of subscribers) {
    const chatConfigBySlug: Record<string, any> = {
      "demo-gatekeeper": {
        providerInboxId: "agent_e993412c0a735a59ab24944ca0",
      },
      rocketsciencedesigns: {
        providerInboxId: "agent_3fed5b39ade35fdc0ad1994f5b",
      },
      winnipegbeauty: {
        providerInboxId: "agent_e993412c0a735a59ab24944ca0",
      },
      winnipegrenoking: {
        providerInboxId: "agent_e993412c0a735a59ab24944ca0",
      },
      winnipegprimoaccountants: {
        providerInboxId: "agent_e993412c0a735a59ab24944ca0",
      },
    };

    const chatConfig = chatConfigBySlug[sub.slug] || {};

    await prisma.subscriberChannel.upsert({
      where: {
        subscriberId_channel: {
          subscriberId: sub.id,
          channel: "CHAT",
        },
      },
      create: {
        subscriberId: sub.id,
        channel: "CHAT",
        enabled: true,
        transportProvider: "OTHER",
        aiProvider: "RETELL",
        ...chatConfig,
      },
      update: {
        enabled: true,
        transportProvider: "OTHER",
        aiProvider: "RETELL",
        ...chatConfig,
      },
    });
    console.log(`Upserted CHAT channel for subscriber: ${sub.slug}`);

    const voiceConfigBySlug: Record<string, any> = {
      "demo-gatekeeper": {
        enabled: true,
        transportProvider: "TWILIO",
        aiProvider: "RETELL",
        providerNumberE164: DEMO_NUMBER,
        providerAgentIdOutbound: GATEKEEPER_OUTBOUND_AGENT_ID,
        providerAgentIdInbound: GATEKEEPER_INBOUND_AGENT_ID,
      },
      rocketsciencedesigns: {
        enabled: true,
        transportProvider: "RETELL",
        aiProvider: "RETELL",
        providerNumberE164: RSD_NUMBER,
        providerAgentIdOutbound: RSD_OUTBOUND_AGENT_ID,
        providerAgentIdInbound: RSD_INBOUND_AGENT_ID,
      },
    };

    // Default for demo businesses: no number claim
    const defaultVoice = {
      enabled: false,                 // safest
      transportProvider: "OTHER",
      aiProvider: "RETELL",
      providerNumberE164: null,
      providerAgentIdOutbound: null,
      providerAgentIdInbound: null,
    };

    const voice = voiceConfigBySlug[sub.slug] ?? defaultVoice;

    await prisma.subscriberChannel.upsert({
      where: {
        subscriberId_channel: {
          subscriberId: sub.id,
          channel: "VOICE",
        },
      },
      create: {
        subscriberId: sub.id,
        channel: "VOICE",
        ...voice,
      },
      update: {
        ...voice,
      },
    });
    console.log(`Upserted VOICE channel for subscriber: ${sub.slug}`);


    const smsConfigBySlug: Record<string, any> = {
      "demo-gatekeeper": {
        enabled: true,
        transportProvider: "TWILIO",
        aiProvider: "RETELL",
        providerNumberE164: DEMO_NUMBER,
        providerInboxId: "agent_ed38b16e086d8bbc3ce89c03f8",
      },
      rocketsciencedesigns: {
        enabled: false,
        transportProvider: "TWILIO",
        aiProvider: "RETELL",
        providerNumberE164: null,
        providerAgentIdOutbound: null,
        providerAgentIdInbound: null,
      },
    };

    // Default for demo businesses: SMS exists but disabled and does NOT claim number
    const defaultSms = {
      enabled: false,
      transportProvider: "TWILIO",
      aiProvider: "RETELL",
      providerNumberE164: null,
      providerAgentIdOutbound: null,
      providerAgentIdInbound: null,
    };

    const sms = smsConfigBySlug[sub.slug] ?? defaultSms;

    await prisma.subscriberChannel.upsert({
      where: {
        subscriberId_channel: {
          subscriberId: sub.id,
          channel: "SMS",
        },
      },
      create: {
        subscriberId: sub.id,
        channel: "SMS",
        ...sms,
      },
      update: {
        ...sms,
      },
    });
    console.log(`Upserted SMS channel for subscriber: ${sub.slug}`);



  }

  console.log("SubscriberChannel seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
