// Neo-brutalism: thick black borders, hard offset shadows, candy blocks; hard cuts with a
// one-frame flash, slams instead of fades, a ticker that never stops.
window.STYLE = {
  build(tl, S, C, root) {
    const { el } = H;
    const ticker = el("div", { class: "ticker", text: `  ${C.KICKER} ★ ${C.TAG} ★ ${C.URL} ★ `.repeat(8) }, root);
    tl.fromTo(ticker, { x: 0 }, { x: -1600, duration: 10, ease: "none" }, 0);

    // Beat 1
    const b1 = el("div", { class: "abs", style: { inset: 0 } }, root);
    el("div", { class: "abs", style: { left: "0", top: "0", width: "720px", height: "984px", background: "#ffe14d", borderRight: "6px solid #111" } }, b1);
    const star = el("div", { class: "star", style: { left: "170px", top: "250px", width: "420px", height: "420px" } }, b1);
    const logoCard = el("div", { class: "card", style: { left: "860px", top: "250px", width: "880px", height: "300px", display: "grid", placeItems: "center", rotate: "-2deg" } }, b1);
    H.logo(C.logo, { x: 120, y: 40, w: 640, h: 220 }, logoCard);
    const kick = el("div", { class: "sticker", text: C.KICKER, style: { left: "980px", top: "600px", fontSize: "64px", background: "#7be0ad", rotate: "3deg" } }, b1);

    // Beat 2
    const b2 = el("div", { class: "abs", style: { inset: 0 } }, root);
    el("div", { class: "abs", style: { left: "1180px", top: "0", width: "740px", height: "984px", background: "#7be0ad", borderLeft: "6px solid #111" } }, b2);
    const win = el("div", { class: "card", style: { left: "110px", top: "150px", width: "1000px", height: "600px" } }, b2);
    el("div", { class: "bar", html: "<i></i><i></i><i></i><span style='margin-left:12px'>agent-governance.txt</span>" }, win);
    el("div", { html: H.br(C.TITLE, 8), style: { fontWeight: 900, fontSize: "104px", lineHeight: 1.05, padding: "60px 48px 0" } }, win);
    el("div", { text: C.LINE, style: { fontWeight: 700, fontSize: "40px", padding: "36px 48px", lineHeight: 1.4 } }, win);
    const photo = el("div", { class: "card", style: { left: "1270px", top: "190px", width: "520px", height: "380px", overflow: "hidden", rotate: "4deg" } }, b2);
    el("img", { src: C.product, style: { width: "100%", height: "100%", objectFit: "cover" } }, photo);
    const tag = el("div", { class: "sticker", text: C.TAG, style: { left: "1380px", top: "640px", fontSize: "56px", background: "#ff8a5c", rotate: "-6deg" } }, b2);

    // Beat 3
    const b3 = el("div", { class: "abs", style: { inset: 0, background: "#c4b5fd" } }, root);
    const num = el("div", { class: "abs huge", text: C.NUM, style: { left: "220px", top: "110px", fontSize: "700px", color: "#ffe14d" } }, b3);
    const lab = el("div", { class: "sticker", text: C.LABEL, style: { left: "1000px", top: "560px", fontSize: "76px", background: "#fff", rotate: "-3deg" } }, b3);

    // Beat 4
    const b4 = el("div", { class: "abs", style: { inset: 0 } }, root);
    const ctaBar = el("div", { class: "abs", text: C.CTA, style: { left: "0", top: "300px", width: "1920px", padding: "40px 120px", background: "#111", color: "#fff", fontWeight: 900, fontSize: "96px" } }, b4);
    const btn = el("div", { class: "sticker", text: `${C.URL} →`, style: { left: "120px", top: "580px", fontSize: "56px", background: "#ffe14d" } }, b4);
    const logoCard2 = el("div", { class: "card", style: { left: "1340px", top: "560px", width: "460px", height: "180px", display: "grid", placeItems: "center" } }, b4);
    H.logo(C.logo, { x: 60, y: 30, w: 340, h: 120 }, logoCard2);

    const flash = el("div", { class: "flash" }, root);
    const beats = [b1, b2, b3, b4], starts = [S.logo[0], S.product[0], S.stat[0], S.cta[0]];
    // Hard cuts: each beat is visible only inside its own window (CSS, so no tween start-value bookkeeping).
    beats.forEach((b, i) => { b.style.visibility = i ? "hidden" : "visible"; });
    flash.style.visibility = "hidden";
    starts.forEach((t, i) => {
      if (!i) return;
      tl.set(flash, { visibility: "visible" }, t - 1 / 30); tl.set(flash, { visibility: "hidden" }, t + 1 / 30);
      tl.set(beats[i - 1], { visibility: "hidden" }, t); tl.set(beats[i], { visibility: "visible" }, t);
    });
    const slam = (e, at, from = 1.35) => tl.fromTo(e, { scale: from, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.14, ease: "power4.in" }, at);
    const shake = (at) => tl.fromTo(root, { x: -10, y: 8 }, { x: 0, y: 0, duration: 0.18, ease: "steps(3)" }, at);
    tl.fromTo(star, { rotation: 0 }, { rotation: 180, duration: 2.5, ease: "none" }, 0);
    slam(star, 0.1, 0); slam(logoCard, 0.35); shake(0.49); slam(kick, 0.9); shake(1.04);
    slam(win, S.product[0] + 0.1); shake(S.product[0] + 0.24); slam(photo, S.product[0] + 0.5); slam(tag, S.product[0] + 0.85); shake(S.product[0] + 0.99);
    slam(num, S.stat[0] + 0.1, 2); shake(S.stat[0] + 0.24); slam(lab, S.stat[0] + 0.7);
    slam(ctaBar, S.cta[0] + 0.05, 1.1); slam(btn, S.cta[0] + 0.4); slam(logoCard2, S.cta[0] + 0.6);
    // Button press.
    tl.to(btn, { x: 10, y: 10, boxShadow: "0 0 0 #111", duration: 0.08 }, S.cta[0] + 1.2).to(btn, { x: 0, y: 0, boxShadow: "10px 10px 0 #111", duration: 0.12 }, S.cta[0] + 1.32);
  },
};
