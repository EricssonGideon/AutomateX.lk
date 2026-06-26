const mongoose = require("mongoose");

const STATUS_TO_PAYMENT_STATUS = {
  draft: "Unpaid",
  sent: "Unpaid",
  paid: "Paid",
  partial: "Partial",
  overdue: "Overdue",
  cancelled: "Cancelled"
};

const itemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
      trim: true
    },
    description: {
      type: String,
      default: "",
      trim: true
    },
    type: {
      type: String,
      enum: ["Main Package", "Extra Feature", "Service", "Maintenance", "Support", "Discount Adjustment", "Custom"],
      default: "Service"
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0
    },
    unitPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      default: 0,
      min: 0
    },
    amount: {
      type: Number,
      default: 0,
      min: 0
    },
    itemDiscount: {
      type: Number,
      default: 0,
      min: 0
    },
    lineSubtotal: {
      type: Number,
      default: 0,
      min: 0
    },
    lineDiscount: {
      type: Number,
      default: 0,
      min: 0
    },
    lineTotal: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    _id: false
  }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true
    },
    maintenancePlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaintenancePlan",
      default: null,
      index: true
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true
    },
    salesExecutiveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesExecutive",
      default: null,
      index: true
    },
    clientName: {
      type: String,
      required: true,
      trim: true
    },
    clientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    businessName: {
      type: String,
      default: "",
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    invoiceType: {
      type: String,
      enum: [
        "Project",
        "Maintenance",
        "Upgrade",
        "Custom",
        "Full Payment Invoice",
        "Advance / Partial Payment Invoice",
        "Final Payment Invoice",
        "Maintenance Invoice",
        "Extra Features / Add-on Invoice",
        "Custom Invoice"
      ],
      default: "Custom Invoice",
      index: true
    },
    modelPackage: {
      type: String,
      enum: [
        "Website Starter",
        "Website Standard",
        "Website Premium",
        "POS Starter",
        "POS Standard",
        "POS Premium",
        "Business System",
        "Custom Software",
        "Maintenance Plan",
        "Extra Feature / Add-on",
        "Custom"
      ],
      default: "Custom",
      index: true
    },
    customModelPackage: {
      type: String,
      default: "",
      trim: true
    },
    description: {
      type: String,
      default: "",
      trim: true
    },
    items: {
      type: [itemSchema],
      default: []
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    overallDiscountType: {
      type: String,
      enum: ["none", "fixed", "percentage"],
      default: "none"
    },
    overallDiscountValue: {
      type: Number,
      default: 0,
      min: 0
    },
    itemDiscountTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    tax: {
      type: Number,
      default: 0,
      min: 0
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    balanceAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    currency: {
      type: String,
      default: "LKR",
      trim: true,
      uppercase: true
    },
    status: {
      type: String,
      enum: ["draft", "sent", "paid", "partial", "overdue", "cancelled"],
      default: "draft",
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Partial", "Paid", "Overdue", "Cancelled"],
      default: "Unpaid",
      index: true
    },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Bank Transfer", "Online", "Card", "Other"],
      default: "Other"
    },
    issueDate: {
      type: Date,
      default: Date.now
    },
    dueDate: {
      type: Date,
      default: null,
      index: true
    },
    paidDate: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      default: "",
      trim: true
    },
    paymentNotes: {
      type: String,
      default: "",
      trim: true
    },
    clientNotes: {
      type: String,
      default: "",
      trim: true
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true
    },
    emailStatus: {
      type: String,
      enum: ["Not Sent", "Sent", "Failed"],
      default: "Not Sent",
      index: true
    },
    lastEmailSentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

invoiceSchema.pre("validate", function syncInvoiceAliases(next) {
  this.items = (this.items || []).map((item) => {
    const description = item.description || item.name || "";
    const name = item.name || description;
    const quantity = Number.isFinite(Number(item.quantity)) ? Math.max(0, Number(item.quantity)) : 0;
    const unitPrice = Number.isFinite(Number(item.unitPrice)) ? Math.max(0, Number(item.unitPrice)) : 0;
    const lineSubtotal = Number.isFinite(Number(item.lineSubtotal))
      ? Math.max(0, Number(item.lineSubtotal))
      : Math.max(0, quantity * unitPrice);
    const lineDiscount = Number.isFinite(Number(item.lineDiscount || item.itemDiscount))
      ? Math.min(lineSubtotal, Math.max(0, Number(item.lineDiscount || item.itemDiscount)))
      : 0;
    const total = Number.isFinite(Number(item.total || item.lineTotal))
      ? Math.max(0, Number(item.total || item.lineTotal))
      : Math.max(0, lineSubtotal - lineDiscount);
    const amount = Number.isFinite(Number(item.amount)) ? Math.max(0, Number(item.amount)) : total;

    const plainItem = item && typeof item.toObject === "function" ? item.toObject() : item;

    return {
      ...plainItem,
      name,
      description,
      type: plainItem.type || "Service",
      quantity,
      unitPrice,
      itemDiscount: lineDiscount,
      lineSubtotal,
      lineDiscount,
      lineTotal: total,
      total,
      amount
    };
  });
  this.taxAmount = this.tax;
  this.itemDiscountTotal = (this.items || []).reduce((sum, item) => sum + (Number(item.lineDiscount) || 0), 0);
  this.balanceAmount = this.balance;
  this.paymentStatus = STATUS_TO_PAYMENT_STATUS[this.status] || this.paymentStatus || "Unpaid";
  if (!this.clientNotes && this.notes) {
    this.clientNotes = this.notes;
  }
  next();
});

module.exports = mongoose.model("Invoice", invoiceSchema);
