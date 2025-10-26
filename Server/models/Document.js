import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Document", DocumentSchema);

