import express from "express";
import Comment from "../models/Comment.js";
import Document from "../models/Document.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Get all comments for a document
router.get("/document/:docId", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const comments = await Comment.find({ 
      documentId: req.params.docId,
      parentId: null // Only top-level comments
    })
      .populate("author", "username email")
      .populate({
        path: "replies",
        populate: { path: "author", select: "username email" }
      })
      .sort({ createdAt: 1 });
    
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a comment
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { documentId, text, selection, parentId } = req.body;
    const doc = await Document.findById(documentId);
    
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const comment = await Comment.create({
      documentId,
      author: req.user.userId,
      text,
      selection,
      parentId
    });
    
    if (parentId) {
      const parent = await Comment.findById(parentId);
      if (parent) {
        parent.replies.push(comment._id);
        await parent.save();
      }
    }
    
    const populated = await Comment.findById(comment._id)
      .populate("author", "username email");
    
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update comment (resolve/unresolve)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    
    if (comment.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Only author can update" });
    }
    
    if (req.body.resolved !== undefined) {
      comment.resolved = req.body.resolved;
    }
    if (req.body.text) {
      comment.text = req.body.text;
    }
    
    await comment.save();
    const populated = await Comment.findById(comment._id)
      .populate("author", "username email");
    
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete comment
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    
    if (comment.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Only author can delete" });
    }
    
    await Comment.deleteMany({ _id: { $in: comment.replies } });
    await Comment.findByIdAndDelete(req.params.id);
    
    res.json({ message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


