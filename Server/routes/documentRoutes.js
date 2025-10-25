import express from "express";
import Document from "../models/Document.js";

const router = express.Router();

// Get all documents
router.get("/", async (req, res) => {
  const docs = await Document.find();
  res.json(docs);
});

// Create new document
router.post("/", async (req, res) => {
  const { title, content } = req.body;
  const newDoc = new Document({ title, content });
  await newDoc.save();
  res.json(newDoc);
});

// Get document by ID
router.get("/:id", async (req, res) => {
  const doc = await Document.findById(req.params.id);
  res.json(doc);
});

export default router;
