import express from "express";
import cors from "cors";
import callRoutes from "./routes/callRoutes";
import chatRoutes from "./routes/chatRoutes";
import widgetConfigRoutes from "./routes/widgetConfig";

const app = express();

app.use(cors());
app.use(express.json());

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
