const PLAN_ORDER = {
  not_assigned: 0,
  starter: 1,
  standard: 2,
  pro: 3,
  custom: 4
};

/**
 * Builds middleware that blocks access when a tenant has not upgraded far enough.
 *
 * @param {"standard"|"pro"} minimumPlan - The minimum paid plan required.
 * @returns {import("express").RequestHandler} Middleware enforcing plan access.
 */
function requirePlan(minimumPlan) {
  return (req, res, next) => {
    const userPlan = req.user && req.user.plan ? req.user.plan : null;
    const accountStatus = req.user && req.user.accountStatus ? req.user.accountStatus : "pending";

    if (accountStatus !== "active") {
      return res.status(403).json({
        error: accountStatus === "suspended" ? "Account suspended" : "Pending admin approval",
        message: accountStatus === "suspended"
          ? "Your account is suspended. Please contact AutomateX support."
          : "Your account is pending admin approval.",
        accountStatus
      });
    }

    if (!userPlan || (PLAN_ORDER[userPlan] || 0) < (PLAN_ORDER[minimumPlan] || 0)) {
      return res.status(403).json({
        error: "Upgrade your plan",
        upgradeUrl: "/pricing",
        accountStatus
      });
    }

    return next();
  };
}

module.exports = {
  requirePlan
};
