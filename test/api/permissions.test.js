const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "permissions-test-secret";

const {
  ROLE_PERMISSIONS,
  getRolePermissions,
  hasPermission,
  requireAdmin,
  requireAnyPermission,
  requireEmployee,
  requirePermission,
  requireRole,
  verifyToken
} = require("../../server/middleware/auth");

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

async function runMiddleware(middleware, user = null, headers = {}) {
  const req = { headers, user };
  const res = createResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, res };
}

test("verifyToken returns 401 when an admin route has no bearer token", async () => {
  const { nextCalled, res } = await runMiddleware(verifyToken);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Authentication token is required.");
});

test("client users are blocked before reaching admin report permissions", async () => {
  const { nextCalled, res } = await runMiddleware(requireAdmin, { role: "client" });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Admin access is required.");
});

test("employee users are blocked from admin routes and allowed through employee middleware", async () => {
  const employee = { role: "employee", email: "sales@example.com" };
  const adminDenied = await runMiddleware(requireAdmin, employee);
  const employeeAllowed = await runMiddleware(requireEmployee, employee);

  assert.equal(getRolePermissions("employee").length, 0);
  assert.equal(hasPermission(employee, "sales:view"), false);
  assert.equal(adminDenied.nextCalled, false);
  assert.equal(adminDenied.res.statusCode, 403);
  assert.equal(employeeAllowed.nextCalled, true);
});

test("admin has wildcard permission for system-only management", () => {
  assert.deepEqual(getRolePermissions("admin"), ROLE_PERMISSIONS.admin);
  assert.equal(hasPermission({ role: "admin" }, "users:manage"), true);
  assert.equal(hasPermission({ role: "admin" }, "audit:view"), true);
  assert.equal(hasPermission({ role: "admin" }, "settings:manage"), true);
});

test("manager can view and export reports but cannot manage system settings", async () => {
  assert.equal(hasPermission({ role: "manager" }, "reports:view"), true);
  assert.equal(hasPermission({ role: "manager" }, "reports:export"), true);
  assert.equal(hasPermission({ role: "manager" }, "users:manage"), false);
  assert.equal(hasPermission({ role: "manager" }, "audit:view"), false);

  const allowed = await runMiddleware(requirePermission("reports:view"), { role: "manager" });
  const denied = await runMiddleware(requirePermission("users:manage"), { role: "manager" });

  assert.equal(allowed.nextCalled, true);
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.res.statusCode, 403);
});

test("staff can use allowed operational views and project status updates", async () => {
  const staff = { role: "staff" };

  assert.equal(hasPermission(staff, "clients:view"), true);
  assert.equal(hasPermission(staff, "projects:view"), true);
  assert.equal(hasPermission(staff, "projects:update-status"), true);
  assert.equal(hasPermission(staff, "support:manage"), true);
  assert.equal(hasPermission(staff, "invoices:view"), true);

  const allowed = await runMiddleware(requireAnyPermission(["projects:update-status", "projects:manage"]), staff);
  assert.equal(allowed.nextCalled, true);
});

test("staff is blocked from users, audit, exports, invoice payment changes, and commission approvals", async () => {
  const staff = { role: "staff" };
  const forbiddenPermissions = [
    "users:manage",
    "audit:view",
    "settings:manage",
    "reports:export",
    "invoices:payment-update",
    "invoices:send-email",
    "commissions:manage",
    "commissions:approve"
  ];

  for (const permission of forbiddenPermissions) {
    const result = await runMiddleware(requirePermission(permission), staff);
    assert.equal(result.nextCalled, false, `${permission} should not call next()`);
    assert.equal(result.res.statusCode, 403, `${permission} should return 403`);
  }
});

test("requireRole supports explicit role sets", async () => {
  const managerAllowed = await runMiddleware(requireRole(["admin", "manager"]), { role: "manager" });
  const staffDenied = await runMiddleware(requireRole(["admin", "manager"]), { role: "staff" });

  assert.equal(managerAllowed.nextCalled, true);
  assert.equal(staffDenied.nextCalled, false);
  assert.equal(staffDenied.res.statusCode, 403);
});
