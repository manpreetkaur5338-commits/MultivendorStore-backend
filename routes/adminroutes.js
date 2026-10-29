import express from "express";
import mongoose from "mongoose";
import User from "../model/User.js";
import Product from "../model/Product.js";
import Order from "../model/Order.js";
import Category from "../model/Category.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const adminRouter = express.Router();

// Apply auth and admin-role verification to all admin endpoints
adminRouter.use(authMiddleware, roleMiddleware("admin"));

/**
 * 1. GET /api/admin/dashboard/stats
 * Real marketplace metrics computed directly from database
 */
adminRouter.get("/dashboard/stats", async (req, res) => {
  try {
    const [
      totalProducts,
      totalOrders,
      totalCustomers,
      totalVendors,
      pendingVendors,
      pendingProducts,
      pendingOrders,
      cancelledOrders,
      deliveredOrders,
      ordersAgg,
    ] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "vendor" }),
      User.countDocuments({ role: "vendor", isApproved: false }),
      Product.countDocuments({ isApproved: false }),
      Order.countDocuments({ status: "placed" }),
      Order.countDocuments({ status: "cancelled" }),
      Order.countDocuments({ status: "delivered" }),
      Order.aggregate([
        {
          $group: {
            _id: null,
            grossSales: { $sum: "$total" },
            subtotal: { $sum: "$subtotal" },
            discount: { $sum: "$discount" },
            shippingFee: { $sum: "$shippingFee" },
            // Captured payments (paymentStatus === 'completed')
            capturedSales: {
              $sum: {
                $cond: [{ $eq: ["$paymentStatus", "completed"] }, "$total", 0],
              },
            },
            // Refunded payments
            refundedSales: {
              $sum: {
                $cond: [{ $eq: ["$paymentStatus", "refunded"] }, "$total", 0],
              },
            },
          },
        },
      ]),
    ]);

    const salesStats = ordersAgg[0] || {
      grossSales: 0,
      subtotal: 0,
      discount: 0,
      shippingFee: 0,
      capturedSales: 0,
      refundedSales: 0,
    };

    // Platform Commission estimated at 10% marketplace fee on gross sales
    const estimatedCommission = Math.round(salesStats.grossSales * 0.1);

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        totalCustomers,
        totalVendors,
        pendingVendors,
        pendingProducts,
        pendingOrders,
        cancelledOrders,
        deliveredOrders,
        grossSales: salesStats.grossSales,
        subtotal: salesStats.subtotal,
        discount: salesStats.discount,
        shippingFee: salesStats.shippingFee,
        capturedSales: salesStats.capturedSales,
        refundedSales: salesStats.refundedSales,
        netSales: salesStats.grossSales - salesStats.refundedSales,
        marketplaceCommission: estimatedCommission,
      },
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    res.status(500).json({ success: false, message: "Failed to compute stats", error: error.message });
  }
});

/**
 * 2. GET /api/admin/analytics
 * Real aggregated sales & orders over time, order status breakdown, category distribution
 */
adminRouter.get("/analytics", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    // Daily Sales & Orders Trend
    const dailyTrend = await Order.aggregate([
      { $match: { createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$total" },
          ordersCount: { $sum: 1 },
          capturedRevenue: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "completed"] }, "$total", 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Order Status Distribution
    const orderStatusDist = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalValue: { $sum: "$total" },
        },
      },
    ]);

    // Payment Status Distribution
    const paymentStatusDist = await Order.aggregate([
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          totalValue: { $sum: "$total" },
        },
      },
    ]);

    // Category Distribution (Product counts by category)
    const categoryDist = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // User Registrations over time (last 30 days)
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            role: "$role",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        dailyTrend,
        orderStatusDist,
        paymentStatusDist,
        categoryDist,
        userGrowth,
      },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    res.status(500).json({ success: false, message: "Failed to compute analytics", error: error.message });
  }
});

/**
 * 3. GET /api/admin/orders
 * Paginated and searchable orders with full details
 */
adminRouter.get("/orders", async (req, res) => {
  try {
    const { page = 1, limit = 20, status, paymentStatus, search } = req.query;
    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (paymentStatus && paymentStatus !== "all") {
      query.paymentStatus = paymentStatus;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { orderNumber: searchRegex },
        { "shippingAddress.name": searchRegex },
        { "shippingAddress.email": searchRegex },
        { "shippingAddress.city": searchRegex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate("user", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: orders.length,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: orders,
    });
  } catch (error) {
    console.error("Admin get orders error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
});

/**
 * 4. PATCH /api/admin/orders/:id/status
 * Update order and payment status with audit validation
 */
adminRouter.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, notes } = req.body;

    let order;
    if (mongoose.isValidObjectId(id)) {
      order = await Order.findById(id);
    } else {
      order = await Order.findOne({ orderNumber: id });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const validStatuses = [
      "placed",
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ];
    const validPaymentStatuses = ["pending", "completed", "failed", "refunded"];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid order status value" });
    }

    if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "Invalid payment status value" });
    }

    const previousStatus = order.status;

    if (status) {
      order.status = status;
      // Also sync item status if applicable
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          item.status = status;
        });
      }

      if (!Array.isArray(order.statusHistory)) {
        order.statusHistory = [];
      }

      if (previousStatus !== status) {
        const titleMap = {
          placed: "Order Placed",
          confirmed: "Order Confirmed",
          processing: "Processing / Packed",
          packed: "Processing / Packed",
          shipped: "Shipped",
          out_for_delivery: "Out for Delivery",
          delivered: "Delivered",
          cancelled: "Order Cancelled",
        };

        order.statusHistory.push({
          status,
          title: titleMap[status] || status,
          message: notes || `Order status updated to ${status} by administrator.`,
          timestamp: new Date(),
          updatedBy: "Admin",
        });
      }
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    if (notes) {
      order.adminNotes = notes;
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  } catch (error) {
    console.error("Admin update order status error:", error);
    res.status(500).json({ success: false, message: "Failed to update order status" });
  }
});

/**
 * 5. GET /api/admin/users
 * Customer & Vendor management list
 */
adminRouter.get("/users", async (req, res) => {
  try {
    const { role, search, page = 1, limit = 50, isApproved } = req.query;
    const query = {};

    if (role && role !== "all") {
      query.role = role;
    }

    if (isApproved !== undefined && isApproved !== "all") {
      query.isApproved = isApproved === "true";
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }, { city: regex }];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Enrich users with order stats if customer, or product stats if vendor
    const enrichedUsers = await Promise.all(
      users.map(async (u) => {
        const uObj = u.toObject();
        if (u.role === "customer") {
          const [orderCount, spendAgg] = await Promise.all([
            Order.countDocuments({ user: u._id }),
            Order.aggregate([
              { $match: { user: u._id } },
              { $group: { _id: null, totalSpent: { $sum: "$total" } } },
            ]),
          ]);
          uObj.orderCount = orderCount;
          uObj.totalSpent = spendAgg[0]?.totalSpent || 0;
        } else if (u.role === "vendor") {
          const prodCount = await Product.countDocuments({
            $or: [{ vendor_id: u._id }, { "seller.id": u._id.toString() }],
          });
          uObj.productCount = prodCount;
        }
        return uObj;
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedUsers.length,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: enrichedUsers,
    });
  } catch (error) {
    console.error("Admin get users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

/**
 * 6. PATCH /api/admin/users/:id/status
 * Vendor approval or suspension / account status toggle
 */
adminRouter.patch("/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved, isVerified, role } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isApproved !== undefined) user.isApproved = Boolean(isApproved);
    if (isVerified !== undefined) user.isVerified = Boolean(isVerified);
    if (role && ["customer", "vendor", "admin"].includes(role)) {
      user.role = role;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Admin update user error:", error);
    res.status(500).json({ success: false, message: "Failed to update user status" });
  }
});

/**
 * 7. GET /api/admin/products
 * Comprehensive product moderation list with full vendor info
 */
adminRouter.get("/products", async (req, res) => {
  try {
    const { page = 1, limit = 50, category, isApproved, search } = req.query;
    const query = {};

    if (category && category !== "all") {
      query.category = new RegExp(`^${category.trim()}$`, "i");
    }

    if (isApproved !== undefined && isApproved !== "all") {
      query.isApproved = isApproved === "true";
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: regex },
        { title: regex },
        { brand: regex },
        { category: regex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await Product.countDocuments(query);
    const rawProducts = await Product.find(query)
      .populate("vendor_id", "name email isApproved")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const products = rawProducts.map((p) => {
      const doc = p.toObject();
      const displayName = doc.name || doc.title || "Untitled Product";
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
        stock: typeof doc.stock === "number" ? doc.stock : 0,
        brand: doc.brand || "MarketNest Artisan",
        category: doc.category || "General",
        status: doc.status || "active",
        isApproved: doc.isApproved ?? true,
      };
    });

    res.status(200).json({
      success: true,
      count: products.length,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: products,
    });
  } catch (error) {
    console.error("Admin get products error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
});

/**
 * 8. PATCH /api/admin/products/:id/moderate
 * Admin approval, feature toggle, or deactivation
 */
adminRouter.patch("/products/:id/moderate", async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved, isFeatured, status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (isApproved !== undefined) product.isApproved = Boolean(isApproved);
    if (isFeatured !== undefined) product.isFeatured = Boolean(isFeatured);
    if (status && ["active", "draft", "archived"].includes(status)) {
      product.status = status;
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product moderated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Admin moderate product error:", error);
    res.status(500).json({ success: false, message: "Failed to moderate product" });
  }
});

/**
 * 9. DELETE /api/admin/products/:id
 * Admin delete product
 */
adminRouter.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.status(200).json({
      success: true,
      message: "Product removed from marketplace by administrator",
    });
  } catch (error) {
    console.error("Admin delete product error:", error);
    res.status(500).json({ success: false, message: "Failed to delete product" });
  }
});

/**
 * 10. POST /api/admin/categories
 * Admin create new category
 */
adminRouter.post("/categories", async (req, res) => {
  try {
    const { name, slug, description, image } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ success: false, message: "Category name and slug are required" });
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const existing = await Category.findOne({ $or: [{ slug: cleanSlug }, { id: cleanSlug }] });
    if (existing) {
      return res.status(400).json({ success: false, message: "Category with this slug already exists" });
    }

    const newCategory = await Category.create({
      id: cleanSlug,
      slug: cleanSlug,
      name: name.trim(),
      description: description ? description.trim() : "",
      image: image ? image.trim() : "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
      count: "0 items",
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: newCategory,
    });
  } catch (error) {
    console.error("Admin create category error:", error);
    res.status(500).json({ success: false, message: "Failed to create category" });
  }
});

/**
 * 11. PUT /api/admin/categories/:id
 * Admin update category
 */
adminRouter.put("/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image } = req.body;

    let cat;
    if (mongoose.isValidObjectId(id)) {
      cat = await Category.findById(id);
    } else {
      cat = await Category.findOne({ $or: [{ id: id }, { slug: id }] });
    }

    if (!cat) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    if (name) cat.name = name.trim();
    if (description !== undefined) cat.description = description.trim();
    if (image !== undefined) cat.image = image.trim();

    await cat.save();

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: cat,
    });
  } catch (error) {
    console.error("Admin update category error:", error);
    res.status(500).json({ success: false, message: "Failed to update category" });
  }
});

/**
 * 12. DELETE /api/admin/categories/:id
 * Admin delete category (verifies if products reference it)
 */
adminRouter.delete("/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;

    let cat;
    if (mongoose.isValidObjectId(id)) {
      cat = await Category.findById(id);
    } else {
      cat = await Category.findOne({ $or: [{ id: id }, { slug: id }] });
    }

    if (!cat) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // Check if any product references this category name or slug
    const productCount = await Product.countDocuments({
      category: new RegExp(`^${cat.name}$`, "i"),
    });

    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category: ${productCount} active products are currently assigned to it. Reassign products first.`,
      });
    }

    await Category.findByIdAndDelete(cat._id);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Admin delete category error:", error);
    res.status(500).json({ success: false, message: "Failed to delete category" });
  }
});

/**
 * 13. GET /api/admin/payments
 * Payments monitoring and transactions list
 */
adminRouter.get("/payments", async (req, res) => {
  try {
    const { page = 1, limit = 50, paymentStatus, paymentMethod } = req.query;
    const query = {};

    if (paymentStatus && paymentStatus !== "all") {
      query.paymentStatus = paymentStatus;
    }

    if (paymentMethod && paymentMethod !== "all") {
      query.paymentMethod = paymentMethod;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .select("orderNumber user total subtotal discount shippingFee paymentMethod paymentStatus razorpayOrderId razorpayPaymentId createdAt updatedAt")
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: orders.length,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: orders,
    });
  } catch (error) {
    console.error("Admin get payments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch payments" });
  }
});

export default adminRouter;

