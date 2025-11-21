import express from "express";
import Document from "../models/Document.js";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import crypto from "crypto";

const router = express.Router();

// Helper to check permissions
// For collaborative editing, all authenticated users can access all documents
// Permissions are ignored - this is a fully collaborative editor
const checkPermission = async (doc, userId, requiredRole = "viewer") => {
  if (!doc) return false;
  
  // Collaborative mode: ALL authenticated users can view and edit ALL documents
  // Permission system is completely ignored for true collaboration
  return true;
};

// Get all documents (collaborative - all authenticated users can see all documents)
router.get("/", authenticateToken, async (req, res) => {
  try {
    console.log(`\n========== [GET /api/documents] ==========`);
    console.log(`User ID: ${req.user.userId}`);
    console.log(`Username: ${req.user.username}`);
    
    // STEP 1: Get ALL documents from MongoDB - NO FILTERING AT ALL
    const allDocs = await Document.find({});
    console.log(`STEP 1: Found ${allDocs.length} documents in MongoDB`);
    
    // STEP 2: Convert to plain objects
    const docsArray = allDocs.map(doc => doc.toObject());
    console.log(`STEP 2: Converted to ${docsArray.length} plain objects`);
    
    // STEP 3: Populate owner and permissions (optional, doesn't affect count)
    const populated = await Promise.all(docsArray.map(async (doc) => {
      if (doc.owner) {
        try {
          const owner = await User.findById(doc.owner).select("username email").lean();
          doc.owner = owner;
        } catch (e) {
          doc.owner = null;
        }
      }
      if (doc.permissions && doc.permissions.length > 0) {
        doc.permissions = await Promise.all(doc.permissions.map(async (perm) => {
          if (perm.user) {
            try {
              const user = await User.findById(perm.user).select("username email").lean();
              return { ...perm, user };
            } catch (e) {
              return perm;
            }
          }
          return perm;
        }));
      }
      return doc;
    }));
    
    // STEP 4: Sort by updatedAt
    populated.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    
    console.log(`STEP 3: Returning ${populated.length} documents to user ${req.user.username}`);
    populated.forEach((doc, i) => {
      console.log(`  ${i + 1}. ID: ${doc._id}, Title: "${doc.title}"`);
    });
    console.log(`==========================================\n`);
    
    // Disable ALL caching - add timestamp to force fresh response
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('X-Timestamp', Date.now().toString());
    
    // Add metadata to response for debugging
    const response = {
      documents: populated,
      count: populated.length,
      timestamp: new Date().toISOString(),
      userId: req.user.userId
    };
    
    console.log(`Sending response with ${response.count} documents at ${response.timestamp}`);
    res.json(populated); // Still send just the array for compatibility
  } catch (err) {
    console.error("[GET /documents] ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single document
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate("owner", "username email")
      .populate("permissions.user", "username email");
    
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const hasPermission = await checkPermission(doc, req.user.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new document
router.post("/", authenticateToken, async (req, res) => {
  try {
    const newDoc = await Document.create({
      ...req.body,
      owner: req.user.userId
    });
    res.status(201).json(newDoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a document
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    // Collaborative mode: all authenticated users can edit
    // Only check permissions if document has explicit permissions set
    const hasPermission = await checkPermission(doc, req.user.userId, "editor");
    if (!hasPermission) {
      return res.status(403).json({ error: "Edit permission denied" });
    }
    
    // If document has no owner, assign current user as owner on first edit (optional)
    // This helps track who created/owns the document but doesn't restrict access
    if (!doc.owner) {
      doc.owner = req.user.userId;
    }
    
    const updatedDoc = await Document.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    ).populate("owner", "username").populate("permissions.user", "username email");
    
    res.json(updatedDoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a document (collaborative - all authenticated users can delete any document)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    // Collaborative mode: ALL authenticated users can delete ANY document
    // No permission check needed
    
    await Document.findByIdAndDelete(req.params.id);
    console.log(`Document ${req.params.id} deleted by user ${req.user.userId}`);
    res.json({ message: "Document deleted successfully" });
  } catch (err) {
    console.error("[DELETE /documents/:id] ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Share document by email
router.post("/:id/share", authenticateToken, async (req, res) => {
  try {
    const { email, role = "editor" } = req.body;
    const doc = await Document.findById(req.params.id);
    
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.owner.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Only owner can share" });
    }
    
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    // Check if already shared
    const existing = doc.permissions.find(p => p.user.toString() === user._id.toString());
    if (existing) {
      existing.role = role;
    } else {
      doc.permissions.push({ user: user._id, role });
    }
    
    await doc.save();
    const updated = await Document.findById(doc._id)
      .populate("permissions.user", "username email");
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate share link
router.post("/:id/share-link", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.owner.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Only owner can generate share link" });
    }
    
    const shareLink = crypto.randomBytes(32).toString("hex");
    doc.shareLink = shareLink;
    await doc.save();
    
    res.json({ shareLink: `${req.protocol}://${req.get("host")}/share/${shareLink}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get document by share link
router.get("/share/:link", async (req, res) => {
  try {
    const doc = await Document.findOne({ shareLink: req.params.link })
      .populate("owner", "username");
    if (!doc) return res.status(404).json({ error: "Invalid share link" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export document
router.get("/:id/export/:format", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const hasPermission = await checkPermission(doc, req.user.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    res.json({ content: doc.content, title: doc.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
