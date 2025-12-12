// /api/vip-status.js

export default async function handler(req, res) {
  // Zatiaľ NEPOUŽÍVAME Supabase ani Redis!
  // Tento endpoint je len príprava, nič nemení na stránke.

  return res.status(200).json({
    ok: true,
    isVip: false, // zatiaľ napevno
  });
}
