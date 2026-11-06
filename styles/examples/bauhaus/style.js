// Bauhaus: three primary shapes persist through the whole film and re-compose each beat;
// type is set hard and black on a functional grid. Motion is mechanical: roll, drop, rotate.
window.STYLE = {
  build(tl, S, C, root) {
    const { el } = H;
    const rH = el("div", { class: "rule", style: { left: 0, top: "540px", width: "1920px", height: "6px", transformOrigin: "left" } }, root);
    const rV = el("div", { class: "rule", style: { left: "1000px", top: 0, width: "6px", height: "1080px", transformOrigin: "top" } }, root);
    const circle = el("div", { class: "shape circle", style: { width: "560px", height: "560px", left: "220px", top: "260px" } }, root);
    el("div", { class: "half" }, circle);
    circle.style.zIndex = 2;
    const square = el("div", { class: "shape square", style: { width: "380px", height: "380px", left: "610px", top: "150px" } }, root);
    const tri = el("div", { class: "shape tri", style: { width: "300px", height: "260px", left: "130px", top: "690px" } }, root);

    const logo = H.logo(C.logo, { x: 1100, y: 300, w: 620, h: 200, align: "left" }, root);
    const kicker = el("div", { class: "abs t-kicker", text: C.KICKER, style: { left: "1100px", top: "600px" } }, root);
    const tag = el("div", { class: "abs t-tag", text: C.TAG, style: { left: "1100px", top: "130px" } }, root);
    const title = el("div", { class: "abs t-title", html: H.br(C.TITLE, 5), style: { left: "1100px", top: "380px" } }, root);
    const line = el("div", { class: "abs t-line", html: H.br(C.LINE, 14), style: { left: "1100px", top: "690px" } }, root);
    const num = el("div", { class: "abs t-num", html: `<span>${C.NUM[0]}</span><span style="color:#d83a2b">${C.NUM.slice(1)}</span>`, style: { left: "1080px", top: "150px" } }, root);
    const label = el("div", { class: "abs t-label", text: C.LABEL, style: { left: "1100px", top: "640px" } }, root);
    const bars = [["#d83a2b", 300], ["#2a4fa3", 190], ["#f2c230", 120]].map(([c, h], i) => el("div", { class: "bar", style: { left: `${200 + i * 150}px`, height: `${h}px`, background: c } }, root));
    const cta = el("div", { class: "abs t-cta", html: H.br(C.CTA, 12), style: { left: "160px", top: "460px", lineHeight: 1.15 } }, root);
    const url = el("div", { class: "abs t-url", text: C.URL ?? "", style: { left: "160px", top: `${460 + H.lines(C.CTA, 12).length * 97 + 30}px` } }, root);
    const logo2 = H.logo(C.logo, { x: 160, y: 280, w: 380, h: 140, align: "left" }, root);

    const all = [logo, kicker, tag, title, line, num, label, ...bars, cta, url, logo2];
    tl.set(all, { autoAlpha: 0 }, 0);
    const E = "power3.out", M = "power3.inOut";

    // Beat 1 — grid draws, shapes arrive mechanically, logo and kicker lock in.
    tl.fromTo(rH, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: M }, 0);
    tl.fromTo(rV, { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: M }, 0.1);
    tl.fromTo(circle, { x: -900, rotation: -360 }, { x: 0, rotation: 0, duration: 1.0, ease: E }, 0.15);
    tl.fromTo(square, { y: -700 }, { y: 0, duration: 0.7, ease: "back.out(1.4)" }, 0.45);
    tl.fromTo(tri, { y: 500, rotation: 120 }, { y: 0, rotation: 0, duration: 0.8, ease: E }, 0.6);
    tl.fromTo(logo, { autoAlpha: 0, x: 60 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: E }, 1.0);
    tl.fromTo(kicker, { autoAlpha: 0, clipPath: "inset(0 100% 0 0)" }, { autoAlpha: 1, clipPath: "inset(0 0% 0 0)", duration: 0.5, ease: M }, 1.35);

    // Beat 2 — shapes re-compose into a poster: square becomes the left field, circle a sun, triangle points at the title.
    const b2 = S.product[0];
    tl.to([logo, kicker], { autoAlpha: 0, x: 40, duration: 0.25, ease: "power2.in" }, b2 - 0.2);
    tl.to(rH, { y: 270, duration: 0.6, ease: M }, b2);
    tl.to(square, { left: 0, top: 0, width: 1000, height: 1080, duration: 0.7, ease: M }, b2);
    tl.to(circle, { left: 300, top: 180, width: 400, height: 400, rotation: 180, duration: 0.7, ease: M }, b2);
    tl.to(tri, { left: 640, top: 720, rotation: 90, duration: 0.7, ease: M }, b2);
    tl.fromTo(tag, { autoAlpha: 0, scale: 0 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }, b2 + 0.5);
    tl.fromTo(title, { autoAlpha: 0, y: 80 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: E }, b2 + 0.6);
    tl.fromTo(line, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: E }, b2 + 0.95);

    // Beat 3 — the number takes over; shapes become a bar chart's ground.
    const b3 = S.stat[0];
    tl.to([tag, title, line], { autoAlpha: 0, duration: 0.2 }, b3 - 0.15);
    tl.to(square, { left: 0, top: 920, width: 1920, height: 160, duration: 0.6, ease: M }, b3);
    tl.to(circle, { left: 640, top: 150, width: 240, height: 240, rotation: 360, duration: 0.6, ease: M }, b3);
    tl.to(tri, { left: 1590, top: 640, rotation: 0, duration: 0.6, ease: M }, b3);
    tl.to(rH, { y: 380, duration: 0.6, ease: M }, b3);
    tl.to(rV, { x: -1000, duration: 0.6, ease: M }, b3);
    tl.fromTo(bars, { scaleY: 0, autoAlpha: 1 }, { scaleY: 1, autoAlpha: 1, duration: 0.6, stagger: 0.1, ease: "back.out(1.3)" }, b3 + 0.3);
    tl.fromTo(num, { autoAlpha: 0, y: 120 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: E }, b3 + 0.35);
    tl.fromTo(label, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: E }, b3 + 0.8);

    // Beat 4 — everything resolves into a lockup: three shapes in a row beside the logo.
    const b4 = S.cta[0];
    tl.to([num, label, ...bars], { autoAlpha: 0, duration: 0.2 }, b4 - 0.15);
    tl.to(rH, { y: 520, duration: 0.6, ease: M }, b4);
    tl.to(circle, { left: 1330, top: 360, width: 170, height: 170, duration: 0.6, ease: M }, b4);
    tl.to(square, { left: 1530, top: 360, width: 170, height: 170, duration: 0.6, ease: M }, b4);
    tl.to(tri, { left: 1730, top: 370, width: 170, height: 150, duration: 0.6, ease: M }, b4);
    tl.fromTo(logo2, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: E }, b4 + 0.3);
    tl.fromTo(cta, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: E }, b4 + 0.45);
    tl.fromTo(url, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, b4 + 0.8);
  },
};
