import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    count: { type: String },
    image: { type: String },
    description: { type: String },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model("Category", CategorySchema);
