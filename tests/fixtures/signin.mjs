import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A QR code as Migu sends it: a JPEG in a data: address.
const PICTURE = readFileSync(new URL("./qr.txt", import.meta.url), "utf8");
const PASSPORT = "https://passport.migu.cn/api/qrcWeb/";
export const TRADE = "https://c.musicapp.migu.cn/user/h5/token-validate/v3.0";
export const timers = { setTimeout: (fn, delay) => setTimeout(fn, delay === 1500 ? 0 : delay), clearTimeout };

export function migu({ expired = false, token = "session" } = {}) {
  const seen = { traded: null, asked: 0, profile: null, created: null };
  const fetch = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith("https://passport.migu.cn/login")) {
      assert.equal(new URL(url).searchParams.get("sourceid"), "204040");
      return new Response("", { headers: { "set-cookie": "mgnd_session_id=passport-session; Path=/; Secure" } });
    }
    if (url.startsWith(`${PASSPORT}qrcLogin`)) {
      seen.created = { url: new URL(url), init };
      return Response.json({ status: "2000", result: { qrcUrl: PICTURE, qrc_sessionid: "s1" } });
    }
    if (url.startsWith(`${PASSPORT}qrcquery`)) {
      seen.asked++;
      assert.equal(new URL(url).searchParams.get("qrc_sessionid"), "s1");
      if (expired) return Response.json({ status: "4072" });
      if (seen.asked === 1) return Response.json({ status: 4074 });
      if (seen.asked === 2) return Response.json({ status: "4073" });
      return Response.json({ status: 2000, result: { token: "pass-token", redirectURL: "https://music.migu.cn/v3/user/login" } });
    }
    if (url.startsWith(TRADE)) {
      seen.traded = new URL(url).searchParams;
      return Response.json({ code: "000000" }, { headers: { "set-cookie": `pacmtoken=${token}; Domain=migu.cn; Path=/` } });
    }
    if (url.includes("/user/h5/user-info/")) {
      seen.profile = init.headers;
      return Response.json({ code: "000000", data: { userId: "1", nickName: "someone" } });
    }
    assert.fail(`Unexpected request ${url}`);
  };
  return { fetch, seen };
}

