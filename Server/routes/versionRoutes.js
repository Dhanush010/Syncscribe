import express from "express";
import Version from "../models/Version.js";
import Document from "../models/Document.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Get all versions for a document
router.get("/document/:docId", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    // Check permission
    if (doc.owner.toString() !== req.user.userId.toString() &&
        !doc.permissions.some(p => p.user.toString() === req.user.userId.toString())) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const versions = await Version.find({ documentId: req.params.docId })
      .populate("createdBy", "username")
      .sort({ createdAt: -1 });
    
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new version
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { documentId, content, name } = req.body;
    const doc = await Document.findById(documentId);
    
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const version = await Version.create({
      documentId,
      content,
      createdBy: req.user.userId,
      name: name || `Version ${new Date().toLocaleString()}`
    });
    
    const populated = await Version.findById(version._id)
      .populate("createdBy", "username");
    
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore a version
router.post("/:id/restore", authenticateToken, async (req, res) => {
  try {
    const version = await Version.findById(req.params.id).populate("documentId");
    if (!version) return res.status(404).json({ error: "Version not found" });
    
    const doc = version.documentId;
    
    // Check permission
    if (doc.owner.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Only owner can restore" });
    }
    
    doc.content = version.content;
    doc.updatedAt = Date.now();
    await doc.save();
    
    res.json({ message: "Version restored", document: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


