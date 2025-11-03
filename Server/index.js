import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import { createClient } from "redis";
import documentRoutes from "./routes/documentRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());
app.use("/api/documents", documentRoutes);
// Connect to MongoDB
const mongoURI = process.env.MONGO_URI;
mongoose
  .connect(mongoURI)
  .then(() => console.log(" MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Connect to Redis
const redisClient = createClient({
  url: process.env.REDIS_URL,
});
redisClient.on("connect", () => console.log(" Redis connected"));
redisClient.on("error", (err) => console.error("Redis error:", err));
await redisClient.connect();

// Simple test route
app.get("/", (req, res) => {
  res.send(" SyncScribe Server is running...");
});

// Start server
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});
