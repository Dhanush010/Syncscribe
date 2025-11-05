import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  title: String,
  content: String,
});

export default mongoose.model("Document", DocumentSchema);
