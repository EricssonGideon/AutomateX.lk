const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "employee-sales-test-secret";

const AuditLog = require("../../server/models/AuditLog");
const Lead = require("../../server/models/Lead");
const SalesExecutive = require("../../server/models/SalesExecutive");
const {
  calculateTargetCommission,
  updateAdminLeadPaymentApproval
} = require("../../server/controllers/salesController");
const { updateEmployeeLead } = require("../../server/controllers/employeeController");

const EXECUTIVE_ID = "507f1f77bcf86cd799439011";
const EMPLOYEE_USER_ID = "507f1f77bcf86cd799439012";
const LEAD_ID = "507f1f77bcf86cd799439013";

const originalSalesExecutiveFindOne = SalesExecutive.findOne;
const originalLeadFindOne = Lead.findOne;
const originalLeadFindById = Lead.findById;
const originalAuditLogCreate = AuditLog.create;

test.afterEach(() => {
  SalesExecutive.findOne = originalSalesExecutiveFindOne;
  Lead.findOne = originalLeadFindOne;
  Lead.findById = originalLeadFindById;
  AuditLog.create = originalAuditLogCreate;
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

function createEmployeeRequest(overrides = {}) {
  return {
    params: { id: LEAD_ID },
    body: {},
    headers: {},
    user: {
      id: EMPLOYEE_USER_ID,
      role: "employee",
      email: "sales@example.com"
    },
    ...overrides
  };
}

function createAdminRequest(overrides = {}) {
  return {
    params: { id: LEAD_ID },
    body: {},
    headers: {},
    user: {
      id: "507f1f77bcf86cd799439014",
      role: "admin",
      email: "admin@example.com"
    },
    get() {
      return "";
    },
    ...overrides
  };
}

function mockExecutive() {
  SalesExecutive.findOne = (query) => ({
    lean: async () => {
      assert.equal(String(query.userId), EMPLOYEE_USER_ID);
      assert.equal(query.status, "Active");
      return {
        _id: EXECUTIVE_ID,
        userId: EMPLOYEE_USER_ID,
        fullName: "Sales Employee",
        status: "Active",
        isArchived: false
      };
    }
  });
}

test("target commission follows approved paid client thresholds", () => {
  const rules = {
    baseTargetClientsPerMonth: 3,
    baseCommissionAmount: 15000,
    extraClientCommission: 5000
  };

  assert.equal(calculateTargetCommission(0, rules).estimatedCommission, 0);
  assert.equal(calculateTargetCommission(1, rules).estimatedCommission, 0);
  assert.equal(calculateTargetCommission(2, rules).estimatedCommission, 0);
  assert.equal(calculateTargetCommission(3, rules).estimatedCommission, 15000);
  assert.equal(calculateTargetCommission(4, rules).estimatedCommission, 20000);
  assert.equal(calculateTargetCommission(5, rules).estimatedCommission, 25000);
});

test("employee lead update is scoped to the employee sales profile and ignores approval fields", async () => {
  mockExecutive();

  let capturedLeadQuery = null;
  const lead = {
    _id: LEAD_ID,
    salesExecutiveId: EXECUTIVE_ID,
    contactPerson: "Old Client",
    businessName: "Old Business",
    phone: "0710000000",
    email: "",
    businessType: "",
    interestedService: "Website",
    estimatedBudget: 0,
    status: "New Lead",
    followUpDate: null,
    notes: "",
    approvalStatus: "pending",
    paymentReceived: false,
    amountReceived: 125000,
    packageSold: "Website",
    paymentDate: new Date("2026-06-10T00:00:00.000Z"),
    isArchived: false,
    toObject() {
      return { ...this };
    },
    async save() {}
  };

  Lead.findOne = async (query) => {
    capturedLeadQuery = query;
    return lead;
  };

  const res = createResponse();
  await updateEmployeeLead(createEmployeeRequest({
    body: {
      clientName: "New Client",
      businessName: "New Business",
      phone: "0720000000",
      approvalStatus: "approved",
      paymentReceived: true,
      amountReceived: 999999,
      packageSold: "Changed by employee"
    }
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedLeadQuery, {
    _id: LEAD_ID,
    salesExecutiveId: EXECUTIVE_ID,
    isArchived: false
  });
  assert.equal(lead.contactPerson, "New Client");
  assert.equal(lead.approvalStatus, "pending");
  assert.equal(lead.paymentReceived, false);
  assert.equal(lead.amountReceived, 125000);
  assert.equal(lead.packageSold, "Website");
});

test("employee cannot edit another employee lead", async () => {
  mockExecutive();

  let capturedLeadQuery = null;
  Lead.findOne = async (query) => {
    capturedLeadQuery = query;
    return null;
  };

  const res = createResponse();
  await updateEmployeeLead(createEmployeeRequest({
    body: {
      clientName: "Client",
      phone: "0710000000"
    }
  }), res);

  assert.equal(res.statusCode, 404);
  assert.equal(capturedLeadQuery.salesExecutiveId, EXECUTIVE_ID);
});

test("admin quick approval preserves submitted payment amount and requires positive amount", async () => {
  const lead = {
    _id: LEAD_ID,
    businessName: "Approved Business",
    contactPerson: "Client",
    salesExecutiveId: EXECUTIVE_ID,
    approvalStatus: "pending",
    paymentReceived: false,
    amountReceived: 85000,
    packageSold: "Website",
    paymentDate: new Date("2026-06-15T00:00:00.000Z"),
    isArchived: false,
    toObject() {
      return { ...this };
    },
    async save() {}
  };

  Lead.findOne = async () => lead;
  Lead.findById = () => ({
    populate() {
      return this;
    },
    lean: async () => lead
  });
  AuditLog.create = async () => ({});

  const res = createResponse();
  await updateAdminLeadPaymentApproval(createAdminRequest({
    body: {
      approvalStatus: "approved",
      paymentReceived: true
    }
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(lead.approvalStatus, "approved");
  assert.equal(lead.paymentReceived, true);
  assert.equal(lead.amountReceived, 85000);
  assert.equal(lead.status, "Paid / Closed");
});

test("admin cannot approve paid client with zero amount received", async () => {
  const lead = {
    _id: LEAD_ID,
    businessName: "No Amount Business",
    contactPerson: "Client",
    approvalStatus: "pending",
    amountReceived: 0,
    paymentReceived: false,
    toObject() {
      return { ...this };
    }
  };

  Lead.findOne = async () => lead;

  const res = createResponse();
  await updateAdminLeadPaymentApproval(createAdminRequest({
    body: {
      approvalStatus: "approved",
      paymentReceived: true
    }
  }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Amount received/);
});
