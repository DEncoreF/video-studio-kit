// Op Art: one black-and-white optical field redrawn every frame from time (rings that
// ripple, stripes that bulge); type sits on solid plates or inverts the field (difference).
window.STYLE = {
  build(tl, S, C, root) {
    const { el, svgEl } = H;
    const svg = svgEl("svg", { id: "op", viewBox: "0 0 1920 1080" });
    root.appendChild(svg);
    const RINGS = 34, STRIPES = 44;
    const rings = Array.from({ length: RINGS }, () => svg.appendChild(svgEl("circle", { fill: "none", stroke: "#0b0b0b" })));
    const stripes = Array.from({ length: STRIPES }, () => svg.appendChild(svgEl("path", { fill: "#0b0b0b" })));
    const state = { mix: 0, cx: 960, cy: 540, collapse: 0 }; // mix 0 = rings, 1 = stripes

    function draw(t) {
      const ringsOn = 1 - state.mix, k = 1 - state.collapse;
      rings.forEach((r, i) => {
        const base = (i + 1) * 34 * k + 6;
        const rad = base + Math.sin(t * 3 - i * 0.45) * 10 * k;
        r.setAttribute("cx", state.cx); r.setAttribute("cy", state.cy); r.setAttribute("r", Math.max(1, rad).toFixed(1));
        r.setAttribute("stroke-width", (17 * k * (0.6 + 0.4 * Math.cos(i * 0.5 + t))).toFixed(1));
        r.setAttribute("opacity", ringsOn);
      });
      stripes.forEach((p, i) => {
        const x0 = (i / STRIPES) * 1980 - 30, w = 1980 / STRIPES / 2;
        const pts = [], back = [];
        for (let y = -20; y <= 1100; y += 40) {
          const bulge = 90 * Math.exp(-(((y - 540) / 300) ** 2)) * Math.sin((x0 - 960) / 260 + t * 1.6);
          pts.push(`${(x0 + bulge).toFixed(1)},${y}`); back.unshift(`${(x0 + w + bulge * 1.15).toFixed(1)},${y}`);
        }
        p.setAttribute("d", `M${pts.join(" L")} L${back.join(" L")}Z`);
        p.setAttribute("opacity", state.mix);
      });
    }
    // Redraw after every child tween has rendered, so the field always reads the current state.
    tl.eventCallback("onUpdate", () => draw(tl.time()));
    draw(0);

    const logoPlate = el("div", { class: "plate dark", style: { left: "560px", top: "400px", width: "800px", height: "280px", display: "grid", placeItems: "center", borderRadius: "140px" } }, root);
    H.logo(C.logoReversed, { x: 130, y: 50, w: 540, h: 180 }, logoPlate);
    const kick = el("div", { class: "plate", text: C.KICKER, style: { left: "760px", top: "720px", fontWeight: 900, fontSize: "52px", letterSpacing: "10px" } }, root);
    const titlePlate = el("div", { class: "plate", style: { left: "0", top: "330px", width: "1920px", padding: "40px 160px 46px" } }, root);
    el("div", { text: C.TAG, style: { fontWeight: 700, fontSize: "34px", letterSpacing: "6px", marginBottom: "10px" } }, titlePlate);
    el("div", { text: C.TITLE, style: { fontWeight: 900, fontSize: "130px", lineHeight: 1 } }, titlePlate);
    const linePlate = el("div", { class: "plate dark", text: C.LINE, style: { left: "160px", top: "720px", fontSize: "38px", fontWeight: 500 } }, root);
    const num = el("div", { class: "abs diff", text: C.NUM, style: { left: "0", width: "1920px", textAlign: "center", top: "120px", fontSize: "720px", lineHeight: 0.85 } }, root);
    const lab = el("div", { class: "plate dark", text: C.LABEL, style: { left: "660px", top: "820px", fontSize: "64px", fontWeight: 900 } }, root);
    const ctaPlate = el("div", { class: "plate", style: { left: "0", top: "640px", width: "1920px", textAlign: "center", padding: "34px 0 40px" } }, root);
    el("div", { text: C.CTA, style: { fontWeight: 900, fontSize: "72px" } }, ctaPlate);
    el("div", { text: C.URL, style: { fontWeight: 700, fontSize: "36px", marginTop: "8px", letterSpacing: "4px" } }, ctaPlate);
    const logo2 = el("div", { class: "plate dark", style: { left: "690px", top: "330px", width: "540px", height: "200px", display: "grid", placeItems: "center", borderRadius: "100px" } }, root);
    H.logo(C.logoReversed, { x: 80, y: 35, w: 380, h: 130 }, logo2);

    const all = [logoPlate, kick, titlePlate, linePlate, num, lab, ctaPlate, logo2];
    tl.set(all, { autoAlpha: 0 }, 0);
    const wipe = (e, at, d = 0.6) => tl.fromTo(e, { autoAlpha: 1, clipPath: "inset(0 50% 0 50%)" }, { clipPath: "inset(0 0% 0 0%)", duration: d, ease: "expo.inOut" }, at);
    const out = (e, at) => tl.to(e, { clipPath: "inset(0 50% 0 50%)", duration: 0.35, ease: "expo.in" }, at);

    // Beat 1: rings bloom from centre, logo on a black pill.
    tl.fromTo(state, { collapse: 1 }, { collapse: 0, duration: 1.4, ease: "expo.out" }, 0);
    wipe(logoPlate, 0.7); wipe(kick, 1.2);
    // Beat 2: field turns into bulging stripes; title on a full-width plate.
    out([logoPlate, kick], S.product[0] - 0.4);
    tl.to(state, { mix: 1, duration: 0.6, ease: "power2.inOut" }, S.product[0] - 0.3);
    wipe(titlePlate, S.product[0] + 0.2, 0.7); wipe(linePlate, S.product[0] + 0.8);
    // Beat 3: back to rings, centre moves; the number inverts the field.
    out([titlePlate, linePlate], S.stat[0] - 0.4);
    tl.to(state, { mix: 0, cx: 960, cy: 470, duration: 0.6, ease: "power2.inOut" }, S.stat[0] - 0.3);
    tl.fromTo(num, { autoAlpha: 0, scale: 1.2 }, { autoAlpha: 1, scale: 1, duration: 0.7, ease: "expo.out" }, S.stat[0] + 0.1);
    wipe(lab, S.stat[0] + 0.7);
    // Beat 4: rings collapse to a point behind the logo.
    tl.to([num, lab], { autoAlpha: 0, duration: 0.3 }, S.cta[0] - 0.3);
    tl.to(state, { cy: 440, duration: 0.5, ease: "power2.inOut" }, S.cta[0] - 0.3);
    tl.to(state, { collapse: 0.55, duration: 1.2, ease: "expo.inOut" }, S.cta[0]);
    tl.fromTo(logo2, { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "expo.out" }, S.cta[0] + 0.3);
    wipe(ctaPlate, S.cta[0] + 0.5);
  },
};
