import express from "express";
import Category from "../model/Category.js";

const categoryRouter = express.Router();

// GET all categories from MongoDB
categoryRouter.get("/", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default categoryRouter;
