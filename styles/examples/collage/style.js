// Cut-out collage (v2): kraft board, newsprint sheets with white torn fringes, a halftone
// product print, cut-paper digits, tape and a rubber stamp. Pieces slide in on twos and stack;
// earlier pieces stay underneath, so each beat builds on the last. Paper pieces wobble on twos
// (stop-motion); logos and the QR sit outside the wobble layer and hold still once placed.
window.STYLE = {
  build(tl, S, C, root) {
    const { el, torn, noise, rnd } = H;
    const r = rnd("collage");
    document.documentElement.style.setProperty("--kraft", `${noise(0.6, 0.35, 4)}, ${noise(0.02, 0.18, 9)}`);
    document.documentElement.style.setProperty("--fiber", noise(0.9, 0.18, 5));
    document.documentElement.style.setProperty("--grit", noise(1.4, 1, 6).replace("0 0 0 1 0", "0 0 0 1 0"));
    el("div", { id: "kraft" }, root);

    // A torn paper piece: white fringe under a coloured sheet, both torn with the same seed family.
    const piece = (seed, { x, y, w, h, rot = 0, cls = "newsprint", amp = 1.6, z = 1 }) => {
      const p = el("div", { class: "piece", style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, rotate: `${rot}deg`, zIndex: z } }, root);
      const j = el("div", { class: "jit", style: { position: "absolute", inset: 0 } }, p); // stop-motion wobble layer
      el("div", { class: "fringe", style: { clipPath: torn(seed + "f", amp * 1.2) } }, j);
      const body = el("div", { class: `paper ${cls}`, style: { clipPath: torn(seed, amp) } }, j);
      return { p, body };
    };
    const tape = (host, x, y, rot) => el("div", { class: "tape", style: { left: `${x}px`, top: `${y}px`, rotate: `${rot}deg`, clipPath: torn(`t${x}${y}`, 5) } }, host);

    // Beat 1 — a newsprint sheet, the logo on a white label, kicker on a navy strip.
    const sheet = piece("sheet", { x: 260, y: 150, w: 1400, h: 780, rot: -2.5, z: 1 });
    const label = piece("label", { x: 620, y: 300, w: 680, h: 230, rot: 1.5, cls: "", amp: 2.2, z: 2 });
    label.body.style.background = "#fbf8f1";
    H.logo(C.logo, { x: 70, y: 40, w: 540, h: 150 }, label.p); // on the piece, outside its .jit wobble layer
    tape(label.p, 40, -14, -18); tape(label.p, 520, 196, -12);
    const kick = piece("kick", { x: 660, y: 600, w: 640, h: 128, rot: -1.5, cls: "navy", amp: 3, z: 3 });
    el("div", { class: "serif", html: H.br(C.KICKER, 10), style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: "64px", letterSpacing: "8px" } }, kick.body);

    // Beat 2 — halftone product print, headline on newsprint, a stamped tag.
    const print = piece("print", { x: 150, y: 170, w: 680, h: 520, rot: -4, cls: "", amp: 1.4, z: 4 });
    print.body.style.background = "#f6f2e8";
    if (C.product) el("img", { src: C.product, class: "halftone", style: { position: "absolute", left: "30px", top: "30px", width: "620px", height: "460px", objectFit: "cover" } }, print.body);
    el("div", { class: "dots", style: { inset: "30px" } }, print.body);
    tape(print.p, 250, -16, 4);
    const head = piece("head", { x: 900, y: 250, w: 900, h: 300, rot: 1.5, z: 5 });
    el("div", { class: "serif", html: H.br(C.TITLE, 8), style: { position: "absolute", left: "50px", top: "34px", fontSize: "104px", lineHeight: 1.05 } }, head.body);
    const lineRows = H.lines(C.LINE, 16); // the strip grows with the copy instead of clipping it
    const linep = piece("linep", { x: 940, y: 590, w: 760, h: 56 + lineRows.length * 48, rot: -1, cls: "", amp: 2.4, z: 6 });
    linep.body.style.background = "#fbf8f1";
    el("div", { html: lineRows.join("<br>"), style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", fontSize: "36px", lineHeight: 1.35, fontWeight: 500 } }, linep.body);
    const stamp = el("div", { class: "stamp serif", text: C.TAG, style: { left: "1500px", top: "190px", fontSize: "44px", rotate: "-9deg", zIndex: 7 } }, root);

    // Beat 3 — cut-paper digits, each a different paper; label strip underneath.
    const chars = [...C.NUM], dw = Math.min(380, Math.floor(1560 / chars.length) - 40), x0 = 960 - (chars.length * (dw + 40) - 40) / 2;
    const digits = chars.map((d, i) => {
      const colors = [["var(--accent)", "#fff"], ["#f4efe4", "var(--brand)"], ["#e8c25a", "var(--brand)"]][i % 3];
      const pc = piece(`d${i}`, { x: x0 + i * (dw + 40), y: 150, w: dw, h: 500, rot: i % 2 ? 4 : -5, cls: "", amp: 2, z: 8 + i });
      pc.body.style.background = colors[0];
      el("div", { class: "digit", text: d, style: { inset: 0, fontSize: `${Math.round(dw * 1.2)}px`, color: colors[1], lineHeight: 1 } }, pc.body);
      return pc.p;
    });
    const labp = piece("labp", { x: 580, y: 700, w: 820, h: 130, rot: -1.5, cls: "navy", amp: 3, z: 12 });
    el("div", { class: "serif", text: C.LABEL, style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: "70px" } }, labp.body);

    // Beat 4 — a clean newsprint card on top of everything: logo, CTA, url on violet tape.
    const end = piece("end", { x: 230, y: 170, w: 1460, h: 740, rot: 1, z: 20 });
    const textW = C.QR ? 1000 : 1460; // the CTA shares the card with the QR when there is one
    H.logo(C.logo, { x: (textW - 420) / 2, y: 110, w: 420, h: 170 }, end.p);
    const ctaRows = H.lines(C.CTA, C.QR ? 10 : 14);
    el("div", { class: "serif", html: ctaRows.join("<br>"), style: { position: "absolute", left: 0, width: `${textW}px`, top: "320px", textAlign: "center", fontSize: "76px", lineHeight: 1.25 } }, end.body);
    H.qr(C, { x: 1080, y: 250, size: 300 }, end.p);
    const uw = Math.min(1000, 80 + [...(C.URL ?? "")].length * 24); // the tape grows with the address
    const urlY = 170 + 320 + ctaRows.length * 95 + 30; // below the CTA, however many lines it has
    const urlp = C.URL ? piece("urlp", { x: 230 + (textW - uw) / 2, y: urlY, w: uw, h: 96, rot: -2, cls: "violet", amp: 3, z: 21 }) : null;
    if (urlp) el("div", { text: C.URL, style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: "42px", fontWeight: 700 } }, urlp.body);

    const groups = [[sheet.p, label.p, kick.p], [print.p, head.p, linep.p, stamp], [...digits, labp.p], [end.p, urlp?.p].filter(Boolean)];
    tl.set(groups.flat(), { autoAlpha: 0 }, 0);
    // Slide in on twos from off-frame with a little overshoot and settle.
    const lay = (e, at, dir) => {
      const dx = dir === "l" ? -1300 : dir === "r" ? 1300 : 0, dy = dir === "u" ? -900 : dir === "d" ? 900 : 0;
      tl.fromTo(e, { autoAlpha: 1, x: dx, y: dy, rotation: (r() - 0.5) * 16 }, { x: 0, y: 0, rotation: 0, duration: 0.5, ease: "back.out(1.2)" }, at);
    };
    const thump = (e, at) => tl.fromTo(e, { autoAlpha: 0, scale: 1.4 }, { autoAlpha: 1, scale: 1, duration: 0.18, ease: "steps(3)" }, at);
    lay(sheet.p, 0.05, "d"); lay(label.p, 0.5, "u"); lay(kick.p, 1.0, "l");
    lay(print.p, S.product[0], "l"); lay(head.p, S.product[0] + 0.3, "r"); lay(linep.p, S.product[0] + 0.7, "d"); thump(stamp, S.product[0] + 1.2);
    digits.forEach((d, i) => lay(d, S.stat[0] + i * 0.25, i ? "r" : "u")); lay(labp.p, S.stat[0] + 0.7, "d");
    lay(end.p, S.cta[0], "d"); if (urlp) lay(urlp.p, S.cta[0] + 0.55, "r");
    // Paper breathes on twos (stop-motion). Only .jit layers move; .brand-locked logos never do.
    const jits = [...root.querySelectorAll(".jit")];
    const jr = rnd("jit");
    for (let t = 0; t < 10; t += 2 / 30) tl.set(jits, { x: () => (jr() - 0.5) * 2.4, y: () => (jr() - 0.5) * 2.4 }, t);
  },
};
