function requireEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function getJwtSecret() {
  return requireEnv("JWT_SECRET");
}

module.exports = {
  requireEnv,
  getJwtSecret
};
