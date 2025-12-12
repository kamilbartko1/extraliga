// /api/vip-status.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  return res.json({
    ok: true,
    isVip: false, // zatiaľ napevno – nič nemeníme!
  });
}
