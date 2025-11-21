// server/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import Document from "./models/Document.js";
import Version from "./models/Version.js";
import { verifyWebSocketToken } from "./middleware/auth.js";
import documentRoutes from "./routes/documentRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import versionRoutes from "./routes/versionRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";

const app = express();
const MONGO_URI = process.env.MONGO_URL || process.env.MONGO_URI || "mongodb://localhost:27017/realtimenotes";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// LOG THE CONNECTION STRING TO VERIFY
console.log("🔍 Connecting to MongoDB:", MONGO_URI);
console.log("🔍 MONGO_URL env var:", process.env.MONGO_URL);
console.log("🔍 MONGO_URI env var:", process.env.MONGO_URI);

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));
app.use(express.json());

// Log ALL requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/versions", versionRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/export", exportRoutes);

// MongoDB connect
console.log("🔍 Attempting to connect to MongoDB with URI:", MONGO_URI);
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected successfully to:", MONGO_URI);
    // Verify we can query documents
    mongoose.connection.db.listCollections().toArray().then(collections => {
      console.log("📁 Available collections:", collections.map(c => c.name));
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    console.error("❌ Failed to connect to:", MONGO_URI);
  });

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on http://0.0.0.0:${PORT}`));

const wss = new WebSocketServer({ 
  server,
  verifyClient: (info) => {
    // Allow connection, authenticate in onconnection
    return true;
  },
  host: "0.0.0.0"
});

// clients map and per-doc sets
const clients = new Map(); // ws -> { username, color, docId, userId }
const docUsers = {}; // docId -> Set(ws)
const highlights = {}; // docId -> Map<userId, {index, length, color}>

function randomColor() {
  const colors = ["#ff4757", "#ffa502", "#1e90ff", "#2ed573", "#eccc68", "#3742fa"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function broadcastToDoc(docId, payload, excludeWs = null) {
  const set = docUsers[docId];
  if (!set) return;
  for (const client of set) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  }
}

function broadcastUsers(docId) {
  const set = docUsers[docId] || new Set();
  const users = [...set].map(ws => {
    const info = clients.get(ws);
    return { 
      username: info?.username, 
      color: info?.color,
      userId: info?.userId 
    };
  });
  broadcastToDoc(docId, { type: "USER_LIST", users, count: users.length });
}

// Auto-save versions every 5 minutes
setInterval(async () => {
  try {
    for (const [ws, info] of clients.entries()) {
      if (info.docId && ws.readyState === 1) {
        const doc = await Document.findById(info.docId);
        if (doc && doc.content) {
          await Version.create({
            documentId: doc._id,
            content: doc.content,
            createdBy: info.userId || null,
            name: `Auto-save ${new Date().toLocaleString()}`
          });
        }
      }
    }
  } catch (err) {
    console.error("Auto-version save error:", err);
  }
}, 5 * 60 * 1000); // 5 minutes

wss.on("connection", (ws, req) => {
  // Extract token from query or headers
  let token = null;
  const url = new URL(req.url, `http://${req.headers.host}`);
  token = url.searchParams.get("token");
  
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  }

  // Verify token
  const decoded = verifyWebSocketToken(token);
  let username = `User${Math.floor(Math.random() * 1000)}`;
  let userId = null;
  
  if (decoded) {
    username = decoded.username || username;
    userId = decoded.userId || null;
  }

  const color = randomColor();
  clients.set(ws, { username, color, docId: null, userId });
  ws.send(JSON.stringify({ type: "ASSIGN_ID", username, color }));

  ws.on("message", async (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }

    const info = clients.get(ws);

    // JOIN_DOC - with permission check
    if (data.type === "JOIN_DOC") {
      const docId = data.docId;
      
      try {
        const doc = await Document.findById(docId);
        if (!doc) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Document not found" }));
          return;
        }

        // Collaborative mode: all authenticated users can access all documents
        // No permission check needed - all users can join any document

        info.docId = docId;
        clients.set(ws, info);

        if (!docUsers[docId]) docUsers[docId] = new Set();
        docUsers[docId].add(ws);

        // Fetch fresh document content from database to ensure latest version
        const freshDoc = await Document.findById(docId);
        if (!freshDoc) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Document not found" }));
          return;
        }

        // Send current document contents - always send latest from DB
        let content = freshDoc.content || "";
        console.log(`[JOIN_DOC] User ${info.username} (${info.userId}) joining document ${docId}`);
        console.log(`[JOIN_DOC] Document content type: ${typeof content}, length: ${typeof content === 'string' ? content.length : 'N/A'}`);
        
        try {
          // Try to parse as JSON (Quill delta format)
          if (typeof content === "string" && content.trim()) {
            const parsed = JSON.parse(content);
            console.log(`[JOIN_DOC] Sending DOC_SYNC with parsed delta (ops: ${parsed.ops?.length || 0})`);
            ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content: parsed }));
          } else if (content && typeof content === "object") {
            console.log(`[JOIN_DOC] Sending DOC_SYNC with object content (ops: ${content.ops?.length || 0})`);
            ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content }));
          } else {
            // Empty or plain text
            console.log(`[JOIN_DOC] Sending DOC_SYNC with plain text/empty content`);
            ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content: content || "" }));
          }
        } catch (parseErr) {
          // If parsing fails, send as plain text
          console.log(`[JOIN_DOC] Parse error, sending as plain text:`, parseErr.message);
          ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content: content || "" }));
        }
        
        console.log(`[JOIN_DOC] DOC_SYNC sent to user ${info.username} for document ${docId}`);

        // Send current highlights
        if (highlights[docId]) {
          const highlightsArray = Array.from(highlights[docId].entries()).map(([uid, h]) => ({
            userId: uid,
            ...h
          }));
          ws.send(JSON.stringify({ type: "HIGHLIGHTS_SYNC", highlights: highlightsArray }));
        }

        broadcastUsers(docId);
      } catch (err) {
        console.error("JOIN_DOC error:", err);
        ws.send(JSON.stringify({ type: "ERROR", message: err.message }));
      }
      return;
    }

    // LEAVE_DOC
    if (data.type === "LEAVE_DOC") {
      const docId = data.docId;
      if (docUsers[docId]) {
        docUsers[docId].delete(ws);
        broadcastUsers(docId);
      }
      
      // Remove highlights
      if (highlights[docId] && userId) {
        highlights[docId].delete(userId);
      }
      
      info.docId = null;
      clients.set(ws, info);
      return;
    }

    // UPDATE_DOC (real-time delta)
    if (data.type === "UPDATE_DOC") {
      const { docId, delta } = data;
      
      // Collaborative mode: all authenticated users can edit all documents
      // No permission check needed
      
      // Broadcast to everyone else
      broadcastToDoc(docId, { 
        type: "DOC_UPDATE",
        docId,
        delta, 
        username: info.username,
        userId: info.userId
      }, ws);
      return;
    }

    // CURSOR_MOVE
    if (data.type === "CURSOR_MOVE") {
      const { docId, index, length } = data;
      broadcastToDoc(docId, { 
        type: "CURSOR_MOVE", 
        username: info.username, 
        color: info.color, 
        userId: info.userId,
        index, 
        length 
      }, ws);
      return;
    }

    // HIGHLIGHT_TEXT
    if (data.type === "HIGHLIGHT_TEXT") {
      const { docId, index, length } = data;
      if (!highlights[docId]) highlights[docId] = new Map();
      if (userId) {
        highlights[docId].set(userId, { index, length, color: info.color });
        broadcastToDoc(docId, {
          type: "HIGHLIGHT_TEXT",
          userId,
          username: info.username,
          color: info.color,
          index,
          length
        }, ws);
      }
      return;
    }

    // REMOVE_HIGHLIGHT
    if (data.type === "REMOVE_HIGHLIGHT") {
      const { docId } = data;
      if (highlights[docId] && userId) {
        highlights[docId].delete(userId);
        broadcastToDoc(docId, {
          type: "REMOVE_HIGHLIGHT",
          userId
        }, ws);
      }
      return;
    }

    // COMMENT_ADDED
    if (data.type === "COMMENT_ADDED") {
      const { docId, comment } = data;
      broadcastToDoc(docId, {
        type: "COMMENT_ADDED",
        comment
      }, ws);
      return;
    }

    // COMMENT_UPDATED
    if (data.type === "COMMENT_UPDATED") {
      const { docId, comment } = data;
      broadcastToDoc(docId, {
        type: "COMMENT_UPDATED",
        comment
      }, ws);
      return;
    }

    // COMMENT_DELETED
    if (data.type === "COMMENT_DELETED") {
      const { docId, commentId } = data;
      broadcastToDoc(docId, {
        type: "COMMENT_DELETED",
        commentId
      }, ws);
      return;
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    if (info?.docId) {
      if (docUsers[info.docId]) {
        docUsers[info.docId].delete(ws);
        broadcastUsers(info.docId);
      }
      
      // Remove highlights
      if (highlights[info.docId] && info.userId) {
        highlights[info.docId].delete(info.userId);
      }
    }
    clients.delete(ws);
  });
});
