import express from "express";
import Order from "../model/Order.js";
import Product from "../model/Product.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import mongoose from "mongoose";

const orderRouter = express.Router();

// GET all orders for the authenticated user
orderRouter.get("/my-orders", authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
});

// GET single order details by ID
orderRouter.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    let order;

    if (mongoose.isValidObjectId(id)) {
      order = await Order.findById(id);
    } else {
      order = await Order.findOne({ orderNumber: id });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Authorization: User must own the order or be an admin
    if (order.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Not authorized to view this order" });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error("Error fetching single order:", error);
    res.status(500).json({ success: false, message: "Failed to fetch order details" });
  }
});

// POST create new order with strict stock and price validation
orderRouter.post("/", authMiddleware, async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod = "COD" } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart items are required" });
    }

    if (!shippingAddress || !shippingAddress.name || !shippingAddress.line1 || !shippingAddress.city || !shippingAddress.pincode) {
      return res.status(400).json({ success: false, message: "Complete shipping address is required" });
    }

    let calculatedSubtotal = 0;
    const validatedItems = [];

    // Validate each product against live database records
    for (const cartItem of items) {
      const prodId = cartItem.product || cartItem._id;
      let dbProduct;

      if (mongoose.isValidObjectId(prodId)) {
        dbProduct = await Product.findById(prodId);
      } else {
        dbProduct = await Product.findOne({ id: prodId });
      }

      if (!dbProduct) {
        return res.status(404).json({
          success: false,
          message: `Product "${cartItem.title || cartItem.name || 'Unknown'}" is no longer available`,
        });
      }

      const requestedQty = Math.max(1, parseInt(cartItem.quantity) || 1);
      const availableStock = typeof dbProduct.stock === "number" ? dbProduct.stock : 10;

      if (availableStock < requestedQty) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${dbProduct.name || dbProduct.title}". Only ${availableStock} left.`,
        });
      }

      // Decrement stock safely
      if (typeof dbProduct.stock === "number") {
        dbProduct.stock = Math.max(0, dbProduct.stock - requestedQty);
        await dbProduct.save();
      }

      const itemPrice = dbProduct.price || cartItem.price;
      const itemTitle = dbProduct.name || dbProduct.title || cartItem.title || cartItem.name;
      const itemImage =
        dbProduct.image ||
        (Array.isArray(dbProduct.images) && dbProduct.images[0]) ||
        cartItem.image ||
        "";

      calculatedSubtotal += itemPrice * requestedQty;

      validatedItems.push({
        product: dbProduct._id,
        title: itemTitle,
        price: itemPrice,
        quantity: requestedQty,
        image: itemImage,
        seller: dbProduct.seller || { name: dbProduct.brand || "MarketNest Artisan" },
        status: "placed",
      });
    }

    // Shipping and discount rules
    const shippingFee = calculatedSubtotal >= 999 ? 0 : 99;
    const discount = calculatedSubtotal >= 2500 ? Math.round(calculatedSubtotal * 0.1) : 0;
    const finalTotal = calculatedSubtotal + shippingFee - discount;

    const orderNumber = `MN-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Estimated delivery: 4 days from now
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 4);

    const newOrder = await Order.create({
      orderNumber,
      user: req.user.id,
      items: validatedItems,
      shippingAddress: {
        name: shippingAddress.name.trim(),
        phone: shippingAddress.phone ? shippingAddress.phone.trim() : "",
        email: shippingAddress.email ? shippingAddress.email.trim() : "",
        line1: shippingAddress.line1.trim(),
        line2: shippingAddress.line2 ? shippingAddress.line2.trim() : "",
        city: shippingAddress.city.trim(),
        state: shippingAddress.state ? shippingAddress.state.trim() : "State",
        pincode: shippingAddress.pincode.trim(),
        landmark: shippingAddress.landmark ? shippingAddress.landmark.trim() : "",
      },
      subtotal: calculatedSubtotal,
      discount,
      shippingFee,
      total: finalTotal,
      paymentMethod,
      paymentStatus: paymentMethod === "COD" ? "pending" : "completed",
      status: "placed",
      statusHistory: [
        {
          status: "placed",
          title: "Order Placed",
          message: "Order placed successfully by customer.",
          timestamp: new Date(),
          updatedBy: "Customer",
        },
      ],
      estimatedDeliveryDate: deliveryDate,
    });

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: newOrder,
    });
  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to place order" });
  }
});

// PATCH cancel order
orderRouter.patch("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    let order;
    if (mongoose.isValidObjectId(id)) {
      order = await Order.findById(id);
    } else {
      order = await Order.findOne({ orderNumber: id });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Not authorized to cancel this order" });
    }

    if (["shipped", "delivered", "cancelled"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled in "${order.status}" status`,
      });
    }

    // Restore inventory
    for (const item of order.items) {
      if (item.product && mongoose.isValidObjectId(item.product)) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity },
        });
      }
    }

    order.status = "cancelled";
    order.cancellationReason = reason || "Cancelled by customer";
    if (order.paymentStatus === "completed") {
      order.paymentStatus = "refunded";
    }

    if (!Array.isArray(order.statusHistory)) {
      order.statusHistory = [];
    }
    order.statusHistory.push({
      status: "cancelled",
      title: "Order Cancelled",
      message: order.cancellationReason,
      timestamp: new Date(),
      updatedBy: req.user.role === "admin" ? "Admin" : "Customer",
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully and inventory restored",
      data: order,
    });
  } catch (error) {
    console.error("Order cancellation error:", error);
    res.status(500).json({ success: false, message: "Failed to cancel order" });
  }
});

// GET orders containing items for the authenticated vendor
orderRouter.get(
  "/vendor/my-orders",
  authMiddleware,
  roleMiddleware("vendor"),
  async (req, res) => {
    try {
      const vendorId = req.user.id;
      const vendorUser = await mongoose.model("User").findById(vendorId);

      // Find all orders where at least one item belongs to this vendor
      // Check seller.id, seller.name, or matching product.vendor_id
      const allOrders = await Order.find().sort({ createdAt: -1 });

      const vendorOrders = [];

      for (const order of allOrders) {
        // Filter items that belong to this vendor
        const myItems = [];
        let vendorSubtotal = 0;

        for (const item of order.items) {
          let belongsToVendor = false;

          if (item.seller && (item.seller.id === vendorId || item.seller._id === vendorId)) {
            belongsToVendor = true;
          } else if (vendorUser && item.seller && item.seller.name && item.seller.name === vendorUser.name) {
            belongsToVendor = true;
          } else if (item.product) {
            const prod = await Product.findById(item.product);
            if (prod && (prod.vendor_id?.toString() === vendorId || prod.seller?.id === vendorId)) {
              belongsToVendor = true;
            }
          }

          if (belongsToVendor) {
            myItems.push(item);
            vendorSubtotal += (item.price || 0) * (item.quantity || 1);
          }
        }

        if (myItems.length > 0) {
          const doc = order.toObject();
          vendorOrders.push({
            ...doc,
            vendorItems: myItems,
            vendorSubtotal,
            // Fulfilment status reflects the state of this vendor's items
            vendorFulfilmentStatus: myItems.every(i => i.status === "delivered")
              ? "delivered"
              : myItems.some(i => i.status === "shipped")
              ? "shipped"
              : myItems.some(i => i.status === "processing")
              ? "processing"
              : myItems.every(i => i.status === "cancelled")
              ? "cancelled"
              : "placed",
          });
        }
      }

      res.status(200).json({
        success: true,
        count: vendorOrders.length,
        data: vendorOrders,
      });
    } catch (error) {
      console.error("Error fetching vendor orders:", error);
      res.status(500).json({ success: false, message: "Failed to fetch vendor orders" });
    }
  }
);

// PATCH update status for a vendor's item in an order
orderRouter.patch(
  "/vendor/orders/:orderId/status",
  authMiddleware,
  roleMiddleware("vendor"),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      const vendorId = req.user.id;

      if (!["processing", "shipped", "delivered"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status transition. Allowed: processing, shipped, delivered",
        });
      }

      let order;
      if (mongoose.isValidObjectId(orderId)) {
        order = await Order.findById(orderId);
      } else {
        order = await Order.findOne({ orderNumber: orderId });
      }

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      const vendorUser = await mongoose.model("User").findById(vendorId);
      let updatedCount = 0;

      for (const item of order.items) {
        let isVendorItem = false;
        if (item.seller && (item.seller.id === vendorId || item.seller._id === vendorId)) {
          isVendorItem = true;
        } else if (vendorUser && item.seller && item.seller.name && item.seller.name === vendorUser.name) {
          isVendorItem = true;
        } else if (item.product) {
          const prod = await Product.findById(item.product);
          if (prod && (prod.vendor_id?.toString() === vendorId || prod.seller?.id === vendorId)) {
            isVendorItem = true;
          }
        }

        if (isVendorItem) {
          item.status = status;
          updatedCount++;
        }
      }

      if (updatedCount === 0) {
        return res.status(403).json({
          success: false,
          message: "No items belonging to this vendor found in order",
        });
      }

      const previousStatus = order.status;
      // If all items in the order now have this status or are delivered, update overall status
      const allItemStatuses = order.items.map(i => i.status);
      if (allItemStatuses.every(s => s === "delivered")) {
        order.status = "delivered";
      } else if (allItemStatuses.some(s => s === "shipped")) {
        order.status = "shipped";
      } else if (allItemStatuses.some(s => s === "processing")) {
        order.status = "processing";
      }

      if (!Array.isArray(order.statusHistory)) {
        order.statusHistory = [];
      }

      // Add to status history if overall status changed or vendor updated
      if (order.status !== previousStatus || !order.statusHistory.some(h => h.status === status)) {
        const titleMap = {
          processing: "Packed & Processing",
          shipped: "Shipped",
          delivered: "Delivered",
        };
        order.statusHistory.push({
          status: order.status,
          title: titleMap[order.status] || order.status,
          message: `Order status advanced to ${order.status} by seller ${vendorUser?.name || ""}.`,
          timestamp: new Date(),
          updatedBy: vendorUser?.name ? `Vendor (${vendorUser.name})` : "Vendor",
        });
      }

      await order.save();

      res.status(200).json({
        success: true,
        message: `Order status updated to ${status}`,
        data: order,
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ success: false, message: "Failed to update order status" });
    }
  }
);

export default orderRouter;

