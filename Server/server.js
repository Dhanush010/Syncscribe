// server/server.js
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
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/versions", versionRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/export", exportRoutes);

// MongoDB connect
mongoose
  .connect("mongodb://localhost:27017/realtimenotes")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("Mongo connect error:", err));

const server = app.listen(5000, () => console.log("✅ Server running on http://localhost:5000"));

const wss = new WebSocketServer({ 
  server,
  verifyClient: (info) => {
    // Allow connection, authenticate in onconnection
    return true;
  }
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

        // Check permission
        if (userId) {
          // Allow access if document has no owner (created before auth)
          if (!doc.owner) {
            // Allow access
          } else {
            const isOwner = doc.owner.toString() === userId.toString();
            const hasPermission = doc.permissions.some(p => p.user && p.user.toString() === userId.toString());
            
            if (!isOwner && !hasPermission && !doc.shareLink) {
              ws.send(JSON.stringify({ type: "ERROR", message: "Access denied" }));
              return;
            }
          }
        }

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
        try {
          // Try to parse as JSON (Quill delta format)
          if (typeof content === "string" && content.trim()) {
            const parsed = JSON.parse(content);
            ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content: parsed }));
          } else if (content && typeof content === "object") {
            ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content }));
          } else {
            // Empty or plain text
            ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content: content || "" }));
          }
        } catch (parseErr) {
          // If parsing fails, send as plain text
          ws.send(JSON.stringify({ type: "DOC_SYNC", docId, content: content || "" }));
        }

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
      
      // Check permission for editing
      if (userId) {
        try {
          const doc = await Document.findById(docId);
          if (doc) {
            // Allow editing if document has no owner (created before auth)
            if (!doc.owner) {
              // Allow editing
            } else {
              const isOwner = doc.owner.toString() === userId.toString();
              const perm = doc.permissions.find(p => p.user && p.user.toString() === userId.toString());
              const canEdit = isOwner || (perm && perm.role === "editor");
              
              if (!canEdit && !doc.shareLink) {
                ws.send(JSON.stringify({ type: "ERROR", message: "Edit permission denied" }));
                return;
              }
            }
          }
        } catch (err) {
          console.error("Permission check error:", err);
        }
      }
      
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
