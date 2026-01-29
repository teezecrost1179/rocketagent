import express from "express";
import cors from "cors";
import callRoutes from "./routes/callRoutes";
import chatRoutes from "./routes/chatRoutes";
import retellInboundVoiceWebhook from "./routes/retellInboundVoiceWebhook";
import retellFunctions from "./routes/retellFunctions";
import retellWebhooks from "./routes/retellWebhooks";
import widgetConfigRoutes from "./routes/widgetConfig";
import twilioWebhooks from "./routes/twilioWebhooks";

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use("/webhooks/twilio", twilioWebhooks);
app.use(retellWebhooks);
app.use(retellInboundVoiceWebhook);
app.use(retellFunctions);


// Basic test route
app.get("/", (_req, res) => {
  res.send("Rocket Science AI receptionist API is running 🚀");
});

// Mount routes
app.use(callRoutes);
app.use(chatRoutes);
app.use(widgetConfigRoutes);

// Render uses PORT env var
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI receptionist listening on port ${PORT}`);
});
