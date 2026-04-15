export function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}
