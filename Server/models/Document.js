import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  title: String,
  content: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }, // Optional for backward compatibility
  permissions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    role: { type: String, enum: ["editor", "viewer"], default: "editor" }
  }],
  shareLink: { type: String, unique: true, sparse: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Document", DocumentSchema);
