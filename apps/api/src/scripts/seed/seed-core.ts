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
  widgetPrimaryColorHex?: string | null;
  widgetSecondaryColorHex?: string | null;
  offlineMessage?: string | null;
  websiteUrl?: string;
  publicPhoneE164?: string;
  allowedDomains?: string[];
  primaryEmail?: string;
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
    widgetPrimaryColorHex,
    widgetSecondaryColorHex,
    offlineMessage,
    websiteUrl,
    publicPhoneE164,
    allowedDomains,
    primaryEmail,
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
    widgetPrimaryColorHex,
    widgetSecondaryColorHex,
    offlineMessage,
    websiteUrl,
    publicPhoneE164,
    allowedDomains,
    primaryEmail,

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
    widgetGreeting: "Hi, I'm Jenny-the virtual receptionist for Rocket Science. How can I help you today?",
    widgetAvatarUrl: "https://rocketsciencedesigns.com/assets/logo-white-bg.png",
    widgetPrimaryColorHex: "#d91818",
    widgetSecondaryColorHex: "#128cb5",
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

  // Rocket Reception (site chat widget only)
  await upsertSubscriber({
    slug: "rocketreception",
    legalName: "Rocket Reception",
    displayName: "Rocket Reception",
    status: "active",
    widgetTitle: "Rocket Reception",
    widgetSubtitle: "Friendly AI Support for SMB",
    widgetGreeting: "Hi, thanks for checking out Rocket Reception. What can I help you with today?",
    widgetAvatarUrl: "https://rocketreception.ca/assets/logo.png",
    widgetPrimaryColorHex: "#0da7d1",
    widgetSecondaryColorHex: "#d10d52",
    widgetEnabled: true,
    websiteUrl: "https://rocketreception.ca",
    primaryEmail: "support@rocketreception.ca",
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
