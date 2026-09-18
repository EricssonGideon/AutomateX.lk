function isStagingPreviewReadinessRuntime(env = process.env) {
  return String(env.POS_LICENSING_MODE || "").trim().toLowerCase() === "staging" &&
    String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview" &&
    String(env.VERCEL_GIT_COMMIT_REF || "").trim() === "pos-licensing-staging";
}

function inactiveStagingPreviewStartup() {
  return Object.freeze({
    active: false,
    enablementRequested: false,
    configured: false,
    mode: "staging",
    runtimeEnvironment: Object.freeze({
      mode: "staging",
      nodeEnv: "production",
      explicit: true,
      secureRuntime: true
    })
  });
}

function unresolvedProxyTrust() {
  return Object.freeze({
    configured: false,
    mode: "unresolved",
    ranges: Object.freeze([]),
    expressTrust: false,
    trusts() { return false; }
  });
}

function resolveStagingPreviewStartup(env, resolver) {
  try {
    return resolver(env);
  } catch (error) {
    if (!isStagingPreviewReadinessRuntime(env)) {
      throw error;
    }
    return inactiveStagingPreviewStartup();
  }
}

function resolveStagingPreviewProxyTrust(env, resolver) {
  try {
    return resolver(env);
  } catch (error) {
    if (!isStagingPreviewReadinessRuntime(env)) {
      throw error;
    }
    return unresolvedProxyTrust();
  }
}

module.exports = {
  inactiveStagingPreviewStartup,
  isStagingPreviewReadinessRuntime,
  resolveStagingPreviewProxyTrust,
  resolveStagingPreviewStartup,
  unresolvedProxyTrust
};
