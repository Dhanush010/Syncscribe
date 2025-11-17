import mongoose from "mongoose";

const CommentSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  selection: {
    index: Number,
    length: Number,
    text: String
  },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" }, // For replies
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  createdAt: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false }
});

export default mongoose.model("Comment", CommentSchema);


