import { Router } from "express";

const router = Router();

router.get("/widget-config", (req, res) => {
  const subscriber = ((req.query.subscriber as string) || "").toLowerCase();

  const configs: Record<string, any> = {
    rocketsciencedesigns: {
      title: "Rocket Science Designs",
      subtitle: "Web, Shopify, and branding help",
      greeting:
        "Hi! I’m Rocket, the AI receptionist for Rocket Science Designs. What can I help you with today?",
      avatarUrl: "https://rocketreception.ca/assets/rocket-science-designs.png"
    },

    winnipegbeauty: {
      title: "Winnipeg Beauty",
      subtitle: "Hair, nails, and self-care",
      greeting:
        "Hi! Welcome to Winnipeg Beauty 💅 Would you like to book an appointment or ask a question?",
      avatarUrl: "https://rocketreception.ca/assets/winnipeg-beauty.png"
    },

    winnipegrenoking: {
      title: "Winnipeg Reno King",
      subtitle: "Kitchens, basements, and full renovations",
      greeting:
        "Hi! Thanks for calling Winnipeg Reno King. Are you looking for a quote or information on our services?",
      avatarUrl: "https://rocketreception.ca/assets/winnipeg-reno-king.png"
    },

    winnipegprimoaccountants: {
      title: "Winnipeg Primo Accountants",
      subtitle: "Tax, bookkeeping, and small business accounting",
      greeting:
        "Hello! You’ve reached Winnipeg Primo Accountants. How can we assist you today?",
      avatarUrl: "https://rocketreception.ca/assets/winnipeg-primo-accountants.png"
    }
  };

  res.json(configs[subscriber] || {});
});

export default router;
