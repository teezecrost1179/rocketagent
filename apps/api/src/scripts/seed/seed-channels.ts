import { prisma } from "../../lib/prisma";

async function main() {
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
        enabled: true,
        transportProvider: "TWILIO",
        aiProvider: "RETELL",
        providerNumberE164: "+14316005505",
        providerAgentId: "agent_7ace7a26b3a6e5a2d9f3cea066",
      },
      update: {
        enabled: true,
        transportProvider: "TWILIO",
        aiProvider: "RETELL",
        providerNumberE164: "+14316005505",
        providerAgentId: "agent_7ace7a26b3a6e5a2d9f3cea066",
      },
    });
    console.log(`Upserted VOICE channel for subscriber: ${sub.slug}`);



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
