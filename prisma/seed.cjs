require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

// Render Postgres typically requires SSL.
// sslmode=require in the URL is NOT always enough for node-postgres.
// This makes pg accept Render's cert setup.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const slug = "rocket-science-designs";

  const client = await prisma.client.upsert({
    where: { slug },
    update: {
      displayName: "Rocket Science Designs",
      rocketNumber: "+12048082733",
      retellAgentId: "agent_59a0cc2b7135463c3acc7cadd5",
      timezone: "America/Winnipeg",
      officeHoursJson: {
        mon: "09:00-17:00",
        tue: "09:00-17:00",
        wed: "09:00-17:00",
        thu: "09:00-17:00",
        fri: "09:00-15:00",
        sat: null,
        sun: null,
      },
      defaultGreeting:
        "Hi! Thanks for calling Rocket Science Designs — this is Rocket, the virtual receptionist. How can I help today?",
    },
    create: {
      slug,
      displayName: "Rocket Science Designs",
      rocketNumber: "+12048082733",
      retellAgentId: "agent_59a0cc2b7135463c3acc7cadd5",
      timezone: "America/Winnipeg",
      officeHoursJson: {
        mon: "09:00-17:00",
        tue: "09:00-17:00",
        wed: "09:00-17:00",
        thu: "09:00-17:00",
        fri: "09:00-15:00",
        sat: null,
        sun: null,
      },
      defaultGreeting:
        "Hi! Thanks for calling Rocket Science Designs — this is Rocket, the virtual receptionist. How can I help today?",
    },
  });

  console.log("Seeded client:", client.slug, client.id);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
