import "dotenv/config";
import { prisma } from "../../lib/prisma";
import { upsertSubscriber } from "./seed-core";

async function main() {
  const demos = [
    {
      slug: "winnipegbeauty",
      widgetTitle: "Winnipeg Beauty",
      widgetSubtitle: "Hair, nails, and self-care",
      widgetGreeting:
        "Hi! Welcome to Winnipeg Beauty 💅 Would you like to book an appointment or ask a question?",
      widgetAvatarUrl:
        "https://rocketreception.ca/demo-winnipeg-beauty/assets/winnipeg-beauty-logo.png",
      widgetPrimaryColorHex: "#f473bf",
      widgetSecondaryColorHex: "#808080",
    },
    {
      slug: "winnipegrenoking",
      widgetTitle: "Winnipeg Reno King",
      widgetSubtitle: "Kitchens, basements, and full renovations",
      widgetGreeting:
        "Hi! Thanks for calling Winnipeg Reno King. Are you looking for a quote or information on our services?",
      widgetAvatarUrl: "https://rocketreception.ca/demo-winnipeg-reno-king/assets/logo.png",
      widgetPrimaryColorHex: "#ae8332",
      widgetSecondaryColorHex: "#808080",
    },
    {
      slug: "winnipegprimoaccountants",
      widgetTitle: "Winnipeg Primo Accountants",
      widgetSubtitle: "Tax, bookkeeping, and small business accounting",
      widgetGreeting:
        "Hello! You’ve reached Winnipeg Primo Accountants. How can we assist you today?",
      widgetAvatarUrl:
        "https://rocketreception.ca/demo-winnipeg-primo-accountants/assets/logo.png",
      widgetPrimaryColorHex: "#14aa40",
      widgetSecondaryColorHex: "#808080",
    },
  ];

  for (const d of demos) {
    await upsertSubscriber({
      slug: d.slug,
      status: "active",
      legalName: d.widgetTitle,
      displayName: d.widgetTitle,
      widgetEnabled: true,
      widgetTitle: d.widgetTitle,
      widgetSubtitle: d.widgetSubtitle,
      widgetGreeting: d.widgetGreeting,
      widgetAvatarUrl: d.widgetAvatarUrl,
      widgetPrimaryColorHex: d.widgetPrimaryColorHex,
      allowedDomains: ["rocketsciencedesigns.com", "rocketreception.ca"],
    });

    console.log(`Seeded demo subscriber: ${d.slug}`);
  }

  console.log("Demo subscribers seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
