const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function readOnly(req, res, next) {
  if (!ALLOWED_METHODS.has(req.method)) {
    res.set("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: "Method Not Allowed", message: "This API is read-only." });
    return;
  }
  next();
}
