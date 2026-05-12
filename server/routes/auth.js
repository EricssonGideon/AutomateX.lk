const express = require("express");

const {
  signupValidators,
  loginValidators,
  signup,
  login,
  logout,
  me,
  updateProfileValidators,
  updateMe
} = require("../controllers/authController");
const { verifyToken, requireClient } = require("../middleware/auth");

const router = express.Router();

router.post("/signup", signupValidators, signup);
router.post("/login", loginValidators, login);
router.post("/logout", logout);
router.get("/me", verifyToken, me);
router.patch("/me", verifyToken, requireClient, updateProfileValidators, updateMe);

module.exports = router;
