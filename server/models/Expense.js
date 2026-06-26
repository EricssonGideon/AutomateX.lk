const mongoose = require("mongoose");

const EXPENSE_CATEGORIES = [
  "Software",
  "Hosting",
  "Domain",
  "Ads / Marketing",
  "Travel",
  "Food / Meeting",
  "Office",
  "Salary / Commission",
  "Client Work",
  "Other"
];

const EXPENSE_PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "Card",
  "Online",
  "Other"
];

const expenseSchema = new mongoose.Schema(
  {
    expenseDate: {
      type: Date,
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: EXPENSE_PAYMENT_METHODS,
      default: "Cash"
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ category: 1, expenseDate: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
module.exports.EXPENSE_PAYMENT_METHODS = EXPENSE_PAYMENT_METHODS;
