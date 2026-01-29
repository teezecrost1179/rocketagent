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
  websiteUrl?: string;
  publicPhoneE164?: string;
  allowedDomains?: string[];
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
    websiteUrl,
    publicPhoneE164,
    allowedDomains,
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
    websiteUrl,
    publicPhoneE164,
    allowedDomains,

  };

  await prisma.subscriber.upsert({
    where: { slug },
    update: data,
    create: data,
  });

  console.log(`Upserted subscriber: ${slug}`);
}

async function main() {
  // Real business
  await upsertSubscriber({
    slug: "rocketsciencedesigns",
    legalName: "Rocket Science Designs",
    displayName: "Rocket Science Designs",
    status: "active",
    widgetTitle: "Rocket Science Designs",
    widgetSubtitle: "Web, Shopify, and branding help",
    widgetGreeting: "Hi! How can we help today?",
    widgetEnabled: true,
    websiteUrl: "https://rocketsciencedesigns.com",
    publicPhoneE164: "+12048082733",
    allowedDomains: ["rocketsciencedesigns.com", "rocketreception.ca"],
  });

  // Demo gatekeeper (owns the demo Twilio number)
  await upsertSubscriber({
    slug: "demo-gatekeeper",
    legalName: "Rocket Reception Demo",
    displayName: "Rocket Reception Demo",
    status: "active",
    widgetTitle: "Rocket Reception",
    widgetSubtitle: "We will take it from here.",
    widgetGreeting: "Hi! Which demo business would you like to reach today?",
    widgetEnabled: true,
    websiteUrl: "https://rocketreception.ca",
    publicPhoneE164: "+14316005505",
    allowedDomains: ["rocketsciencedesigns.com", "rocketreception.ca"],
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
