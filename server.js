import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import productroutes from "./routes/Productroutes.js";
import authroutes from "./routes/authroutes.js";
import categoryroutes from "./routes/categoryroutes.js";
import orderroutes from "./routes/orderroutes.js";
import adminroutes from "./routes/adminroutes.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authroutes);
app.use("/api/products", productroutes);
app.use("/api/categories", categoryroutes);
app.use("/api/orders", orderroutes);
app.use("/api/admin", adminroutes);

// Home API
app.get("/", (req, res) => {
  res.json({
    name: "MarketNest Multi-Vendor API",
    status: "online",
    endpoints: [
      "/api/auth",
      "/api/products",
      "/api/categories",
      "/api/orders",
    ],
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGOURI);
    console.log("MongoDB connected successfully to MarketNest");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
};

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
startServer();
