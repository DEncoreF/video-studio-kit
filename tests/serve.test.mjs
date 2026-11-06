// scripts/lib/serve.mjs: the static server behind ae-export, timeline-events and measure/*. A missing asset (a font, a picture,
// the browser's own /favicon.ico) answers 404 and the server keeps serving — it used to write 200, fail the read and throw
// ERR_HTTP_HEADERS_SENT from the catch, which killed the whole run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { fresh, join, writeFileSync } from "./helpers.mjs";
import { serve } from "../scripts/lib/serve.mjs";

test("serve: a file answers 200 with its type, a missing one 404, and the server keeps serving after the 404", { timeout: 10_000 }, async () => {
  const dir = fresh("serve");
  writeFileSync(join(dir, "index.html"), "<p>hi</p>");
  const server = serve(dir); await once(server, "listening");
  const url = (p) => `http://127.0.0.1:${server.address().port}${p}`, fetch = (u) => globalThis.fetch(u, { signal: AbortSignal.timeout(3000) });
  try {
    const ok = await fetch(url("/index.html"));
    assert.equal(ok.status, 200); assert.equal(ok.headers.get("content-type"), "text/html"); assert.equal(await ok.text(), "<p>hi</p>");
    const gone = await fetch(url("/fonts/missing.woff2")); assert.equal(gone.status, 404); await gone.arrayBuffer();
    const again = await fetch(url("/index.html")); assert.equal(again.status, 200, "still serving after a 404"); await again.arrayBuffer();
  } finally { server.close(); }
});
