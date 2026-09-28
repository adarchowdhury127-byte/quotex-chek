export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });

    if (req.method === "OPTIONS")
      return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "*" } });
    if (!env.UIDS) return out({ error: "UIDS binding missing" }, 500);

    if (url.pathname === "/postback") {
      let p = Object.fromEntries(url.searchParams);
      if (req.method === "POST") {
        try {
          const ct = req.headers.get("content-type") || "";
          const b = ct.includes("json") ? await req.json() : Object.fromEntries(await req.formData());
          p = { ...p, ...b };
        } catch (e) {}
      }
      const uid = String(p.trader_id || "").trim();
      if (!uid || uid === "0" || uid.includes("{")) return out({ ok: true, skipped: "no trader_id" });

      const key = "u:" + uid;
      const rec = JSON.parse((await env.UIDS.get(key)) || "null") ||
        { reg_date: new Date().toISOString().slice(0, 10), first_deposit: 0, total_deposits: 0, events: [] };

      const ev = String(p.event_id || "");
      if (ev && !ev.includes("{") && rec.events.includes(ev)) return out({ ok: true, duplicate: true });

      const s = String(p.status || "").toLowerCase();
      const amt = parseFloat(p.sumdep) || 0;
      const repeat = s === "dep" || s.includes("repeat") || s.includes("not first");
      const first = !repeat && (s === "ftd" || s.includes("first"));
      if (first) { rec.first_deposit = amt; rec.total_deposits += amt; }
      else if (repeat) { rec.total_deposits += amt; }

      if (ev && !ev.includes("{")) { rec.events.push(ev); rec.events = rec.events.slice(-50); }
      await env.UIDS.put(key, JSON.stringify(rec));
      return out({ ok: true });
    }

    if (url.pathname === "/check") {
      const uid = (url.searchParams.get("uid") || "").trim();
      const rec = JSON.parse((await env.UIDS.get("u:" + uid)) || "null");
      if (!rec) return out({ found: false });
      return out({ found: true, reg_date: rec.reg_date, first_deposit: rec.first_deposit, total_deposits: rec.total_deposits });
    }

    return new Response("Quotex check is running");
  },
};
