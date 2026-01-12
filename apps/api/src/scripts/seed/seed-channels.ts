import { prisma } from "../../lib/prisma";

async function main() {
  const DEMO_NUMBER = "+14316005505";
  const RSD_NUMBER = "+12048082733";
  const GATEKEEPER_AGENT_ID = "agent_7ace7a26b3a6e5a2d9f3cea066";
  const subscribers = await prisma.subscriber.findMany({
    select: { id: true, slug: true },
  });

  for (const sub of subscribers) {
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
      },
      update: {
        enabled: true,
        transportProvider: "OTHER",
        aiProvider: "RETELL",
      },
    });
    console.log(`Upserted CHAT channel for subscriber: ${sub.slug}`);

    const voiceConfigBySlug: Record<string, any> = {
      "demo-gatekeeper": {
        enabled: true,
        transportProvider: "TWILIO",
        aiProvider: "RETELL",
        providerNumberE164: DEMO_NUMBER,
        providerAgentId: GATEKEEPER_AGENT_ID,
      },
      rocketsciencedesigns: {
        enabled: true,
        transportProvider: "RETELL",
        aiProvider: "RETELL",
        providerNumberE164: RSD_NUMBER,
        providerAgentId: null,
      },
    };

    // Default for demo businesses: no number claim
    const defaultVoice = {
      enabled: false,                 // safest
      transportProvider: "OTHER",
      aiProvider: "RETELL",
      providerNumberE164: null,
      providerAgentId: null,
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
        providerAgentId: GATEKEEPER_AGENT_ID, // optional, but ok
      },
      rocketsciencedesigns: {
        enabled: false,
        transportProvider: "TWILIO",
        aiProvider: "RETELL",
        providerNumberE164: null,
        providerAgentId: null,
      },
    };

    // Default for demo businesses: SMS exists but disabled and does NOT claim number
    const defaultSms = {
      enabled: false,
      transportProvider: "TWILIO",
      aiProvider: "RETELL",
      providerNumberE164: null,
      providerAgentId: null,
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
