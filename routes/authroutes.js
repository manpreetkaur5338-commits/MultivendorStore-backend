import express from "express";
import bcrypt from "bcryptjs";
import User from "../model/User.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import crypto from "crypto";
import PasswordResetOtp from "../model/PasswordResetOtp.js";
import { sendOtpEmail } from "../emailService.js";

import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
const router = express.Router();
router.get("/route-check",(req,res)=>{
res.json({
    success:true,
    message:"auth router is working"
})
});


router.post("/register", async (req, res) => {
    const { name, email, password, role, country, zip, phone, address, city, state } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!name || !email || !password || !role) {
            return res.status(400).json(
                {
                    success: false,
                    message: "All fields are required"
                });
        }
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }
        if (role && !["customer", "vendor"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role"
            });
        }
        const normalizedEmail = email.trim().toLowerCase()
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already registered",
            })
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: role || "customer",
            country: country || "India",
            zip: zip || "",
            phone: phone || "",
            address: address || "",
            city: city || "",
            state: state || ""
        });
        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Email already registered",
            })
        }
        console.error("registration error:", error);
        res.status(500).json({
            success: false,
            message: "Registration failed",
            error: error.message,
        });
    }
});
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWTSECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({
      success: true,
      message: "You are authenticated!",
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch profile", error: error.message });
  }
});

router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, city, state, zip, country } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (address !== undefined) updateData.address = address.trim();
    if (city !== undefined) updateData.city = city.trim();
    if (state !== undefined) updateData.state = state.trim();
    if (zip !== undefined) updateData.zip = zip.trim();
    if (country !== undefined) updateData.country = country.trim();

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update profile", error: error.message });
  }
});

router.get("/vendor-test",authMiddleware,roleMiddleware("vendor"),async(req,res)=>{
  res.status(200).json({
    success:true,
    message:"you are allowed to access vendor dashboard",
    user:req.user
  })
})
router.get("/admin-test",authMiddleware,roleMiddleware("admin"),async(req,res)=>{
  res.status(200).json({
    success:true,
    message:"you are allowed to access admin dashboard",
    user:req.user
  })
})
router.get("/customer-test",authMiddleware,roleMiddleware("customer"),
(req,res)=>{
  res.json({
    success:true,
    message:"you are allowed to access customer dashboard",
   
  })
 })
 router.patch(
  "/approve-vendor/:vendorId",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const { vendorId } = req.params;

      if (!mongoose.isValidObjectId(vendorId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendor ID"
        });
      }

      const vendor = await User.findById(vendorId);

      if (!vendor || vendor.role !== "vendor") {
        return res.status(404).json({
          success: false,
          message: "Vendor not found"
        });
      }

      vendor.isApproved = true;
      await vendor.save();

      return res.json({
        success: true,
        message: "Vendor approved successfully",
        vendor: {
          id: vendor._id,
          name: vendor.name,
          email: vendor.email,
          role: vendor.role,
          isApproved: vendor.isApproved
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to approve vendor"
      });
    }
  }
);

/**
 * Helper: Securely hash OTP using sha256 with salt
 */
const hashOtp = (otp, email) => {
  return crypto
    .createHmac("sha256", process.env.JWTSECRET || "marketnest-secret-salt")
    .update(`${otp}:${email.toLowerCase().trim()}`)
    .digest("hex");
};

/**
 * Step 1: POST /api/auth/forgot-password
 * Rate-limited request for a 6-digit OTP
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Rate limiting: check recent OTP requests within the last 60 seconds
    const recentOtp = await PasswordResetOtp.findOne({
      email: normalizedEmail,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
    });

    if (recentOtp) {
      return res.status(429).json({
        success: false,
        message: "A verification code was recently sent. Please wait at least 60 seconds before requesting another code.",
      });
    }

    // Delete any old pending OTPs for this email to invalidate prior codes
    await PasswordResetOtp.deleteMany({ email: normalizedEmail });

    // Look up user (Always return generic success to protect privacy)
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Generate cryptographically secure random 6-digit number
      const otpNumber = crypto.randomInt(100000, 999999).toString();
      const otpHash = hashOtp(otpNumber, normalizedEmail);

      // 10-minute expiration
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await PasswordResetOtp.create({
        email: normalizedEmail,
        otpHash,
        attempts: 0,
        expiresAt,
      });

      // Dispatch professional HTML email
      try {
        await sendOtpEmail({
          to: user.email,
          name: user.name,
          otp: otpNumber,
        });
      } catch (mailError) {
        console.error("Nodemailer error:", mailError.message);
        // Clean up OTP if mail sending failed
        await PasswordResetOtp.deleteMany({ email: normalizedEmail });
        return res.status(500).json({
          success: false,
          message: "Failed to dispatch verification email. Please check your email configuration.",
        });
      }
    }

    // Generic response prevents account enumeration
    return res.status(200).json({
      success: true,
      message: "If an account is associated with this email, a 6-digit verification code has been dispatched.",
    });
  } catch (error) {
    console.error("Forgot password request error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to process password reset request at this time.",
    });
  }
});

/**
 * Step 2: POST /api/auth/verify-reset-otp
 * Verifies 6-digit OTP and issues a short-lived, single-use reset authorization token
 */
router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and 6-digit OTP code are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message: "Verification code must be exactly 6 digits",
      });
    }

    const record = await PasswordResetOtp.findOne({ email: normalizedEmail });

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No active verification code found. Please request a new code.",
      });
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      await PasswordResetOtp.deleteOne({ _id: record._id });
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new code.",
      });
    }

    // Check max failed attempts (up to 5 attempts)
    if (record.attempts >= 5) {
      await PasswordResetOtp.deleteOne({ _id: record._id });
      return res.status(429).json({
        success: false,
        message: "Maximum verification attempts exceeded. Please request a new code.",
      });
    }

    // Compare hash with timing safety
    const candidateHash = hashOtp(cleanOtp, normalizedEmail);
    const candidateBuf = Buffer.from(candidateHash, "hex");
    const storedBuf = Buffer.from(record.otpHash, "hex");

    const isMatch = candidateBuf.length === storedBuf.length && crypto.timingSafeEqual(candidateBuf, storedBuf);

    if (!isMatch) {
      record.attempts += 1;
      await record.save();
      const remainingAttempts = 5 - record.attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`,
      });
    }

    // Generate single-use reset authorization token (valid for 15 minutes)
    const rawResetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(rawResetToken).digest("hex");

    // Invalidate the OTP so it cannot be reused, but keep token authorization
    record.isVerified = true;
    record.otpHash = "CONSUMED";
    record.resetTokenHash = resetTokenHash;
    record.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins to set password
    await record.save();

    return res.status(200).json({
      success: true,
      message: "Verification successful. You may now create your new password.",
      resetToken: rawResetToken,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify code at this time.",
    });
  }
});

/**
 * Step 3: POST /api/auth/reset-password
 * Sets new password using server-verified single-use resetToken
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, reset authorization token, and new password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const incomingHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const record = await PasswordResetOtp.findOne({
      email: normalizedEmail,
      isVerified: true,
      resetTokenHash: incomingHash,
    });

    if (!record) {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired reset session. Please restart the password reset process.",
      });
    }

    if (new Date() > record.expiresAt) {
      await PasswordResetOtp.deleteOne({ _id: record._id });
      return res.status(403).json({
        success: false,
        message: "Reset authorization has expired. Please restart the recovery process.",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      await PasswordResetOtp.deleteOne({ _id: record._id });
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Consume and delete the reset record immediately
    await PasswordResetOtp.deleteOne({ _id: record._id });

    return res.status(200).json({
      success: true,
      message: "Password reset successful! You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again.",
    });
  }
});

export default router;
