const PLAN_ORDER = {
  starter: 1,
  standard: 2,
  pro: 3
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

    if (!userPlan || (PLAN_ORDER[userPlan] || 0) < (PLAN_ORDER[minimumPlan] || 0)) {
      return res.status(403).json({
        error: "Upgrade your plan",
        upgradeUrl: "/pricing"
      });
    }

    return next();
  };
}

module.exports = {
  requirePlan
};
