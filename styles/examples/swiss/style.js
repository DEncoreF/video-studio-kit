// Swiss International Style: a visible 12-column grid, flush-left type, one accent dot,
// everything moves along grid lines with expo easing — precise, quiet, information first.
window.STYLE = {
  build(tl, S, C, root) {
    const { el } = H;
    const M = 96, G = 24, W = 122, colX = (i) => M + i * (W + G); // i = 0..11
    for (let i = 0; i < 12; i++) el("div", { class: "col", style: { left: `${colX(i)}px` } }, root);
    const metaL = el("div", { class: "abs meta", text: `${BRAND.name} — ${C.KICKER}`, style: { left: `${colX(0)}px`, top: "56px" } }, root);
    const counter = el("div", { class: "abs meta", style: { left: `${colX(11)}px`, top: "56px" } }, root);
    const rule = el("div", { class: "rule", style: { top: "700px" } }, root);
    const dot = el("div", { class: "dot", style: { left: `${colX(11) + 86}px`, top: "650px" } }, root);

    // Masked blocks: content rises out of a fixed window (classic Swiss reveal).
    const block = (x, y, w, h, html, cls) => { const m = el("div", { class: "mask", style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` } }, root); return el("div", { class: cls, html, style: { position: "relative", width: "100%", height: "100%" } }, m); };
    // Logos sit in a fixed box and keep their own aspect ratio (wide or square marks both fit).
    const logo = block(colX(0), 380, 1100, 300, "");
    H.logo(C.logo, { x: 0, y: 40, w: 1000, h: 240, align: "left" }, logo);
    const kicker = block(colX(8), 520, 560, 170, H.br(C.KICKER, 6), "kicker");
    const [l1, ...rest] = H.lines(C.TITLE, 7);
    const t1 = block(colX(0), 250, 1300, 190, l1, "big");
    const t2 = block(colX(0), 440, 1300, 190, rest.join(" "), "big");
    for (const t of [t1, t2]) { t.style.fontSize = "168px"; t.style.letterSpacing = "-2px"; }
    const tag = block(colX(0), 160, 600, 60, C.TAG, "meta accent");
    const line = block(colX(8), 730, 580, 140, H.br(C.LINE, 13), "line");
    const photo = block(colX(8), 150, 560, 400, `<img src="${C.product}" style="width:560px;height:340px;object-fit:cover;filter:grayscale(1) contrast(1.15);display:block"><div class="fig">Fig. 1${C.PRODUCT ? ` — ${C.PRODUCT}` : ""}</div>`);
    const num = block(colX(0), 60, 1000, 640, C.NUM, "big");
    num.style.fontSize = `${Math.min(600, Math.floor(1000 / ([...C.NUM].length * 0.62)))}px`; num.style.letterSpacing = "-30px"; // keep clear of the label column
    const label = block(colX(7), 560, 720, 120, C.LABEL, "kicker");
    label.style.fontSize = "64px"; label.style.fontWeight = 900;
    const cta = block(colX(0), 400, C.QR ? 1300 : 1700, 280, H.br(C.CTA, C.QR ? 9 : 12), "big");
    cta.style.fontSize = "120px"; cta.style.letterSpacing = "-3px"; cta.style.lineHeight = "1.05";
    const url = block(colX(0), 760, 700, 80, C.URL ?? "", "kicker accent");
    const logo2 = block(colX(C.QR ? 5 : 9), 770, 420, 120, "");
    H.logo(C.logo, { x: 0, y: 0, w: 400, h: 110, align: "left" }, logo2);
    // Optional QR, on the grid's last two columns; it rises with the CTA.
    const qr = C.QR ? block(colX(10), 430, 300, 360, "") : null;
    if (qr) H.qr(C, { x: 0, y: 0, size: 268 }, qr);

    const X = "expo.out", IO = "expo.inOut";
    // Move by the mask's own height so nothing peeks out of its window.
    const mh = (i, e) => e.parentElement.offsetHeight + 10;
    const rise = (els, at, d = 0.8, st = 0.08) => tl.fromTo(els, { y: mh }, { y: 0, duration: d, ease: X, stagger: st }, at);
    const sink = (els, at, d = 0.45) => tl.to(els, { y: (i, e) => -mh(i, e), duration: d, ease: "expo.in", stagger: 0.04 }, at);
    const count = (n, at) => tl.call(() => { counter.textContent = `0${n} / 04`; }, null, at);
    tl.set([logo, kicker, t1, t2, tag, line, photo, num, label, cta, url, logo2, qr].filter(Boolean), { y: mh }, 0);
    count(1, 0);
    tl.fromTo([metaL, counter], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.1);
    tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: IO }, 0);
    tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.5, ease: "back.out(2)" }, 0.8);
    rise(logo, 0.4, 1.0); rise(kicker, 0.9);

    const b2 = S.product[0];
    sink([logo, kicker], b2 - 0.35); count(2, b2);
    tl.to(rule, { top: 690, duration: 0.6, ease: IO }, b2);
    tl.to(dot, { left: colX(7) + 40, top: 640, duration: 0.6, ease: IO }, b2);
    rise(tag, b2 + 0.1); rise([t1, t2], b2 + 0.15, 0.9, 0.12); rise(photo, b2 + 0.4, 0.9); rise(line, b2 + 0.7);

    const b3 = S.stat[0];
    sink([tag, t1, t2, photo, line], b3 - 0.4); count(3, b3);
    tl.to(rule, { top: 700, duration: 0.6, ease: IO }, b3);
    tl.to(dot, { left: colX(11) + 86, top: 650, duration: 0.6, ease: IO }, b3);
    rise(num, b3 + 0.1, 1.0); rise(label, b3 + 0.5);

    const b4 = S.cta[0];
    sink([num, label], b4 - 0.35); count(4, b4);
    tl.to(rule, { top: 730, duration: 0.5, ease: IO }, b4);
    tl.to(dot, { left: colX(4) + 40, top: 790, duration: 0.5, ease: IO }, b4);
    rise(cta, b4 + 0.05, 0.8); rise([url, logo2, qr].filter(Boolean), b4 + 0.45, 0.6);
  },
};
