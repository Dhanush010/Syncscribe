// server/server.js
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import Document from "./models/Document.js";
import docRoutes from "./routes/docRoutes.js";


const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/documents", docRoutes);

// ✅ Connect MongoDB
mongoose
  .connect("mongodb://localhost:27017/realtimenotes")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log(err));

const server = app.listen(5000, () =>
  console.log("✅ Server running on http://localhost:5000")
);

const wss = new WebSocketServer({ server });
const clients = new Map();

// ✅ WebSocket Handling
wss.on("connection", (ws) => {
  console.log("🟢 Client connected");

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "JOIN_DOC") {
      clients.set(ws, data.docId);
      return;
    }

    if (data.type === "UPDATE_DOC") {
      const { docId, content } = data;

      await Document.findByIdAndUpdate(docId, { content });

      for (const [client, currentDoc] of clients.entries()) {
        if (client !== ws && currentDoc === docId) {
          client.send(JSON.stringify({ type: "DOC_UPDATE", content }));
        }
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("🔴 Client disconnected");
  });
});
