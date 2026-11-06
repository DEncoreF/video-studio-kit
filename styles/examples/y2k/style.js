// Y2K: holographic pastel field, chrome lettering, glossy glass windows and pills,
// elastic pops and floating; sparkles twinkle on the beats.
window.STYLE = {
  build(tl, S, C, root) {
    const { el } = H;
    const blobs = [["#b8e6ff", 200, 120, 760], ["#ffc6e8", 1180, 520, 820], ["#c9b8ff", 760, -260, 700], ["#d9fff2", -200, 640, 620]]
      .map(([c, x, y, d]) => el("div", { class: "blob", style: { background: c, left: `${x}px`, top: `${y}px`, width: `${d}px`, height: `${d}px` } }, root));
    blobs.forEach((b, i) => tl.to(b, { x: i % 2 ? -160 : 160, y: i < 2 ? 80 : -80, duration: 10, ease: "sine.inOut" }, 0));
    const sparks = [[300, 220, 1], [1620, 180, 0.7], [1500, 820, 1.2], [420, 820, 0.8], [980, 140, 0.6]]
      .map(([x, y, s]) => el("div", { class: "spark", style: { left: `${x}px`, top: `${y}px`, scale: String(s) } }, root));
    sparks.forEach((sp, i) => tl.fromTo(sp, { rotation: 0, scale: 0 }, { rotation: 180, scale: 1, duration: 0.9, ease: "elastic.out(1, 0.5)", repeat: 4, yoyo: true, repeatDelay: 0.6 }, 0.2 + i * 0.35));

    // The logo keeps its own colours (brand rule); the chrome treatment is for type only.
    const logo = el("div", { class: "abs", style: { left: "460px", top: "300px", width: "1000px", height: "240px" } }, root);
    H.logo(C.logo, { x: 0, y: 0, w: 1000, h: 240 }, logo);
    const kick = el("div", { class: "pill", text: C.KICKER, style: { left: "690px", top: "640px", fontSize: "52px" } }, root);

    const win = el("div", { class: "glass", style: { left: "200px", top: "180px", width: "1000px", height: "620px" } }, root);
    el("div", { class: "titlebar", html: `<i style='background:#ff8fb1'></i><i style='background:#ffd36e'></i><i style='background:#7ee0b5'></i><span style='margin-left:16px;font-weight:700;font-size:24px;color:#6b6f9a'>${(C.PRODUCT ?? BRAND.name).replace(/[<&]/g, "")}.exe</span>` }, win);
    el("div", { class: "chrome-ink", html: H.br(C.TITLE, 9), style: { fontWeight: 900, fontSize: "100px", lineHeight: 1.1, padding: "70px 56px 0" } }, win);
    el("div", { text: C.LINE, style: { fontWeight: 700, fontSize: "38px", padding: "30px 56px", color: "#4b4f7a" } }, win);
    const photo = el("div", { class: "glass", style: { left: "1270px", top: "240px", width: "460px", height: "460px", overflow: "hidden", borderRadius: "50%" } }, root);
    el("img", { src: C.product, style: { width: "100%", height: "100%", objectFit: "cover" } }, photo);
    const tag = el("div", { class: "pill", text: C.TAG, style: { left: "1360px", top: "730px", fontSize: "40px" } }, root);

    const num = el("div", { class: "abs chrome", text: C.NUM, style: { left: "0", width: "1920px", textAlign: "center", top: "90px", fontWeight: 900, fontSize: "640px", lineHeight: 0.9 } }, root);
    const lab = el("div", { class: "pill", text: C.LABEL, style: { left: "700px", top: "760px", fontSize: "56px" } }, root);

    const cta = el("div", { class: "abs chrome-ink", text: C.CTA, style: { left: "0", width: "1920px", textAlign: "center", top: "430px", fontWeight: 900, fontSize: "96px" } }, root);
    const url = el("div", { class: "pill", text: C.URL ?? "", style: { left: "760px", top: "640px", fontSize: "44px" } }, root);
    const logo2 = el("div", { class: "abs", style: { left: "710px", top: "230px", width: "500px", height: "140px" } }, root);
    H.logo(C.logo, { x: 0, y: 0, w: 500, h: 140 }, logo2);

    const all = [logo, kick, win, photo, tag, num, lab, cta, url, logo2];
    tl.set(all, { autoAlpha: 0 }, 0);
    const pop = (e, at, d = 0.9) => tl.fromTo(e, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: d, ease: "elastic.out(1, 0.55)" }, at);
    const bye = (els, at) => tl.to(els, { autoAlpha: 0, scale: 0.85, duration: 0.25, ease: "power2.in" }, at);
    const float = (e, from, to) => tl.fromTo(e, { y: 0 }, { y: -18, duration: 0.9, ease: "sine.inOut", repeat: Math.floor((to - from) / 0.9) - 1, yoyo: true }, from);

    pop(logo, 0.2, 1.2); pop(kick, 0.9); float(kick, 1.4, 2.3); // the logo holds still once it has landed
    bye([logo, kick], S.product[0] - 0.25);
    tl.fromTo(win, { autoAlpha: 0, y: 140, rotationX: 20 }, { autoAlpha: 1, y: 0, rotationX: 0, duration: 0.8, ease: "back.out(1.6)" }, S.product[0]);
    pop(photo, S.product[0] + 0.35); pop(tag, S.product[0] + 0.75); float(photo, S.product[0] + 1.2, S.stat[0] - 0.3);
    bye([win, photo, tag], S.stat[0] - 0.25);
    pop(num, S.stat[0] + 0.05, 1.1); pop(lab, S.stat[0] + 0.6);
    bye([num, lab], S.cta[0] - 0.25);
    pop(logo2, S.cta[0] + 0.05); pop(cta, S.cta[0] + 0.3); pop(url, S.cta[0] + 0.6);
  },
};
