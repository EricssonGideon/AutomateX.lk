function sendSuccess(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function sendError(res, statusCode, message, details = []) {
  const body = { message };

  if (details.length) {
    body.details = details;
  }

  return res.status(statusCode).json(body);
}

function sendValidationError(res, message, details = []) {
  return sendError(res, 400, message, details);
}

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError
};
