const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const slug = "rocketsciencedesigns";

  const existing = await prisma.subscriber.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Subscriber '${slug}' already exists. Skipping.`);
    return;
  }

  await prisma.subscriber.create({
    data: {
      slug,
      legalName: "Rocket Science Designs",
      displayName: "Rocket Science Designs",
      status: "active",
      widgetTitle: "Rocket Reception",
      widgetSubtitle: "We’ll take it from here.",
      widgetGreeting: "Hi! How can we help today?",
      widgetEnabled: true,
    },
  });

  console.log(`Subscriber '${slug}' created.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
