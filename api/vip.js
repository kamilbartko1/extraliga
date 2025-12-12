// /api/vip.js
import { requireAuth } from "./_auth.js";

export default async function handler(req, res) {
  // Zatiaľ nerobíme nič, iba testujeme endpoint existuje.
  
  return res.status(200).json({
    ok: true,
    message: "VIP endpoint pripravený",
  });
}
