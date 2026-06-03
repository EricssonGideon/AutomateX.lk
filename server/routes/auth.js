const express = require("express");

const {
  signupValidators,
  loginValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  signup,
  login,
  forgotPassword,
  resetPassword,
  logout,
  me,
  updateProfileValidators,
  updateMe
} = require("../controllers/authController");
const { verifyToken, requireClient } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/signup", authLimiter, signupValidators, signup);
router.post("/login", authLimiter, loginValidators, login);
router.post("/forgot-password", authLimiter, forgotPasswordValidators, forgotPassword);
router.post("/reset-password", authLimiter, resetPasswordValidators, resetPassword);
router.post("/logout", logout);
router.get("/me", verifyToken, me);
router.patch("/me", verifyToken, requireClient, updateProfileValidators, updateMe);

module.exports = router;
