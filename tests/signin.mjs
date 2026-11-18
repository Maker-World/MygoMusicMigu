// Signing in by QR code against a stand-in for Migu.
import assert from "node:assert/strict";
import { load } from "./harness.mjs";
import { migu, TRADE, timers } from "./fixtures/signin.mjs";

const tests = {
  async "signs in by QR code"() {
    const { fetch, seen } = migu();
    const prompts = [];
    const { api, storage } = await load({
      fetch, timers, signInPrompt: (p) => prompts.push(p),
    });
    const me = await api.signIn();
    assert.equal(me.id, "1");
    assert.match(prompts[0].qr, /^https:\/\/passport\.migu\.cn\/qrc\//);
    assert.match(prompts[0].text, /咪咕音乐/);
    assert.ok(prompts.some((p) => p.text.includes("确认")));
    assert.equal(seen.traded.get("token"), "pass-token");
    assert.equal(seen.created.url.searchParams.get("sourceid"), "204040");
    assert.equal(seen.created.init.headers.Cookie, "mgnd_session_id=passport-session");
    assert.equal(seen.traded.get("sourceId"), "220029");
    assert.equal(storage.get("token"), "session");
    assert.equal(seen.profile.pacmtoken, "session");
  },

  async "reports a QR code expired by Migu"() {
    const { fetch, seen } = migu({ expired: true });
    const { api, storage } = await load({ fetch, timers });
    await assert.rejects(api.signIn(), /二维码已过期/);
    assert.equal(seen.traded, null);
    assert.equal(storage.has("token"), false);
  },

  async "uses QR code even with the old web sign-in setting"() {
    const { fetch, seen } = migu();
    const { api, host, storage } = await load({ fetch, timers, settings: { signInMethod: "web" } });
    host.webSignIn = () => assert.fail("QR sign-in must not open a website");
    assert.equal((await api.signIn()).id, "1");
    assert.ok(seen.created);
    assert.equal(storage.get("token"), "session");
  },

  async "keeps the previous session when a candidate fails validation"() {
    const account = { id: "old-user", name: "old" };
    const storage = new Map([["token", "old"], ["account", account], ["renewedAt", Date.now()]]);
    const { fetch } = migu({ token: "candidate" });
    const { api } = await load({
      storage, timers,
      fetch: async (url, init) => {
        if (!String(url).includes("/user/h5/user-info/")) return fetch(url, init);
        assert.equal(init.headers.pacmtoken, "candidate");
        assert.equal(init.headers.uid, undefined);
        assert.equal(storage.get("token"), "old");
        return Response.json({ code: "290001" });
      },
    });
    await assert.rejects(api.signIn(), /无法验证/);
    assert.equal(storage.get("token"), "old");
    assert.deepEqual(storage.get("account"), account);
  },

  async "discards a QR exchange that finishes after a replacement sign-in"() {
    const { fetch, seen } = migu();
    let finishTrade;
    let reachedTrade;
    const trading = new Promise((resolve) => { reachedTrade = resolve; });
    let trades = 0;
    const { api, storage } = await load({
      timers,
      fetch: (url, init) => String(url).startsWith(TRADE) && ++trades === 1
        ? new Promise((resolve) => { finishTrade = resolve; reachedTrade(); })
        : fetch(url, init),
    });
    const first = api.signIn();
    await trading;
    await api.signIn();
    finishTrade(Response.json({ code: "000000", data: { pacToken: "late" } }));
    await assert.rejects(first, /已取消/);
    assert.equal(seen.profile.pacmtoken, "session");
    assert.equal(storage.get("token"), "session");
  },

  async "discards a QR exchange that completes after sign-out"() {
    const { fetch, seen } = migu();
    let finish;
    let reachedTrade;
    const trading = new Promise((resolve) => { reachedTrade = resolve; });
    const { api, storage } = await load({
      timers,
      fetch: (url, init) => String(url).startsWith(TRADE)
        ? new Promise((resolve) => { finish = resolve; reachedTrade(); })
        : fetch(url, init),
    });
    const first = api.signIn();
    await trading;
    api.signOut();
    finish(Response.json({ code: "000000", data: { pacToken: "late" } }));
    await assert.rejects(first, /已取消/);
    assert.equal(seen.profile, null);
    assert.equal(storage.has("token"), false);
    assert.equal(storage.has("account"), false);
  },
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${e.stack}`);
  }
}
process.exit(failed ? 1 : 0);
