import "dotenv/config";
import { prisma } from "../../lib/prisma";

export type SeedSubscriberInput = {
  slug: string;
  status?: string;
  legalName?: string;
  displayName?: string;

  widgetEnabled?: boolean;
  widgetTitle?: string;
  widgetSubtitle?: string;
  widgetGreeting?: string;
  widgetAvatarUrl?: string | null;
  offlineMessage?: string | null;
};

// Core helper: idempotent + safe to re-run
export async function upsertSubscriber(input: SeedSubscriberInput) {
  const {
    slug,
    status = "active",
    widgetEnabled = true,
    legalName,
    displayName,
    widgetTitle,
    widgetSubtitle,
    widgetGreeting,
    widgetAvatarUrl,
    offlineMessage,
  } = input;

  // IMPORTANT: leaving undefined fields is OK; Prisma will ignore them.
  const data = {
    slug,
    status,
    widgetEnabled,
    legalName,
    displayName,
    widgetTitle,
    widgetSubtitle,
    widgetGreeting,
    widgetAvatarUrl,
    offlineMessage,
  };

  await prisma.subscriber.upsert({
    where: { slug },
    update: data,
    create: data,
  });

  console.log(`Upserted subscriber: ${slug}`);
}

async function main() {
  await upsertSubscriber({
    slug: "rocketsciencedesigns",
    legalName: "Rocket Science Designs",
    displayName: "Rocket Science Designs",
    status: "active",
    widgetTitle: "Rocket Reception",
    widgetSubtitle: "We’ll take it from here.",
    widgetGreeting: "Hi! How can we help today?",
    widgetEnabled: true,
  });

  console.log("Core seed complete.");
}


if (require.main === module) {
  main()
    .catch((e) => {
      console.error("Seed failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
