import jwt from "jsonwebtoken";

export function getUserIdFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;

  const token = auth.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    return decoded.sub || null; 
  } catch (err) {
    console.error("JWT verify error:", err.message);
    return null;
  }
}

export function requireAuth(req, res) {
  const userId = getUserIdFromRequest(req);

  if (!userId) {
    res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
    return null;
  }

  return userId;
}
