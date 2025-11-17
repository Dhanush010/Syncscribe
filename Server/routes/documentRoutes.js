import express from "express";
import Document from "../models/Document.js";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import crypto from "crypto";

const router = express.Router();

// Helper to check permissions
const checkPermission = async (doc, userId, requiredRole = "viewer") => {
  if (!doc) return false;
  
  // If document has no owner (created before auth), allow access
  if (!doc.owner) return true;
  
  // If user is owner, allow access
  if (doc.owner.toString() === userId.toString()) return true;
  
  // Check permissions
  const perm = doc.permissions.find(p => p.user && p.user.toString() === userId.toString());
  if (!perm) return false;
  
  if (requiredRole === "editor") {
    return perm.role === "editor";
  }
  return true; // viewer can view
};

// Get all documents (user's own + shared + documents without owner for backward compatibility)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs = await Document.find({
      $or: [
        { owner: userId },
        { "permissions.user": userId },
        { owner: null }, // Include documents without owner (created before auth)
        { owner: { $exists: false } } // Include documents where owner field doesn't exist
      ]
    }).populate("owner", "username").populate("permissions.user", "username email");
    res.json(docs);
  } catch (err) {
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
    
    // If document has no owner, assign current user as owner on first edit
    if (!doc.owner) {
      doc.owner = req.user.userId;
      await doc.save();
    }
    
    const hasPermission = await checkPermission(doc, req.user.userId, "editor");
    if (!hasPermission) {
      return res.status(403).json({ error: "Edit permission denied" });
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

// Delete a document (only owner, or anyone if no owner)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    // If document has no owner, allow deletion by any authenticated user
    if (doc.owner && doc.owner.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Only owner can delete" });
    }
    
    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: "Document deleted successfully" });
  } catch (err) {
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
