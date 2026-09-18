const MACHINE_ROUTE_GROUP = Object.freeze({
  audience: "pos-machine",
  basePath: "/api/pos-machine/v1",
  endpoints: Object.freeze([
    "POST /standard/activate",
    "POST /standard/renewal-credentials/bootstrap",
    "POST /standard/renew"
  ]),
  companySessionAuthentication: false
});

const ADMIN_ROUTE_GROUP = Object.freeze({
  audience: "owner-admin",
  basePath: "/api/admin/pos-licensing",
  authorization: Object.freeze(["verifyToken", "requireTrustedLicenceAdmin", "requireLicencePermission"]),
  machineCredentialAuthentication: false
});

const FORBIDDEN_ADMIN_AUDIENCES = Object.freeze(["anonymous", "client", "staff", "employee", "manager", "pos-machine"]);

function validateRouteGroupIsolation(machineBasePath = MACHINE_ROUTE_GROUP.basePath, adminBasePath = ADMIN_ROUTE_GROUP.basePath) {
  const machine = String(machineBasePath || "").trim();
  const admin = String(adminBasePath || "").trim();
  const errors = [];
  if (!machine.startsWith("/api/pos-") || /admin|client|employee|public/i.test(machine)) {
    errors.push("machine_namespace_invalid");
  }
  if (!admin.startsWith("/api/admin/pos-licensing")) {
    errors.push("admin_namespace_invalid");
  }
  if (machine === admin || machine.startsWith(`${admin}/`) || admin.startsWith(`${machine}/`)) {
    errors.push("route_groups_overlap");
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  ADMIN_ROUTE_GROUP,
  FORBIDDEN_ADMIN_AUDIENCES,
  MACHINE_ROUTE_GROUP,
  validateRouteGroupIsolation
};
