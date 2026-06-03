const assert = require("node:assert/strict");
const test = require("node:test");

const Invoice = require("../../server/models/Invoice");
const { addInvoicePayment } = require("../../server/controllers/adminController");

const VALID_ID = "507f1f77bcf86cd799439011";
const originalFindById = Invoice.findById;

test.afterEach(() => {
  Invoice.findById = originalFindById;
});

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createRequest({ id = VALID_ID, amount } = {}) {
  return {
    params: { id },
    body: {
      amount,
      paymentMethod: "Bank Transfer"
    },
    user: {
      id: "507f1f77bcf86cd799439012",
      role: "admin",
      email: "admin@example.com"
    }
  };
}

function createInvoice(overrides = {}) {
  return {
    _id: VALID_ID,
    invoiceNumber: "INV-TEST",
    clientId: "507f1f77bcf86cd799439013",
    status: "sent",
    items: [
      {
        name: "Project work",
        quantity: 1,
        unitPrice: 100,
        total: 100
      }
    ],
    discount: 0,
    tax: 0,
    totalAmount: 100,
    paidAmount: 90,
    balance: 10,
    balanceAmount: 10,
    paymentMethod: "Bank Transfer",
    paymentNotes: "",
    saveCalled: false,
    async save() {
      this.saveCalled = true;
    },
    ...overrides
  };
}

test("recording an invoice payment rejects invalid invoice IDs", async () => {
  const res = createResponse();

  await addInvoicePayment(createRequest({ id: "not-a-valid-id", amount: 10 }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid invoice ID.");
});

test("recording an invoice payment rejects zero or negative amounts", async () => {
  const invoice = createInvoice();
  Invoice.findById = async () => invoice;
  const res = createResponse();

  await addInvoicePayment(createRequest({ amount: 0 }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Enter a valid payment amount.");
  assert.equal(invoice.saveCalled, false);
});

test("recording an invoice payment rejects overpayments", async () => {
  const invoice = createInvoice();
  Invoice.findById = async () => invoice;
  const res = createResponse();

  await addInvoicePayment(createRequest({ amount: 20 }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Payment amount cannot exceed the remaining invoice balance.");
  assert.equal(invoice.saveCalled, false);
});
