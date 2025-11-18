import axios from "axios";

export default async function handler(req, res) {
  try {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    // Base URL
    const host = req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const base = `${proto}://${host}`;

    // Slovensko = UTC+1
    // Preto máme časy v UTC:
    // - UPDATE = 09:00 UTC
    // - SCORER = 13:00 UTC
    // - SAVE   = 14:00 UTC

    let executed = null;

    if (utcHour === 8 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=update`);
      executed = "update";
    }
    else if (utcHour === 12 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=scorer`);
      executed = "scorer";
    }
    else if (utcHour === 13 && utcMinute < 22) {
      await axios.get(`${base}/api/ai?task=save`);
      executed = "save";
    }

    return res.json({
      ok: true,
      time: now.toISOString(),
      executed: executed || "nothing"
    });

  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
}
