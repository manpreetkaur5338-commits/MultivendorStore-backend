import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import productrouter from "./routes/productroutes.js" 
import router from "./routes/authroutes.js";
import categoryRouter from "./routes/categoryroutes.js";
import orderRouter from "./routes/orderroutes.js";
import adminRouter from "./routes/adminroutes.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", router);
app.use("/api/products", productrouter);
app.use("/api/categories", categoryRouter);
app.use("/api/orders", orderRouter);
app.use("/api/admin", adminRouter);

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
