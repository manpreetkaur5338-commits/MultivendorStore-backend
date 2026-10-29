import express from "express";
import Product from "../model/Product.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import mongoose from "mongoose";

const productrouter = express.Router();

// GET all products with filtering, search, category, and sorting
productrouter.get("/", async (req, res) => {
  try {
    const { category, search, sort, page = 1, limit = 50 } = req.query;

    const query = {
      $or: [
        { isApproved: true },
        { status: "active" },
        { isApproved: { $exists: false } },
      ],
    };

    if (category && category !== "all") {
      query.category = new RegExp(`^${category.trim()}$`, "i");
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$and = [
        {
          $or: [
            { name: searchRegex },
            { title: searchRegex },
            { description: searchRegex },
            { brand: searchRegex },
            { category: searchRegex },
          ],
        },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === "price-low") sortOption = { price: 1 };
    else if (sort === "price-high") sortOption = { price: -1 };
    else if (sort === "rating") sortOption = { rating: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await Product.countDocuments(query);
    const rawProducts = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    // Normalize product fields so frontend reliably receives name, image, price, rating, stock, etc.
    const products = rawProducts.map((p) => {
      const doc = p.toObject ? p.toObject() : p;
      const displayName = doc.name || doc.title || "Curated Market Product";
      const displayImage =
        doc.image ||
        (Array.isArray(doc.images) && doc.images[0]) ||
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80";

      return {
        ...doc,
        name: displayName,
        title: displayName,
        image: displayImage,
        images: Array.isArray(doc.images) && doc.images.length > 0 ? doc.images : [displayImage],
        price: doc.price || 0,
        originalPrice: doc.originalPrice || Math.round((doc.price || 0) * 1.25),
        discountPercent: doc.discountPercent || 20,
        rating: doc.rating || 4.8,
        ratingCount: doc.ratingCount || 28,
        stock: typeof doc.stock === "number" ? doc.stock : 15,
        brand: doc.brand || "MarketNest Artisan",
      };
    });

    res.status(200).json({
      success: true,
      count: products.length,
      totalCount,
      page: parseInt(page),
      data: products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// GET single product by ID or slug
productrouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let product;

    if (mongoose.isValidObjectId(id)) {
      product = await Product.findById(id);
    } else {
      product = await Product.findOne({ id: id });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const doc = product.toObject ? product.toObject() : product;
    const displayName = doc.name || doc.title || "Curated Market Product";
    const displayImage =
      doc.image ||
      (Array.isArray(doc.images) && doc.images[0]) ||
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80";

    res.status(200).json({
      success: true,
      data: {
        ...doc,
        name: displayName,
        title: displayName,
        image: displayImage,
        images: Array.isArray(doc.images) && doc.images.length > 0 ? doc.images : [displayImage],
        price: doc.price || 0,
        originalPrice: doc.originalPrice || Math.round((doc.price || 0) * 1.25),
        rating: doc.rating || 4.8,
        ratingCount: doc.ratingCount || 28,
        stock: typeof doc.stock === "number" ? doc.stock : 15,
        brand: doc.brand || "MarketNest Artisan",
      },
    });
  } catch (error) {
    console.error("Error fetching single product:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST create product (vendor only)
productrouter.post(
  "/",
  authMiddleware,
  roleMiddleware("vendor"),
  async (req, res) => {
    try {
      const vendor = await mongoose.model("User").findById(req.user.id);

      if (!vendor || !vendor.isApproved) {
        return res.status(403).json({
          success: false,
          message: "Vendor is not approved to add products",
        });
      }

      const { name, title, price, description, image, images, category, stock, brand } = req.body;

      const productName = name || title;
      if (!productName || !price || !category) {
        return res.status(400).json({
          success: false,
          message: "Name, price and category are required",
        });
      }

      const product = await Product.create({
        name: productName,
        title: productName,
        price: Number(price),
        description: description || "Authentic quality crafted with care.",
        image: image || (images && images[0]) || "",
        images: images || (image ? [image] : []),
        category,
        brand: brand || vendor.name,
        stock: Number(stock) || 10,
        vendor_id: vendor._id,
        seller: { id: vendor._id.toString(), name: vendor.name },
        isApproved: false, // requires admin approval
        status: "active",
      });

      return res.status(201).json({
        success: true,
        message: "Product created successfully. Awaiting admin approval.",
        data: product,
      });
    } catch (error) {
      console.error("Error creating product:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// PATCH approve product (admin only)
productrouter.patch(
  "/approve/:productId",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const { productId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const product = await Product.findByIdAndUpdate(
        productId,
        { isApproved: true, status: "active" },
        { new: true, runValidators: true }
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Product approved successfully",
        data: product,
      });
    } catch (error) {
      console.error("Error approving product:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// GET all products belonging to the authenticated vendor
productrouter.get(
  "/vendor/my-products",
  authMiddleware,
  roleMiddleware("vendor"),
  async (req, res) => {
    try {
      const vendorId = req.user.id;
      const products = await Product.find({
        $or: [
          { vendor_id: vendorId },
          { "seller.id": vendorId },
        ],
      }).sort({ createdAt: -1 });

      const normalized = products.map((p) => {
        const doc = p.toObject ? p.toObject() : p;
        const displayName = doc.name || doc.title || "Untitled Product";
        const displayImage =
          doc.image ||
          (Array.isArray(doc.images) && doc.images[0]) ||
          "";

        return {
          ...doc,
          name: displayName,
          title: displayName,
          image: displayImage,
          images: Array.isArray(doc.images) && doc.images.length > 0 ? doc.images : (displayImage ? [displayImage] : []),
          price: doc.price || 0,
          originalPrice: doc.originalPrice || Math.round((doc.price || 0) * 1.25),
          stock: typeof doc.stock === "number" ? doc.stock : 0,
          category: doc.category || "General",
          brand: doc.brand || "MarketNest Curated",
          status: doc.status || "active",
          isApproved: doc.isApproved ?? true,
        };
      });

      res.status(200).json({
        success: true,
        count: normalized.length,
        data: normalized,
      });
    } catch (error) {
      console.error("Error fetching vendor products:", error);
      res.status(500).json({ success: false, message: "Failed to fetch vendor products" });
    }
  }
);

// PUT update vendor product
productrouter.put(
  "/:id",
  authMiddleware,
  roleMiddleware("vendor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const vendorId = req.user.id;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }

      const existingProduct = await Product.findById(id);
      if (!existingProduct) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      const isOwner =
        (existingProduct.vendor_id && existingProduct.vendor_id.toString() === vendorId) ||
        (existingProduct.seller && existingProduct.seller.id === vendorId);

      if (!isOwner) {
        return res.status(403).json({ success: false, message: "Not authorized to update this product" });
      }

      const { name, title, price, originalPrice, description, image, images, category, stock, brand, status } = req.body;
      const productName = name || title || existingProduct.name;

      existingProduct.name = productName;
      existingProduct.title = productName;
      if (price !== undefined) existingProduct.price = Number(price);
      if (originalPrice !== undefined) existingProduct.originalPrice = Number(originalPrice);
      if (description !== undefined) existingProduct.description = description;
      if (image !== undefined) existingProduct.image = image;
      if (images !== undefined) existingProduct.images = images;
      if (category !== undefined) existingProduct.category = category;
      if (stock !== undefined) existingProduct.stock = Number(stock);
      if (brand !== undefined) existingProduct.brand = brand;
      if (status !== undefined) existingProduct.status = status;

      await existingProduct.save();

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
        data: existingProduct,
      });
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ success: false, message: "Failed to update product" });
    }
  }
);

// PATCH update product stock directly (Inventory Management)
productrouter.patch(
  "/:id/stock",
  authMiddleware,
  roleMiddleware("vendor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const vendorId = req.user.id;
      const { stock } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }

      if (stock === undefined || isNaN(stock) || Number(stock) < 0) {
        return res.status(400).json({ success: false, message: "Valid positive stock quantity required" });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      const isOwner =
        (product.vendor_id && product.vendor_id.toString() === vendorId) ||
        (product.seller && product.seller.id === vendorId);

      if (!isOwner) {
        return res.status(403).json({ success: false, message: "Not authorized to update this product stock" });
      }

      product.stock = Number(stock);
      await product.save();

      res.status(200).json({
        success: true,
        message: "Stock updated successfully",
        data: { id: product._id, stock: product.stock },
      });
    } catch (error) {
      console.error("Error updating stock:", error);
      res.status(500).json({ success: false, message: "Failed to update stock" });
    }
  }
);

// DELETE vendor product
productrouter.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("vendor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const vendorId = req.user.id;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      const isOwner =
        (product.vendor_id && product.vendor_id.toString() === vendorId) ||
        (product.seller && product.seller.id === vendorId);

      if (!isOwner) {
        return res.status(403).json({ success: false, message: "Not authorized to delete this product" });
      }

      await Product.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ success: false, message: "Failed to delete product" });
    }
  }
);

export default productrouter;

