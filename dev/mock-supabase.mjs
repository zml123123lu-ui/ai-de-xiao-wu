/**
 * 离线 Supabase 替身（仅本地预览用，不参与生产构建，也不改变线上安全策略）。
 * 只用 Node 内置模块实现本项目实际用到的 PostgREST + GoTrue 子集：
 *   POST /auth/v1/token, GET /auth/v1/user, POST /auth/v1/logout
 *   GET/POST/PATCH /rest/v1/:table （含内嵌关系、count、单行返回）
 * 同时模拟线上那几个关键触发器：通知、updated_at、草稿寄出时补 sent_at。
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { initialData, USERS, shanghaiToday } from "./fixtures.mjs";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
let tokenTtl = Number(process.env.MOCK_TOKEN_TTL ?? 31536000);
const counters = { login: 0, refresh: 0, logout: 0 }; // 默认一年，测试会话刷新时会调小
const db = initialData();
const now = () => new Date().toISOString();
const rowsOf = (table) => (db[table] ??= []);
const SINGULAR = { discussions: "discussion", letters: "letter", notifications: "notification", daily_statuses: "daily_status", profiles: "profile" };

/** 各表的列默认值——真实 Postgres 有 default，假后端必须照做，
 *  否则 status 之类的字段会是 undefined，页面逻辑会走出与线上不同的分支。 */
const DEFAULTS = {
  profiles: { avatar_color: "#9e6b4f" },
  discussions: { status: "open", edited_at: null, deleted_at: null },
  discussion_replies: { edited_at: null, deleted_at: null },
  letters: { status: "draft", reply_to_id: null, sent_at: null, read_at: null },
  daily_statuses: {},
  notifications: { read_at: null },
};
const withDefaults = (table, item) => ({ ...(DEFAULTS[table] ?? {}), ...item });

// 种子数据也要补默认值：真实 Postgres 里未读就是显式 NULL，
// 而 fixtures 里省略的字段会是 undefined——.is("read_at", null) 这类过滤就匹配不到。
for (const [table, rows] of Object.entries(db)) {
  if (Array.isArray(rows)) db[table] = rows.map((row) => withDefaults(table, row));
}

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function mintToken(user) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat, exp: iat + tokenTtl };
  return `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(payload)}.mock-signature`;
}

/** 一次登录/续期返回的会话负载 */
function sessionPayload(user) {
  return {
    access_token: mintToken(user),
    token_type: "bearer",
    expires_in: tokenTtl,
    expires_at: Math.floor(Date.now() / 1000) + tokenTtl,
    refresh_token: `mock-refresh-${user.id}`,
    user: publicUser(user),
  };
}
function userFromToken(req) {
  const raw = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const part = raw.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const user = USERS.find((u) => u.id === payload.sub);
    return user ? publicUser(user) : null;
  } catch { return null; }
}
const publicUser = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
  email_confirmed_at: now(), phone: "", confirmed_at: now(), last_sign_in_at: now(),
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { display_name: u.display_name },
  identities: [], created_at: now(), updated_at: now(),
});

function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const pick = (row, cols) => (!cols.length || cols.includes("*") ? { ...row } : Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]])));

function embed(table, row, spec) {
  const m = spec.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/);
  if (!m) return null;
  const [, alias, target, hint, inner] = m;
  const key = alias ?? target;
  if (inner.trim() === "count") {
    const link = `${SINGULAR[table] ?? table}_id`;
    return [key, [{ count: rowsOf(target).filter((r) => r[link] === row.id).length }]];
  }
  const cols = splitTop(inner);
  if (hint) {
    // discussions_author_id_fkey -> author_id（要先去掉表名前缀）
    const local = hint.replace(/_fkey$/, "").replace(new RegExp(`^${table}_`), "");
    const found = rowsOf(target).find((r) => r.id === row[local]);
    return [key, found ? pick(found, cols) : null];
  }
  const link = `${SINGULAR[table] ?? table}_id`;
  return [key, rowsOf(target).filter((r) => r[link] === row.id).map((r) => pick(r, cols))];
}

function project(table, row, select) {
  if (!select) return { ...row };
  const out = {};
  for (const item of splitTop(select)) {
    if (item === "*") { Object.assign(out, row); continue; }
    if (item.includes("(")) { const [k, v] = embed(table, row, item) ?? []; if (k) out[k] = v; continue; }
    const [alias, col] = item.includes(":") ? item.split(":") : [item, item];
    out[alias] = row[col];
  }
  return out;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const unquote = (value) => value.replace(/^"|"$/g, "");

/** 单个条件的比较；eq/neq/is/in/gte/lte/gt/lt/like/ilike */
function compare(rowValue, op, value) {
  const typed = value === "true" ? true : value === "false" ? false : value === "null" ? null : value;
  switch (op) {
    case "eq": return rowValue === typed || String(rowValue) === value;
    case "neq": return !(rowValue === typed || String(rowValue) === value);
    case "is": return typed === null ? rowValue == null : rowValue === typed;
    case "in": {
      const list = value.replace(/^\(|\)$/g, "").split(",").map((item) => unquote(item.trim()));
      return list.includes(String(rowValue));
    }
    case "gte": return String(rowValue) >= value;
    case "lte": return String(rowValue) <= value;
    case "gt": return String(rowValue) > value;
    case "lt": return String(rowValue) < value;
    case "like":
    case "ilike": return String(rowValue ?? "").toLowerCase().includes(value.replace(/%/g, "").toLowerCase());
    default: return false;
  }
}

/** or=(a.ilike.%x%,b.ilike.%x%) —— PostgREST 的多列搜索语法 */
function matchesOr(row, raw, mode) {
  const clauses = splitTop(raw.replace(/^\(|\)$/g, ""));
  const hits = clauses.map((clause) => {
    const m = clause.match(/^"?([\w]+)"?\.(\w+)\.(.*)$/);
    return m ? compare(row[m[1]], m[2], unquote(m[3])) : false;
  });
  return mode === "or" ? hits.some(Boolean) : hits.every(Boolean);
}

function matches(row, params) {
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    if (key === "or" || key === "and") {
      if (!matchesOr(row, raw, key)) return false;
      continue;
    }
    const [op, ...rest] = raw.split(".");
    if (!compare(row[key], op, rest.join("."))) return false;
  }
  return true;
}

const otherMember = (id) => rowsOf("profiles").find((p) => p.id !== id)?.id ?? null;
function notify(recipient, actor, type, resource) {
  if (!recipient) return;
  rowsOf("notifications").push({ id: randomUUID(), recipient_id: recipient, actor_id: actor, type, resource_id: resource, created_at: now(), read_at: null });
}
/** 模拟线上触发器 */
function afterWrite(table, row, prev) {
  row.updated_at = now();
  if (table === "discussion_replies") {
    const d = rowsOf("discussions").find((x) => x.id === row.discussion_id);
    if (d) d.updated_at = now();
    notify(otherMember(row.author_id), row.author_id, "reply", row.discussion_id);
  } else if (table === "discussions") {
    notify(otherMember(row.author_id), row.author_id, "discussion", row.id);
  } else if (table === "letters") {
    if (prev?.status === "draft" && row.status === "sent" && !row.sent_at) row.sent_at = now();
    if (row.status === "sent" && prev?.status !== "sent") notify(row.recipient_id, row.sender_id, "letter", row.id);
  } else if (table === "daily_statuses") {
    db.notifications = rowsOf("notifications").filter((n) => !(n.recipient_id === otherMember(row.author_id) && n.type === "daily_status" && n.resource_id === row.id));
    notify(otherMember(row.author_id), row.author_id, "daily_status", row.id);
  }
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }

  const send = (status, payload, headers = {}) => {
    if (status === 204 || payload === undefined) { res.writeHead(status, { ...CORS, ...headers }); return res.end(); }
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...CORS, ...headers });
    res.end(JSON.stringify(payload));
  };
  const log = (tag) => console.log(`${req.method} ${url.pathname}${url.search} -> ${tag}`);

  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  // ---- GoTrue ----
  if (url.pathname === "/auth/v1/token") {
    // 续期：auth-js 会用 refresh_token 换新会话
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const id = String(body?.refresh_token ?? "").replace(/^mock-refresh-/, "");
      const user = USERS.find((u) => u.id === id);
      if (!user) { log("400 invalid refresh token"); return send(400, { error: "invalid_grant", error_description: "Invalid Refresh Token" }); }
      counters.refresh += 1;
      log(`200 refreshed ${user.email}`);
      return send(200, sessionPayload(user));
    }
    const user = USERS.find((u) => u.email === body?.email && u.password === body?.password);
    if (!user) { log("400 bad credentials"); return send(400, { error: "invalid_grant", error_description: "Invalid login credentials" }); }
    counters.login += 1;
    log(`200 session ${user.email}`);
    return send(200, sessionPayload(user));
  }
  if (url.pathname === "/auth/v1/user") {
    const user = userFromToken(req);
    if (!user) { log("401"); return send(401, { message: "invalid claim: missing sub claim" }); }
    log(`200 user ${user.email}`);
    return send(200, user);
  }
  if (url.pathname === "/auth/v1/logout") { counters.logout += 1; log("204"); return send(204); }

  // ---- 测试控制面（仅本地假后端有）----
  if (url.pathname === "/_control/stats") {
    return send(200, { refresh: counters.refresh, logout: counters.logout, login: counters.login });
  }
  if (url.pathname === "/_control/token-ttl" && req.method === "POST") {
    tokenTtl = Number(body?.seconds ?? 3600);
    log(`200 token 有效期设为 ${tokenTtl}s`);
    return send(200, { tokenTtl });
  }

  // ---- PostgREST ----
  const route = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (!route) { log("404"); return send(404, { message: `mock-supabase: 未实现的路径 ${url.pathname}` }); }
  const table = route[1];
  const params = [...url.searchParams.entries()];
  const select = url.searchParams.get("select") ?? "*";
  const wantsObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object+json");
  const prefer = String(req.headers.prefer ?? "");
  const representation = prefer.includes("return=representation");

  if (req.method === "GET" || req.method === "HEAD") {
    let rows = rowsOf(table).filter((r) => matches(r, params));
    const order = url.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      rows = [...rows].sort((a, b) => ((a[col] ?? "") > (b[col] ?? "") ? 1 : (a[col] ?? "") < (b[col] ?? "") ? -1 : 0) * (dir === "desc" ? -1 : 1));
    }
    const total = rows.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (offset > 0) rows = rows.slice(offset);
    const limit = Number(url.searchParams.get("limit") ?? 0);
    if (limit > 0) rows = rows.slice(0, limit);
    if (req.method === "HEAD") {
      log(`200 HEAD 共 ${total} 行`);
      res.writeHead(200, { ...CORS, "content-range": total ? `0-${total - 1}/${total}` : "*/0" });
      return res.end();
    }
    const out = rows.map((r) => project(table, r, select));
    if (wantsObject) {
      if (out.length !== 1) { log(`406 (${out.length} rows)`); return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `Results contain ${out.length} rows` }); }
      log("200 object"); return send(200, out[0]);
    }
    log(`200 ${out.length} rows`);
    return send(200, out, { "content-range": total ? `0-${total - 1}/${total}` : "*/0" });
  }

  const onConflict = url.searchParams.get("on_conflict");

  if (req.method === "POST" && onConflict) {
    const cols = onConflict.split(",");
    const saved = [];
    for (const item of Array.isArray(body) ? body : [body]) {
      const existing = rowsOf(table).find((r) => cols.every((c) => r[c] === item[c]));
      if (existing) { const prev = { ...existing }; Object.assign(existing, item); afterWrite(table, existing, prev); saved.push(existing); }
      else { const row = { id: randomUUID(), created_at: now(), updated_at: now(), ...withDefaults(table, item) }; rowsOf(table).push(row); afterWrite(table, row, null); saved.push(row); }
    }
    log(`201 upsert ${saved.length}`);
    if (!representation) return send(201, undefined);
    const upserted = saved.map((r) => project(table, r, select));
    if (wantsObject) return send(upserted.length === 1 ? 201 : 406, upserted.length === 1 ? upserted[0] : { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return send(201, upserted);
  }

  if (req.method === "POST") {
    const inserted = [];
    for (const item of Array.isArray(body) ? body : [body]) {
      const row = { id: randomUUID(), created_at: now(), updated_at: now(), ...withDefaults(table, item) };
      rowsOf(table).push(row);
      afterWrite(table, row, null);
      inserted.push(row);
    }
    log(`201 insert ${inserted.length}`);
    if (!representation) return send(201, undefined);
    const created = inserted.map((r) => project(table, r, select));
    // .single() 会带 Accept: application/vnd.pgrst.object+json，真 PostgREST 会回单行
    if (wantsObject) {
      if (created.length !== 1) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return send(201, created[0]);
    }
    return send(201, created);
  }

  if (req.method === "PATCH") {
    const targets = rowsOf(table).filter((r) => matches(r, params));
    for (const row of targets) { const prev = { ...row }; Object.assign(row, body); afterWrite(table, row, prev); }
    log(`200 update ${targets.length}`);
    if (!representation) return send(204, undefined);
    const updated = targets.map((r) => project(table, r, select));
    if (wantsObject) {
      if (updated.length !== 1) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return send(200, updated[0]);
    }
    return send(200, updated);
  }

  log("405");
  return send(405, { message: `mock-supabase: 不支持的方法 ${req.method}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-supabase 已启动: http://127.0.0.1:${PORT}`);
  console.log(`可用账号: ${USERS.map((u) => `${u.email} / ${u.password}`).join("  |  ")}`);
  console.log(`今天(上海) = ${shanghaiToday(0)}`);
});
