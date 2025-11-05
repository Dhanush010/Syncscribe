import express from "express";
import Document from "../models/Document.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const docs = await Document.find();
  res.json(docs);
});

router.get("/:id", async (req, res) => {
  const doc = await Document.findById(req.params.id);
  res.json(doc);
});

router.post("/", async (req, res) => {
  const doc = await Document.create(req.body);
  res.json(doc);
});

router.put("/:id", async (req, res) => {
  const doc = await Document.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});

router.delete("/:id", async (req, res) => {
  await Document.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

export default router;
