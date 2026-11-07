// Sports Parent IQ: Game Day, the 3D world.
// three.js r160: real-time floodlights and sun with shadows, bloom, an instanced crowd, articulated players,
// and a car whose rear-view mirror is a second camera. Same interface as the 2D canvas world in index.html,
// which stays as the fallback for devices without WebGL.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const SKIN = [0xf1c7a1, 0xd8a07a, 0xa7704d, 0x6d4530, 0xf6d8bb];
const HAIR = [0x2b1d14, 0x5a3a22, 0x141414, 0xc99b52, 0x7a4a2a];
const DISPLAY = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';

export function createWorld({ reduced = false } = {}) {
  /* ================= renderer, camera, post-processing ================= */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  let W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.id = "world3d";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", display: "block", opacity: "0", transition: "opacity .9s ease" });
  document.getElementById("world").after(canvas);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 1600);
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.8, 0.55, 0.86);
  composer.addPass(bloom);
  const fx = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 1, 1) },
      uTint: { value: 0 }, uTintC: { value: new THREE.Color(1, 0.2, 0.2) }, uVig: { value: 0.6 }, uGrain: { value: 0.03 },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uFlash, uTint, uVig, uGrain; uniform vec3 uFlashC, uTintC; varying vec2 vUv;
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5; float r = dot(d, d);
        vec3 c = vec3(texture2D(tDiffuse, vUv + d * r * 0.02).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * r * 0.02).b);
        c = mix(c, c * uTintC * 1.7, uTint);
        c *= 1.0 - uVig * smoothstep(0.08, 0.6, r * 1.65);
        c += (rnd(vUv * 911.0 + fract(uTime * 7.0) * 53.0) - 0.5) * uGrain;
        c = mix(c, uFlashC, uFlash);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(fx);
  composer.addPass(new OutputPass());

  /* ================= helpers ================= */
  const mats = new Map();
  const mat = (color, o = {}) => {
    const k = color + "|" + JSON.stringify(o);
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
    return mats.get(k);
  };
  function tex(w, h, draw, o = {}) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    Object.assign(t, o); t.needsUpdate = true;
    t.redraw = () => { draw(c.getContext("2d"), w, h); t.needsUpdate = true; };
    return t;
  }
  const GLOW = tex(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.18, "rgba(255,255,255,.6)"); g.addColorStop(0.45, "rgba(255,255,255,.14)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  });
  const glowSprite = (color, size, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.set(size, size, 1);
    return s;
  };
  function skyDome() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h * 1.5, 0.0, 1.0), 0.6)) : mix(mid, bot, clamp(-h * 6.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0); }",
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), m);
    s.renderOrder = -10; s.frustumCulled = false;
    return s;
  }
  const setSky = (s, top, mid, bot) => { const u = s.material.uniforms; u.top.value.set(top); u.mid.value.set(mid); u.bot.value.set(bot); };
  const beamMaterial = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0xfff0d2) }, uOpacity: { value: 0 } },
    vertexShader: "varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float fall = pow(vH, 2.4); gl_FragColor = vec4(uColor, uOpacity * edge * fall); }",
  });
  const UP_NEG = new THREE.Vector3(0, -1, 0);
  function makeBeam(radius = 0.22) {
    const geo = new THREE.ConeGeometry(radius, 1, 40, 1, true);
    geo.translate(0, -0.5, 0);
    const m = new THREE.Mesh(geo, beamMaterial());
    m.frustumCulled = false;
    return m;
  }
  function aimBeam(m, from, to) {
    const dir = new THREE.Vector3().subVectors(to, from), len = dir.length();
    m.position.copy(from); m.quaternion.setFromUnitVectors(UP_NEG, dir.normalize()); m.scale.setScalar(len);
  }
  function wrapText(x, text, px, py, maxW, lh) {
    const words = String(text).split(" "); let line = "";
    for (const w of words) { const next = line ? line + " " + w : w; if (x.measureText(next).width > maxW && line) { x.fillText(line, px, py); py += lh; line = w; } else line = next; }
    if (line) x.fillText(line, px, py);
  }

  /* ================= people: stylised characters, every one built in code ================= */
  // Each body segment is merged into one mesh with vertex colours, so a detailed character costs about a dozen draw calls.
  const PEOPLE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 });
  const geoCache = new Map();
  const cached = (key, build) => { if (!geoCache.has(key)) geoCache.set(key, build()); return geoCache.get(key); };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(scl[0], scl[1], scl[2]));
    geo.applyMatrix4(_m);
    const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return geo;
  }
  const merge = (parts) => { const g = mergeGeometries(parts, false); if (!g) throw new Error("merge failed"); parts.forEach((p) => p.dispose()); return g; };
  const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
  const SPH = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
  const CAP = (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 4, s);
  const CYL = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
  const TOR = (r, t, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 8, 24, arc);
  const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  function buildHead({ skin, hair, style, faced, cap }) {
    const p = [
      part(CYL(0.045, 0.05, 0.09, 12), skin, [0, 0.03, 0]),
      part(SPH(0.135, 24, 18), skin, [0, 0.15, 0], [0, 0, 0], [1, 1.04, 0.98]),
      part(SPH(0.03, 10, 8), skin, [0.134, 0.15, -0.005], [0, 0, 0], [0.45, 1, 0.75]),
      part(SPH(0.03, 10, 8), skin, [-0.134, 0.15, -0.005], [0, 0, 0], [0.45, 1, 0.75]),
      part(SPH(0.022, 10, 8), shade(skin, 0.93), [0, 0.13, 0.132], [0, 0, 0], [0.9, 0.8, 1]),
      part(BOX(0.042, 0.009, 0.012), shade(hair, 0.85), [0.05, 0.2, 0.118], [0, 0, -0.12]),
      part(BOX(0.042, 0.009, 0.012), shade(hair, 0.85), [-0.05, 0.2, 0.118], [0, 0, 0.12]),
    ];
    if (!faced) {
      for (const s of [-1, 1]) {
        p.push(part(SPH(0.026, 12, 10), 0xffffff, [s * 0.05, 0.16, 0.112], [0, 0, 0], [1, 1.1, 0.55]));
        p.push(part(SPH(0.015, 10, 8), 0x3b2414, [s * 0.05, 0.158, 0.122]));
        p.push(part(SPH(0.005, 6, 4), 0xffffff, [s * 0.05 + 0.006, 0.166, 0.134]));
      }
      p.push(part(TOR(0.03, 0.006, Math.PI), 0x8a3a2a, [0, 0.09, 0.118], [0, 0, Math.PI]));
    }
    if (cap) {
      p.push(part(SPH(0.13, 16, 10), hair, [0, 0.135, -0.035], [0, 0, 0], [1.02, 0.85, 0.95]));
      p.push(part(new THREE.SphereGeometry(0.147, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), cap, [0, 0.165, 0], [-0.1, 0, 0]));
      p.push(part(new THREE.CylinderGeometry(0.135, 0.135, 0.012, 22, 1, false, -Math.PI / 2, Math.PI), cap, [0, 0.185, 0.07], [0.18, 0, 0], [1, 1, 1.1]));
      p.push(part(SPH(0.013, 6, 4), shade(cap, 0.8), [0, 0.31, -0.012]));
    } else {
      p.push(part(new THREE.SphereGeometry(0.143, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0, 0.155, -0.008], [-0.38, 0, 0], [1.02, 1, 1.04]));
      p.push(part(SPH(0.132, 16, 12), hair, [0, 0.14, -0.032], [0, 0, 0], [1.03, 0.97, 0.95]));
      if (style === "short" || style === "spiky" || style === "buns") p.push(part(SPH(0.07, 12, 8), hair, [0.02, 0.245, 0.085], [0, 0, -0.2], [1.6, 0.5, 0.8]));
      if (style === "spiky") for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push(part(new THREE.ConeGeometry(0.03, 0.085, 6), hair, [Math.cos(a) * 0.075, 0.285, Math.sin(a) * 0.075 - 0.01], [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55])); }
      if (style === "ponytail") {
        p.push(part(CAP(0.045, 0.13, 10), hair, [0, 0.12, -0.17], [0.55, 0, 0]));
        p.push(part(TOR(0.034, 0.011), 0xff5b9e, [0, 0.19, -0.14], [0.9, 0, 0]));
        p.push(part(SPH(0.07, 12, 8), hair, [-0.02, 0.245, 0.085], [0, 0, 0.2], [1.6, 0.5, 0.8]));
      }
      if (style === "curly") for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2, e = 0.35 + (i % 3) * 0.33; p.push(part(SPH(0.046, 8, 6), hair, [Math.cos(a) * Math.sin(e) * 0.13, 0.155 + Math.cos(e) * 0.13, Math.sin(a) * Math.sin(e) * 0.13 - 0.02])); }
      if (style === "buns") for (const s of [-1, 1]) p.push(part(SPH(0.058, 12, 8), hair, [s * 0.09, 0.27, -0.03]));
    }
    return merge(p);
  }
  function buildTorso(shirt, trim) {
    const prof = [[0.001, -0.02], [0.13, -0.01], [0.143, 0.05], [0.152, 0.12], [0.162, 0.2], [0.17, 0.25], [0.152, 0.29], [0.1, 0.312], [0.045, 0.322]].map(([x, y]) => new THREE.Vector2(x, y));
    return merge([
      part(new THREE.LatheGeometry(prof, 22), shirt, [0, 0, 0], [0, 0, 0], [1, 1, 0.72]),
      part(TOR(0.056, 0.014), trim, [0, 0.316, 0.004], [Math.PI / 2, 0, 0], [1, 1, 0.9]),
      part(TOR(0.15, 0.012), trim, [0, -0.005, 0], [Math.PI / 2, 0, 0], [0.88, 0.62, 1]),
    ]);
  }
  const buildPelvis = (c, trim) => merge([part(CYL(0.132, 0.148, 0.16, 16), c, [0, 0.745, 0], [0, 0, 0], [1, 1, 0.8]), part(TOR(0.13, 0.011), trim, [0, 0.82, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1])]);
  const buildUpper = (sleeve, skin, long) => merge(long
    ? [part(CAP(0.05, 0.15, 10), sleeve, [0, -0.1, 0])]
    : [part(CYL(0.062, 0.054, 0.12, 12), sleeve, [0, -0.045, 0]), part(CAP(0.046, 0.13, 10), skin, [0, -0.115, 0])]);
  const buildFore = (skin, sleeve, long, phone) => {
    const p = [part(CAP(0.041, 0.13, 10), long ? sleeve : skin, [0, -0.08, 0]), part(SPH(0.046, 12, 10), skin, [0, -0.19, 0.005], [0, 0, 0], [0.9, 1.05, 0.75])];
    if (phone) p.push(part(BOX(0.075, 0.145, 0.012), 0x111111, [0, -0.225, 0.045], [0.3, 0, 0]));
    return merge(p);
  };
  const buildThigh = (shorts, skin, pants) => merge(pants
    ? [part(CYL(0.074, 0.06, 0.33, 12), pants, [0, -0.15, 0])]
    : [part(CYL(0.085, 0.076, 0.13, 12), shorts, [0, -0.035, 0]), part(CAP(0.064, 0.17, 10), skin, [0, -0.16, 0])]);
  const buildShin = (skin, socks, stripe, shoe, sole, pants) => {
    const p = [];
    if (pants) p.push(part(CYL(0.06, 0.054, 0.3, 12), pants, [0, -0.15, 0]));
    else {
      p.push(part(CAP(0.055, 0.07, 10), skin, [0, -0.025, 0]));
      p.push(part(CYL(0.059, 0.05, 0.22, 12), socks, [0, -0.17, 0]));
      p.push(part(CYL(0.0595, 0.058, 0.02, 12), stripe, [0, -0.085, 0]));
      p.push(part(CYL(0.059, 0.0575, 0.02, 12), stripe, [0, -0.115, 0]));
    }
    p.push(part(CAP(0.052, 0.1, 10), shoe, [0, -0.3, 0.04], [Math.PI / 2, 0, 0], [1.05, 1, 0.92]));
    p.push(part(BOX(0.104, 0.022, 0.22), sole, [0, -0.34, 0.04]));
    return merge(p);
  };
  const NUM_GEO = new THREE.PlaneGeometry(0.13, 0.13), numMats = new Map(), numTexs = [];
  function numberMat(n, color) {
    const key = n + "|" + color;
    if (!numMats.has(key)) {
      const t = tex(128, 128, (x) => { x.clearRect(0, 0, 128, 128); x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `400 116px ${DISPLAY}`; x.fillText(String(n), 64, 72); });
      numTexs.push(t);
      numMats.set(key, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    }
    return numMats.get(key);
  }
  const stripeTex = tex(64, 64, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#151515" : "#f2f2f2"; x.fillRect(i * 8, 0, 8, 64); } }, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  stripeTex.repeat.set(6, 1);
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.75 });
  const STYLES = ["short", "spiky", "ponytail", "curly", "buns"];
  function person(o = {}) {
    const { shirt = 0xffd23f, trim = 0x1b2a49, shorts = 0x1b2a49, socks = shirt, stripe = trim, shoe = 0x1f1f24, sole = 0xf2f2f2, skin = pick(SKIN), hair = pick(HAIR),
      style = pick(STYLES), number = 0, scale = 1, adult = false, pants = 0, cap = 0, stripes = false, faced = false, phone = false, shadow = true } = o;
    const longSleeves = adult && !stripes;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const mk = (geo, cast, material = PEOPLE) => { const m = new THREE.Mesh(geo, material); m.castShadow = shadow && cast; return m; };
    body.add(mk(cached(`pel|${pants || shorts}|${trim}`, () => buildPelvis(pants || shorts, trim)), false));
    const spine = new THREE.Group(); spine.position.y = 0.79; body.add(spine);
    spine.add(mk(cached(`tor|${shirt}|${trim}`, () => buildTorso(shirt, trim)), true, stripes ? stripeMat : PEOPLE));
    if (number) {
      const np = new THREE.Mesh(NUM_GEO, numberMat(number, "#" + new THREE.Color(stripes ? 0x111111 : trim).getHexString()));
      np.position.set(0, 0.175, -0.119); np.rotation.y = Math.PI; spine.add(np);
    }
    const neck = new THREE.Group(); neck.position.y = 0.31; spine.add(neck);
    neck.add(mk(cached(`head|${skin}|${hair}|${style}|${faced}|${cap}`, () => buildHead({ skin, hair, style, faced, cap })), true));
    const arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(s * 0.168, 0.265, 0); spine.add(shoulder);
      shoulder.add(mk(cached(`up|${shirt}|${skin}|${longSleeves}|${stripes}`, () => buildUpper(stripes ? 0xf2f2f2 : shirt, skin, longSleeves)), false));
      const elbow = new THREE.Group(); elbow.position.y = -0.205; shoulder.add(elbow);
      const hasPhone = phone && s > 0;
      elbow.add(mk(cached(`fo|${skin}|${shirt}|${longSleeves}|${hasPhone}`, () => buildFore(skin, shirt, longSleeves, hasPhone)), false));
      arms.push({ shoulder, elbow });
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.075, 0.7, 0); body.add(hip);
      hip.add(mk(cached(`th|${shorts}|${skin}|${pants}`, () => buildThigh(shorts, skin, pants)), true));
      const knee = new THREE.Group(); knee.position.y = -0.31; hip.add(knee);
      knee.add(mk(cached(`sh|${skin}|${socks}|${stripe}|${shoe}|${sole}|${pants}`, () => buildShin(skin, socks, stripe, shoe, sole, pants)), true));
      legs.push({ hip, knee });
    }
    if (adult) { spine.scale.set(1.05, 1.12, 1.05); neck.scale.setScalar(0.86); }
    root.scale.setScalar(scale);
    return { root, body, spine, legs, arms, neck, phase: rand(0, 6.28), mood: "neutral" };
  }
  const FG = { eye: SPH(0.026, 14, 10), pupil: SPH(0.015, 12, 8), shine: SPH(0.005, 6, 4), mouth: new THREE.TorusGeometry(0.03, 0.007, 6, 16, Math.PI) };
  function addFace(p) {
    const white = mat(0xffffff, { roughness: 0.2 }), iris = mat(0x3b2414, { roughness: 0.3 }), shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyes = [], pupils = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(FG.eye, white); e.position.set(s * 0.05, 0.16, 0.112); e.scale.set(1, 1.1, 0.55); p.neck.add(e); eyes.push(e);
      const q = new THREE.Group(); q.position.set(s * 0.05, 0.158, 0.122); p.neck.add(q);
      q.add(new THREE.Mesh(FG.pupil, iris));
      const h = new THREE.Mesh(FG.shine, shine); h.position.set(0.006, 0.008, 0.012); q.add(h);
      pupils.push(q);
    }
    const mouth = new THREE.Mesh(FG.mouth, mat(0x8a3a2a, { roughness: 0.6 })); mouth.position.set(0, 0.09, 0.118); p.neck.add(mouth);
    p.face = { eyes, pupils, mouth };
    setMood(p, "neutral");
  }
  function setMood(p, m) {
    p.mood = m;
    const mo = p.face.mouth;
    if (m === "smile") { mo.rotation.set(0, 0, Math.PI); mo.scale.set(1.25, 1.15, 1); mo.position.y = 0.092; }
    else if (m === "sad" || m === "down") { mo.rotation.set(0, 0, 0); mo.scale.set(0.85, 0.7, 1); mo.position.y = 0.074; }
    else { mo.rotation.set(0, 0, Math.PI); mo.scale.set(1, 0.25, 1); mo.position.y = 0.088; }
  }
  function blink(p, t) {
    const closed = ((t + p.phase) % 3.7) < 0.12;
    p.face.eyes.forEach((e) => { e.scale.y = closed ? 0.12 : 1.1; });
    p.face.pupils.forEach((q) => { q.visible = !closed; });
  }
  function addHeadphones(p) {
    const g = new THREE.Group(), red = mat(0xe9473b, { roughness: 0.35 });
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.016, 8, 26, Math.PI), red));
    for (const s of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 18), red); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.148, 0, 0); g.add(cup); }
    g.position.y = 0.15; g.visible = false; p.neck.add(g); p.phones = g;
  }

  /* poses: a small procedural rig, shoulders and elbows, hips and knees, spine and neck */
  function poseStand(p, t, sway = 1) {
    const b = Math.sin(t * 1.6 + p.phase);
    p.legs.forEach((l) => { l.hip.rotation.set(0, 0, 0); l.knee.rotation.x = 0.05; });
    p.arms[0].shoulder.rotation.set(0.04, 0, -0.1 - b * 0.02 * sway); p.arms[1].shoulder.rotation.set(0.04, 0, 0.1 + b * 0.02 * sway);
    p.arms.forEach((a) => a.elbow.rotation.set(-0.18, 0, 0));
    p.spine.rotation.set(b * 0.015 * sway, 0, Math.sin(t * 0.7 + p.phase) * 0.02 * sway);
    p.neck.rotation.set(0, Math.sin(t * 0.5 + p.phase) * 0.15 * sway, 0);
    p.body.position.y = 0; p.body.rotation.set(0, 0, 0);
  }
  function poseRun(p, t, speed = 1, lean = 0.14) {
    const ph = t * 8.5 * speed + p.phase, s = Math.sin(ph), c = Math.cos(ph);
    p.legs[0].hip.rotation.set(s * 0.8, 0, 0); p.legs[1].hip.rotation.set(-s * 0.8, 0, 0);
    p.legs[0].knee.rotation.x = 0.3 + Math.max(0, -c) * 1.35; p.legs[1].knee.rotation.x = 0.3 + Math.max(0, c) * 1.35;
    p.arms[0].shoulder.rotation.set(-s * 0.8, 0, -0.12); p.arms[1].shoulder.rotation.set(s * 0.8, 0, 0.12);
    p.arms[0].elbow.rotation.set(-1.25 - s * 0.2, 0, 0); p.arms[1].elbow.rotation.set(-1.25 + s * 0.2, 0, 0);
    p.spine.rotation.set(0.04, s * 0.18, 0); p.neck.rotation.set(-0.05, -s * 0.12, 0);
    p.body.position.y = Math.abs(c) * 0.05; p.body.rotation.set(lean, 0, 0);
  }
  function poseCheer(p, t) {
    poseStand(p, t, 0);
    const j = Math.abs(Math.sin(t * 9 + p.phase));
    p.arms[0].shoulder.rotation.set(-2.75, 0, -0.35); p.arms[1].shoulder.rotation.set(-2.75, 0, 0.35);
    p.arms.forEach((a) => a.elbow.rotation.set(-0.35, 0, 0));
    p.legs.forEach((l) => { l.knee.rotation.x = 0.35 * (1 - j); l.hip.rotation.x = -0.18 * (1 - j); });
    p.body.position.y = j * 0.15;
  }
  function poseSit(p, t) {
    p.legs.forEach((l, i) => { l.hip.rotation.set(-1.52, 0, i ? -0.06 : 0.06); l.knee.rotation.x = 1.5; });
    p.arms[0].shoulder.rotation.set(-0.35, 0, -0.08); p.arms[1].shoulder.rotation.set(-0.35, 0, 0.08);
    p.arms.forEach((a) => a.elbow.rotation.set(-0.9, 0, 0));
    p.body.position.y = -0.21; p.body.rotation.set(0, 0, 0);
    p.spine.rotation.set(0.08 + Math.sin(t * 1.1 + p.phase) * 0.02, 0, 0);
  }
  function poseSignal(p, t) {
    poseStand(p, t, 0);
    const w = Math.sin(t * 9) * 0.3;
    p.arms[0].shoulder.rotation.set(0, 0, -1.5 + w); p.arms[1].shoulder.rotation.set(0, 0, 1.5 - w);
    p.arms.forEach((a) => a.elbow.rotation.set(0, 0, 0));
  }
  function poseCross(p, t) {
    poseStand(p, t, 0.6);
    p.arms[0].shoulder.rotation.set(-0.3, 0, -0.3); p.arms[1].shoulder.rotation.set(-0.3, 0, 0.3);
    p.arms[0].elbow.rotation.set(-1.75, 0.5, 0); p.arms[1].elbow.rotation.set(-1.75, -0.5, 0);
  }
  function posePhone(p, t) {
    poseStand(p, t, 0.4);
    p.arms[1].shoulder.rotation.set(-0.55, 0, 0.18); p.arms[1].elbow.rotation.set(-1.7, -0.3, 0);
    p.neck.rotation.x = 0.45;
  }

  /* ================= the stadium: morning, bench, bad call, walk back and the reveal ================= */
  const stadium = new THREE.Scene();
  stadium.fog = new THREE.FogExp2(0x05070d, 0.006);
  const sky = skyDome(); stadium.add(sky);
  const starGeo = new THREE.BufferGeometry();
  { const a = []; for (let i = 0; i < 1200; i++) { const th = rand(0, Math.PI * 2), y = rand(0.03, 1), s = Math.sqrt(1 - y * y); a.push(900 * s * Math.cos(th), 900 * y, 900 * s * Math.sin(th)); } starGeo.setAttribute("position", new THREE.Float32BufferAttribute(a, 3)); }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  stadium.add(stars);
  const moon = new THREE.Group();
  moon.add(new THREE.Mesh(new THREE.CircleGeometry(15, 40), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false })), glowSprite(0x9fb4ff, 170, 0.45));
  moon.position.set(300, 300, -700); moon.lookAt(0, 0, 0); stadium.add(moon);
  const sunGlow = glowSprite(0xfff0d0, 420, 0.85); stadium.add(sunGlow);
  const hemi = new THREE.HemisphereLight(0x8899bb, 0x1a241a, 0.2); stadium.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dd, 3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 42, bottom: -42, near: 1, far: 280 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  stadium.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), mat(0x203322, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; stadium.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(100, 74), mat(0x3a843c, { roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = 0.015; apron.receiveShadow = true; stadium.add(apron);
  const FW = 90, FD = 56;
  const fieldTex = tex(2048, 1280, (x, w, h) => {
    const bands = 18;
    for (let i = 0; i < bands; i++) { x.fillStyle = i % 2 ? "#3a873c" : "#449648"; x.fillRect(Math.floor(i * w / bands), 0, Math.ceil(w / bands) + 1, h); }
    for (let i = 0; i < 70000; i++) { x.fillStyle = Math.random() < 0.55 ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.04)"; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    const sx = w / FW, sy = h / FD;
    const wear = (cx, cy, r) => { const g = x.createRadialGradient(cx * sx, cy * sy, 0, cx * sx, cy * sy, r * sx); g.addColorStop(0, "rgba(130,108,64,.3)"); g.addColorStop(1, "rgba(130,108,64,0)"); x.fillStyle = g; x.fillRect((cx - r) * sx, (cy - r) * sy, 2 * r * sx, 2 * r * sy); };
    wear(FW / 2, FD / 2, 5); wear(6, FD / 2, 6); wear(FW - 6, FD / 2, 6);
    x.strokeStyle = "rgba(250,250,244,.95)"; x.fillStyle = "rgba(250,250,244,.95)"; x.lineWidth = 0.14 * sx;
    const m = 3, cx = FW / 2, cy = FD / 2;
    x.strokeRect(m * sx, m * sy, (FW - 2 * m) * sx, (FD - 2 * m) * sy);
    x.beginPath(); x.moveTo(cx * sx, m * sy); x.lineTo(cx * sx, (FD - m) * sy); x.stroke();
    x.beginPath(); x.arc(cx * sx, cy * sy, 7 * sx, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(cx * sx, cy * sy, 0.25 * sx, 0, Math.PI * 2); x.fill();
    for (const side of [0, 1]) {
      const gx = side ? FW - m : m, dir = side ? -1 : 1;
      x.strokeRect(Math.min(gx, gx + dir * 14) * sx, (cy - 15) * sy, 14 * sx, 30 * sy);
      x.strokeRect(Math.min(gx, gx + dir * 5) * sx, (cy - 6) * sy, 5 * sx, 12 * sy);
      x.beginPath(); x.arc((gx + dir * 10) * sx, cy * sy, 7 * sx, side ? Math.PI - 0.96 : -0.96, side ? Math.PI + 0.96 : 0.96); x.stroke();
      x.beginPath(); x.arc((gx + dir * 10) * sx, cy * sy, 0.22 * sx, 0, Math.PI * 2); x.fill();
    }
  });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.92 }));
  field.rotation.x = -Math.PI / 2; field.position.y = 0.03; field.receiveShadow = true; stadium.add(field);

  const netTex = tex(128, 128, (x) => { x.strokeStyle = "rgba(255,255,255,.9)"; x.lineWidth = 3; for (let i = 0; i <= 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); } }, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  function goal(side) {
    const g = new THREE.Group(), white = mat(0xf4f4f4, { roughness: 0.35 });
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2, 10);
    for (const z of [-3, 3]) { const p = new THREE.Mesh(postGeo, white); p.position.set(0, 1, z); p.castShadow = true; g.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.12, 10), white); bar.rotation.x = Math.PI / 2; bar.position.y = 2; bar.castShadow = true; g.add(bar);
    const nm = (rx, ry) => { const t = netTex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }); };
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), nm(6, 2)); back.rotation.y = Math.PI / 2; back.position.set(side * 1.5, 1, 0); g.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 6), nm(1.5, 6)); top.rotation.x = -Math.PI / 2; top.position.set(side * 0.75, 2, 0); g.add(top);
    for (const z of [-3, 3]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), nm(1.5, 2)); s.position.set(side * 0.75, 1, z); g.add(s); }
    g.position.set(side * 42, 0, 0);
    return g;
  }
  stadium.add(goal(-1), goal(1));

  /* the main stand across the field, with its roof, a crowd and the scoreboard */
  const TIERS = 9, STW = 78, TD = 0.85, TH = 0.42, FRONT = -29.6, backZ = FRONT - TIERS * TD;
  const concrete = mat(0x8a8d95, { roughness: 0.92 });
  for (let r = 0; r < TIERS; r++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(STW, TH * (r + 1), TD), concrete);
    b.position.set(0, TH * (r + 1) / 2, FRONT - TD / 2 - r * TD); b.receiveShadow = true; b.castShadow = true; stadium.add(b);
  }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(STW + 2, 6.5, 0.4), mat(0x5d6270, { roughness: 0.9 }));
  wall.position.set(0, 3.25, backZ - 0.2); wall.castShadow = true; wall.receiveShadow = true; stadium.add(wall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(STW + 4, 0.3, 10.5), mat(0x2b303b, { roughness: 0.55, metalness: 0.45 }));
  roof.position.set(0, 7.9, backZ + 4.6); roof.rotation.x = -0.06; roof.castShadow = true; stadium.add(roof);
  for (let i = -4; i <= 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.9, 10), mat(0x3a3f4a, { metalness: 0.4, roughness: 0.5 })); c.position.set(i * 9.5, 3.95, backZ + 0.3); c.castShadow = true; stadium.add(c); }
  const roofLights = new THREE.Mesh(new THREE.BoxGeometry(STW, 0.06, 0.25), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4dd, emissiveIntensity: 0 }));
  roofLights.position.set(0, 7.68, FRONT + 1.6); stadium.add(roofLights);

  const adDraw = (x, w, h) => {
    x.fillStyle = "#0b1a3a"; x.fillRect(0, 0, w, h);
    const seg = ["KSNN", "SPORTS PARENT IQ", "KIDS SPORTS NEWS NETWORK", "GAME DAY"];
    let px = 24, k = 0; x.textBaseline = "middle";
    while (px < w) { const s = seg[k % seg.length]; x.font = `400 ${k % 2 ? 58 : 70}px ${DISPLAY}`; x.fillStyle = k % 2 ? "#ffffff" : "#ffd23f"; x.fillText(s, px, h / 2 + 3); px += x.measureText(s).width + 80; k++; }
  };
  const adTex = tex(4096, 96, adDraw);
  const adMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0.9, roughness: 0.4 });
  const dark = mat(0x1b1d22, { roughness: 0.6 });
  const ads = new THREE.Mesh(new THREE.BoxGeometry(76, 0.9, 0.12), [dark, dark, dark, dark, adMat, dark]);
  ads.position.set(0, 0.45, -27.2); ads.castShadow = true; stadium.add(ads);

  const boardCanvas = document.createElement("canvas"); boardCanvas.width = 1024; boardCanvas.height = 416;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = aniso;
  let boardLines = ["KIDS SPORTS NEWS NETWORK", "GAME DAY", "SPORTS PARENT IQ"];
  function drawBoard() {
    const x = boardCanvas.getContext("2d"), w = 1024, h = 416;
    x.fillStyle = "#04060b"; x.fillRect(0, 0, w, h);
    x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = "rgba(255,170,40,.95)"; x.shadowBlur = 26; x.fillStyle = "#ffcf4a";
    x.font = `400 66px ${DISPLAY}`; x.fillText(boardLines[0].toUpperCase(), w / 2, 70);
    let fs = 230; x.font = `400 ${fs}px ${DISPLAY}`;
    while (x.measureText(boardLines[1]).width > 940 && fs > 60) { fs -= 10; x.font = `400 ${fs}px ${DISPLAY}`; }
    x.fillText(boardLines[1], w / 2, 220);
    x.font = "800 46px Inter, sans-serif"; x.fillStyle = "#ffe7a3"; x.fillText(boardLines[2], w / 2, 360);
    x.shadowBlur = 0; x.fillStyle = "rgba(0,0,0,.42)";
    for (let yy = 0; yy < h; yy += 6) x.fillRect(0, yy, w, 2);
    for (let xx = 0; xx < w; xx += 6) x.fillRect(xx, 0, 2, h);
    boardTex.needsUpdate = true;
  }
  drawBoard();
  const frameMat = mat(0x15181f, { metalness: 0.5, roughness: 0.4 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 1.6, roughness: 0.4 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(17, 7, 0.7), [frameMat, frameMat, frameMat, frameMat, boardMat, frameMat]);
  board.position.set(0, 13.8, backZ - 2); stadium.add(board);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10.5, 0.5), frameMat); leg.position.set(s * 6, 5.25, backZ - 2.2); leg.castShadow = true; stadium.add(leg); }

  /* an instanced crowd: about a thousand fans, two draw calls */
  const PER = 130, crowd = [];
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.19, 0.3, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.85 }), TIERS * PER);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), TIERS * PER);
  const SHIRT = [0xffd23f, 0xffffff, 0xe9473b, 0x3d7bd9, 0x2fbf71, 0xf28c28, 0xb6bfcc, 0xff7aa8, 0x1b2a49, 0x6c4bd8];
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let r = 0; r < TIERS; r++) for (let k = 0; k < PER; k++) {
    const i = crowd.length;
    crowd.push({ x: -STW / 2 + 1 + k * ((STW - 2) / PER) + rand(-0.12, 0.12), y: TH * (r + 1), z: FRONT - TD * 0.55 - r * TD, ph: rand(0, 6.28), f: rand(1.6, 3.2), empty: Math.random() < 0.1 });
    bodies.setColorAt(i, col.setHex(pick(SHIRT))); heads.setColorAt(i, col.setHex(pick(SKIN)));
    if (crowd[i].empty) { m4.makeScale(0, 0, 0); bodies.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); }
  }
  bodies.receiveShadow = true; heads.receiveShadow = true; bodies.frustumCulled = false; heads.frustumCulled = false;
  stadium.add(bodies, heads);

  /* trees around the ground */
  const treeN = 80;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), mat(0x4a3423), treeN);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 7, 8), mat(0x22422a, { roughness: 0.95 }), treeN);
  for (let i = 0; i < treeN; i++) {
    let x, z;
    if (i < 46) { x = rand(-85, 85); z = rand(-62, -48); } else { x = (i % 2 ? 1 : -1) * rand(56, 80); z = rand(-45, 30); }
    const s = rand(0.8, 1.45), q = new THREE.Quaternion();
    m4.compose(new THREE.Vector3(x, 1.5 * s, z), q, new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 6.5 * s, z), q, new THREE.Vector3(s, s, s)); crowns.setMatrixAt(i, m4);
  }
  crowns.castShadow = true; stadium.add(trunks, crowns);

  /* four floodlight towers. Index order matches the 2D world: 0 and 2 stand across the field and cast the shadows */
  const lampTex = tex(256, 128, (x) => {
    x.fillStyle = "#151515"; x.fillRect(0, 0, 256, 128);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const g = x.createRadialGradient(21 + c * 43, 21 + r * 43, 2, 21 + c * 43, 21 + r * 43, 20);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, "#ffe6b0"); g.addColorStop(1, "#2a2a2a");
      x.fillStyle = g; x.fillRect(3 + c * 43, 3 + r * 43, 37, 37);
    }
  });
  const TOWERS = [[-40, -40], [-46, 38], [40, -40], [46, 38]];
  const towers = TOWERS.map(([x, z], i) => {
    const g = new THREE.Group(), TH2 = 26;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, TH2, 10), mat(0x3a3f4a, { roughness: 0.6, metalness: 0.3 }));
    pole.position.y = TH2 / 2; pole.castShadow = true; g.add(pole);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xfff2d6, emissiveMap: lampTex, emissiveIntensity: 0, roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.5), headMat); head.position.y = TH2 + 1.5; head.rotation.x = 0.35; g.add(head);
    g.position.set(x, 0, z); g.lookAt(0, 0, 0); stadium.add(g);
    const lampPos = new THREE.Vector3(x, TH2 + 1.5, z);
    const target = new THREE.Vector3(x * 0.15, 0, z < 0 ? 6 : 12);
    const spot = new THREE.SpotLight(0xfff1d6, 0, 0, 0.55, 0.6, 0);
    spot.position.copy(lampPos); spot.target.position.copy(target);
    spot.castShadow = i === 0 || i === 2;
    if (spot.castShadow) { spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.04; spot.shadow.camera.near = 8; spot.shadow.camera.far = 140; }
    stadium.add(spot, spot.target);
    // only the towers across the field get a visible beam and halo: the camera stands inside the near towers' beams
    const far = z < 0;
    const beam = makeBeam(0.24); aimBeam(beam, lampPos, target); beam.visible = far; stadium.add(beam);
    const halo = glowSprite(0xffeccc, 30, 0); halo.position.copy(lampPos).lerp(new THREE.Vector3(0, TH2, 0), 0.03); halo.visible = far; stadium.add(halo);
    return { headMat, spot, beam, halo, far, level: 0, target: 0 };
  });

  /* two spotlights that sweep the stand during the reveal */
  const sweeps = [-1, 1].map((s) => {
    const sp = new THREE.SpotLight(0xfff0d0, 0, 0, 0.16, 0.5, 0);
    sp.position.set(s * 20, 0.6, 18); stadium.add(sp, sp.target);
    const beam = makeBeam(0.13); stadium.add(beam);
    return { s, sp, beam };
  });

  /* the players, the ref and the ball */
  const TEAM_A = { shirt: 0xffd23f, trim: 0x1b2a49, shorts: 0x1b2a49, socks: 0xffd23f, stripe: 0x1b2a49 };
  const TEAM_B = { shirt: 0x2f6fd6, trim: 0xffffff, shorts: 0xf2f2f2, socks: 0x2f6fd6, stripe: 0xffffff };
  const NUMS = [10, 3, 8, 5, 14, 9, 21, 2, 17, 6];
  const playersG = new THREE.Group(); stadium.add(playersG);
  const squad = [];
  for (let i = 0; i < 10; i++) {
    const A = i % 2 === 0;
    const p = person({ ...(A ? TEAM_A : TEAM_B), number: NUMS[i] });
    Object.assign(p, { team: A ? 0 : 1, home: { x: rand(-13, 13), z: rand(-5, 13) }, amp: { x: rand(2, 6), z: rand(1, 3.5) }, f: rand(0.25, 0.6) });
    playersG.add(p.root); squad.push(p);
  }
  const ref = person({ adult: true, stripes: true, shirt: 0xf2f2f2, trim: 0x111111, shorts: 0x111111, socks: 0x111111, stripe: 0x111111, skin: 0xd8a07a, hair: 0x1a1a1a, style: "short", scale: 1.25 });
  playersG.add(ref.root);
  const ballTex = tex(128, 64, (x) => {
    x.fillStyle = "#f4f4f4"; x.fillRect(0, 0, 128, 64); x.fillStyle = "#1a1a1a";
    for (const [a, b] of [[20, 16], [60, 34], [100, 14], [40, 52], [86, 54], [122, 40], [6, 44]]) { x.beginPath(); for (let k = 0; k < 5; k++) { const ang = k * 1.2566 - 1.57; x.lineTo(a + Math.cos(ang) * 7, b + Math.sin(ang) * 7); } x.closePath(); x.fill(); }
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
  ball.castShadow = true; playersG.add(ball);
  const ballState = { from: 0, to: 2, t0: 0, dur: 0.6, hold: 2 };

  /* other parents along your touchline */
  const parentsG = new THREE.Group(); stadium.add(parentsG);
  const parents = [[-6.5, 29.4], [-9.2, 28.8], [7.2, 29], [10.6, 28.5], [-14, 29.2], [14.5, 29.3]].map(([x, z]) => {
    const k = parentsG.children.length, pose = ["stand", "cross", "phone"][k % 3];
    const p = person({ adult: true, shirt: pick([0x2c3e50, 0x7f8c8d, 0x8e44ad, 0x16a085, 0xc0392b, 0x34495e, 0xd35400, 0x4a6fa5]), trim: 0x222222, pants: pick([0x2d3436, 0x1e272e, 0x3d3d3d, 0x485460, 0x6b5b45]), shoe: pick([0x2d2d2d, 0xf2f2f2, 0x7a4a2a]), sole: 0x333333, scale: rand(1.18, 1.28), style: pick(["short", "ponytail", "curly", "buns"]), cap: Math.random() < 0.35 ? pick([0x1b2a49, 0xffd23f, 0xe9473b]) : 0, phone: pose === "phone" });
    p.pose = pose;
    p.root.position.set(x, 0.02, z); p.root.rotation.y = Math.PI + rand(-0.3, 0.3); parentsG.add(p.root);
    return p;
  });

  /* 2:15 PM, the bench, with your kid on it */
  const benchG = new THREE.Group(); stadium.add(benchG);
  const wood = mat(0x7a5536, { roughness: 0.8 }), steel = mat(0x4a4f58, { roughness: 0.5, metalness: 0.5 });
  { const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.07, 0.38), wood); seat.position.set(0.8, 0.45, 25.2); seat.castShadow = true; benchG.add(seat);
    for (const dx of [-1.55, 1.55]) for (const dz of [-0.14, 0.14]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), steel); l.position.set(0.8 + dx, 0.225, 25.2 + dz); benchG.add(l); } }
  const benchKids = [-0.1, 0.8, 1.7].map((x, k) => {
    const p = person({ ...TEAM_A, number: [4, 7, 11][k], skin: SKIN[(k + 2) % 5], hair: HAIR[k], style: ["spiky", "short", "ponytail"][k] });
    p.root.position.set(x, 0.02, 25.15); p.root.rotation.y = Math.PI; benchG.add(p.root);
    return p;
  });
  const coach = person({ adult: true, shirt: 0x1b2a49, trim: 0xffd23f, pants: 0x2c2f38, skin: 0xd8a07a, cap: 0xffd23f, style: "short", scale: 1.27 });
  coach.root.position.set(-2.3, 0.02, 23.8); coach.root.rotation.y = Math.PI + 0.4; benchG.add(coach.root);
  const markerDraw = (x) => {
    x.clearRect(0, 0, 256, 128); x.fillStyle = "#ffd23f";
    const r = 26; x.beginPath(); x.moveTo(40 + r, 8); x.arcTo(216, 8, 216, 60, r); x.arcTo(216, 60, 40, 60, r); x.arcTo(40, 60, 40, 8, r); x.arcTo(40, 8, 216, 8, r); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(108, 68); x.lineTo(148, 68); x.lineTo(128, 98); x.closePath(); x.fill();
    x.fillStyle = "#151004"; x.font = "800 30px Inter, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("YOUR KID", 128, 35);
  };
  const markerTex = tex(256, 128, markerDraw);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, depthTest: false, transparent: true }));
  marker.scale.set(0.95, 0.475, 1); marker.renderOrder = 20; benchG.add(marker);

  /* 7:42 AM, snack duty */
  const morningG = new THREE.Group(); stadium.add(morningG);
  { const tx = -0.9, tz = 27.3;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.8), mat(0xf2f2ee, { roughness: 0.5 })); top.position.set(tx, 0.76, tz); top.castShadow = true; top.receiveShadow = true; morningG.add(top);
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.32, 0.32]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 6), steel); l.position.set(tx + dx, 0.375, tz + dz); morningG.add(l); }
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.02, 24), mat(0xffffff, { roughness: 0.3 })); plate.position.set(tx - 0.45, 0.795, tz); morningG.add(plate);
    const halfOrange = new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), orange = mat(0xff9417, { roughness: 0.55 });
    for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.06 + (i % 4) * 0.055; const o = new THREE.Mesh(halfOrange, orange); o.position.set(tx - 0.45 + Math.cos(a) * r, 0.805, tz + Math.sin(a) * r); o.rotation.z = rand(-0.4, 0.4); o.castShadow = true; morningG.add(o); }
    const jb = new THREE.BoxGeometry(0.065, 0.11, 0.045);
    [0x35d07f, 0x5aa9ff, 0xff7aa8, 0xffd23f, 0x35d07f, 0x5aa9ff, 0xff7aa8, 0xffd23f].forEach((c, i) => { const b = new THREE.Mesh(jb, mat(c, { roughness: 0.5 })); b.position.set(tx + 0.15 + (i % 4) * 0.12, 0.84, tz - 0.12 + Math.floor(i / 4) * 0.2); b.castShadow = true; morningG.add(b); const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4), mat(0xffffff)); straw.position.set(b.position.x + 0.015, 0.92, b.position.z); straw.rotation.z = 0.25; morningG.add(straw); });
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.34, 18), mat(0x2f6fd6, { roughness: 0.4 })); jug.position.set(tx + 0.75, 0.95, tz + 0.1); jug.castShadow = true; morningG.add(jug);
    const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.38), mat(0x2f6fd6, { roughness: 0.5 })); cooler.position.set(tx + 1.55, 0.19, tz + 0.3); cooler.castShadow = true; morningG.add(cooler);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.4), mat(0xf4f4f4, { roughness: 0.5 })); lid.position.set(tx + 1.55, 0.41, tz + 0.3); morningG.add(lid);
    const coneGeo = new THREE.ConeGeometry(0.13, 0.28, 16), coneM = mat(0xff7a1a, { roughness: 0.6 });
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(coneGeo, coneM); c.position.set(3 + i * 1.6, 0.17, 13); c.castShadow = true; morningG.add(c); }
  }
  const joggers = Array.from({ length: 6 }, (_, k) => { const p = person({ ...TEAM_A, number: [3, 8, 12, 15, 19, 22][k], skin: SKIN[k % 5], hair: HAIR[(k + 1) % 5], style: STYLES[k % 5] }); morningG.add(p.root); return p; });
  const morningCoach = person({ adult: true, shirt: 0x1b2a49, trim: 0xffd23f, pants: 0x2c2f38, skin: 0xa7704d, cap: 0xffd23f, style: "short", scale: 1.27 });
  morningCoach.root.position.set(8.5, 0.02, 12.2); morningCoach.root.rotation.y = -0.6; morningG.add(morningCoach.root);
  const tablePos = new THREE.Vector3(-1.35, 0.95, 27.3);

  /* 8:04 PM, the walk back: an empty field, one light, your kid */
  const quietG = new THREE.Group(); stadium.add(quietG);
  const quietKid = person({ ...TEAM_A, number: 7, skin: 0xf0c39c, hair: 0x3a2516, style: "short", faced: true });
  let quietHead = 0.42;
  addFace(quietKid); setMood(quietKid, "sad");
  quietKid.root.position.set(0.8, 0.02, 26.6); quietKid.root.rotation.y = -0.15; quietG.add(quietKid.root);
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.38, 4, 12), mat(0x24365c, { roughness: 0.7 })); bag.rotation.z = Math.PI / 2; bag.position.set(1.42, 0.14, 26.8); bag.castShadow = true; quietG.add(bag);
  const warm = new THREE.PointLight(0xffb36b, 0, 9, 2); warm.position.set(0.5, 1.7, 28.4); quietG.add(warm);
  const moonFill = new THREE.DirectionalLight(0x9fb4ff, 0.9); moonFill.position.set(22, 30, 64); moonFill.target.position.set(0.8, 1, 26.6); quietG.add(moonFill, moonFill.target);
  const flies = Array.from({ length: 26 }, () => { const s = glowSprite(0xd6ff78, rand(0.14, 0.24), 0); s.userData = { x: rand(-6, 7), y: rand(0.25, 1.8), z: rand(19, 30), p: rand(0, 6.28), sp: rand(0.3, 0.8), b: rand(0.8, 2) }; quietG.add(s); return s; });

  /* sparkles and confetti */
  const sparks = Array.from({ length: 70 }, () => { const s = glowSprite(0xffd890, 0.12, 0); s.visible = false; s.userData = { life: 0 }; stadium.add(s); return s; });
  function spawnSparks(n, at, spread, color) {
    let k = 0;
    for (const s of sparks) {
      if (k >= n) break;
      if (s.userData.life > 0) continue;
      s.visible = true; s.material.color.set(color);
      s.position.set(at.x + rand(-spread, spread), at.y + rand(-0.1, 0.25), at.z + rand(-spread * 0.5, spread * 0.5));
      Object.assign(s.userData, { life: rand(0.9, 1.8), vy: rand(0.2, 0.7), vx: rand(-0.15, 0.15), max: 1.8 });
      k++;
    }
  }
  const CONF = 420;
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF);
  confetti.frustumCulled = false; stadium.add(confetti);
  const confData = Array.from({ length: CONF }, (_, i) => { confetti.setColorAt(i, col.setHex(pick([0xffd23f, 0xffffff, 0x35d07f, 0xff5b4f, 0x5aa9ff]))); m4.makeScale(0, 0, 0); confetti.setMatrixAt(i, m4); return { life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }; });
  const qtmp = new THREE.Quaternion(), vtmp = new THREE.Vector3(), stmp = new THREE.Vector3(1, 1, 1);

  /* ================= the car: the ride home at dusk ================= */
  const car = new THREE.Scene();
  car.fog = new THREE.Fog(0x4a2a4a, 90, 560);
  const carSky = skyDome(); setSky(carSky, "#1a1440", "#b0607a", "#ff9d5c"); car.add(carSky);
  car.add(new THREE.HemisphereLight(0xffb08a, 0x1b1324, 1.15));
  const dusk = new THREE.DirectionalLight(0xffa060, 2.2); dusk.position.set(60, 18, -200); car.add(dusk);
  const carSun = glowSprite(0xffa868, 280, 0.95); carSun.position.set(90, 14, -620); car.add(carSun);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(12, 40), new THREE.MeshBasicMaterial({ color: 0xffe0b0, fog: false })); sunDisc.position.set(90, 14, -630); car.add(sunDisc);
  const land = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat(0x1c1426, { roughness: 1 })); land.rotation.x = -Math.PI / 2; car.add(land);
  const roadTex = tex(256, 512, (x, w, h) => {
    x.fillStyle = "#2a2730"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { x.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.06)"; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    x.fillStyle = "#ece4c6"; x.fillRect(w / 2 - 4, 0, 8, h * 0.42);
    x.fillStyle = "#d8d4c8"; x.fillRect(12, 0, 7, h); x.fillRect(w - 19, 0, 7, h);
  }, { wrapT: THREE.RepeatWrapping });
  const ROAD = 1600;
  roadTex.repeat.set(1, ROAD / 14);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, ROAD), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
  road.rotation.x = -Math.PI / 2; road.position.set(-2.2, 0.02, -ROAD / 2 + 40); car.add(road);
  const hillMat = mat(0x2a1a38, { roughness: 1 });
  for (let i = 0; i < 16; i++) { const r = rand(60, 170), h = rand(18, 60), side = i % 2 ? 1 : -1; const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), hillMat); hill.position.set(side * rand(70, 430), h / 2 - 2, -rand(240, 900)); car.add(hill); }
  const poleMat = mat(0x15121a, { roughness: 0.7 }), lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc27a, emissiveIntensity: 5 });
  const lamps = [];
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? 1 : -1, g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.5, 8), poleMat); pole.position.y = 3.75; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), poleMat); arm.position.set(-side * 0.9, 7.4, 0); g.add(arm);
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.28), lampHeadMat); headM.position.set(-side * 1.7, 7.32, 0); g.add(headM);
    const halo = glowSprite(0xffc27a, 8, 0.7); halo.position.set(-side * 1.7, 7.1, 0); g.add(halo);
    g.position.set(-2.2 + side * 6.4, 0, -Math.floor(i / 2) * 28 - 16); car.add(g); lamps.push(g);
  }
  const passLight = new THREE.PointLight(0xffc27a, 0, 22, 2); car.add(passLight);

  const interior = new THREE.Group(); car.add(interior);
  const plastic = mat(0x16141b, { roughness: 0.85 }), trimM = mat(0x24212a, { roughness: 0.6 });
  { const dash = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.34, 0.8), plastic); dash.position.set(0, 0.86, -0.95); interior.add(dash);
    const dashTop = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.05, 0.62), trimM); dashTop.position.set(0, 1.04, -0.88); dashTop.rotation.x = 0.1; interior.add(dashTop);
    for (const s of [-1, 1]) { const pil = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.14), plastic); pil.position.set(s * 0.84, 1.36, -0.62); pil.rotation.set(-0.5, 0, -s * 0.22); interior.add(pil); }
    const header = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.16), plastic); header.position.set(0, 1.63, -0.42); interior.add(header);
    const roofIn = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 2.3), mat(0x2a2630, { roughness: 0.95 })); roofIn.position.set(0, 1.69, 0.6); interior.add(roofIn);
    for (const s of [-1, 1]) { const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 2.5), plastic); door.position.set(s * 0.98, 0.82, 0.3); interior.add(door); }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 12, 40), mat(0x0e0d12, { roughness: 0.5 })); wheel.position.set(-0.37, 0.97, -0.5); wheel.rotation.x = -0.45; interior.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 18), plastic); hub.rotation.x = Math.PI / 2 - 0.45; hub.position.copy(wheel.position); interior.add(hub);
    for (const s of [-1, 1]) { const hr = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.12), mat(0x1e1a24)); hr.position.set(s * 0.37, 1.3, 0.25); interior.add(hr); }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.62), mat(0x2a2532, { roughness: 0.95 })); seat.position.set(0, 0.44, 1.12); interior.add(seat);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.78, 0.16), mat(0x2a2532, { roughness: 0.95 })); seatBack.position.set(0, 0.86, 1.5); seatBack.rotation.x = -0.12; interior.add(seatBack);
    const rearWin = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.5), new THREE.MeshBasicMaterial({ map: tex(64, 64, (x) => { const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, "#3a2a5c"); g.addColorStop(0.6, "#b56a7a"); g.addColorStop(1, "#ff9d5c"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }), fog: false }));
    rearWin.position.set(0, 1.33, 1.64); rearWin.rotation.y = Math.PI; interior.add(rearWin); }
  const clusterTex = tex(256, 96, (x) => { x.fillStyle = "#03060b"; x.fillRect(0, 0, 256, 96); x.strokeStyle = "#5ad1ff"; x.lineWidth = 4; x.beginPath(); x.arc(56, 54, 34, Math.PI * 0.8, Math.PI * 2.2); x.stroke(); x.fillStyle = "#ffffff"; x.font = "700 30px Inter, sans-serif"; x.textAlign = "center"; x.fillText("38", 56, 64); x.font = "700 16px Inter, sans-serif"; x.fillStyle = "#5ad1ff"; x.fillText("MPH", 150, 40); x.fillText("12 MIN TO HOME", 176, 72); });
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }));
  cluster.position.set(-0.37, 1.0, -0.66); cluster.rotation.x = -0.3; interior.add(cluster);
  const screenCanvas = document.createElement("canvas"); screenCanvas.width = 512; screenCanvas.height = 256;
  const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
  let screenText = "Nothing yet";
  function drawScreen() {
    const x = screenCanvas.getContext("2d");
    x.fillStyle = "#04070d"; x.fillRect(0, 0, 512, 256);
    x.fillStyle = "#5ad1ff"; x.font = "800 28px Inter, sans-serif"; x.textAlign = "left"; x.fillText("NOW PLAYING", 30, 56);
    x.fillStyle = "#ffffff"; x.font = "800 40px Inter, sans-serif"; wrapText(x, screenText, 30, 118, 452, 48);
    x.fillStyle = "rgba(90,209,255,.3)"; x.fillRect(30, 214, 452, 8); x.fillStyle = "#5ad1ff"; x.fillRect(30, 214, 140, 8);
    screenTex.needsUpdate = true;
  }
  drawScreen();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0.14, 1.0, -0.62); screen.rotation.set(-0.35, -0.2, 0); interior.add(screen);
  /* the rear-view mirror is a real second camera pointed at the back seat */
  const mirrorRT = new THREE.WebGLRenderTarget(512, 148, { samples: 2 });
  mirrorRT.texture.wrapS = THREE.RepeatWrapping; mirrorRT.texture.repeat.x = -1; mirrorRT.texture.offset.x = 1;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.095, 0.04), mat(0x101014, { roughness: 0.4 }));
  housing.position.set(-0.02, 1.4, -0.55); housing.rotation.y = 0.12; housing.rotation.x = 0.08; interior.add(housing);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.266, 0.076), new THREE.MeshBasicMaterial({ map: mirrorRT.texture }));
  glass.position.z = 0.021; housing.add(glass);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), mat(0x101014)); stem.position.set(-0.02, 1.54, -0.55); interior.add(stem);
  const carKid = person({ ...TEAM_A, number: 7, skin: 0xf0c39c, hair: 0x3a2516, style: "short", faced: true, shadow: false });
  addFace(carKid); addHeadphones(carKid);
  carKid.root.position.set(0.0, 0.1, 1.1); carKid.root.rotation.y = Math.PI; interior.add(carKid.root);
  poseSit(carKid, 0);
  const mirrorCam = new THREE.PerspectiveCamera(30, 0.266 / 0.076, 0.05, 40);
  car.updateMatrixWorld(true);
  const glassPos = glass.getWorldPosition(new THREE.Vector3());
  const kidHead = carKid.neck.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0));
  mirrorCam.position.copy(glassPos); mirrorCam.lookAt(kidHead);

  /* ================= state, camera shots and scenes ================= */
  const S = {
    scene: "stadium", sceneAt: 0, t: 0, dolly: 3.6, dollyTo: 3.6, panel: 0, tilt: 0, mirror: 0, mirrorTo: 0,
    px: 0, py: 0, tx: 0, ty: 0, user: -9, shake: 0, jump: 0, spots: 0, spotsNow: 0, glow: 0, flash: 0, tint: 0,
    kid: "neutral", kidAt: 0, phonesAt: -9, fovBase: 60,
  };
  const SHOTS = {
    stadium: { cam: [0, 4.4, 30], look: [0, 6.2, -20] },
    night:   { cam: [0, 1.75, 30.5], look: [0, 0.6, 4] },
    bench:   { cam: [0.3, 1.75, 31.2], look: [0.5, 0.5, 10] },
    morning: { cam: [0, 1.75, 32.4], look: [-0.3, 0.5, 12] },
    quiet:   { cam: [0.2, 1.6, 30.6], look: [0.8, 0.95, 24] },
    car:     { cam: [-0.12, 1.2, 0.05], look: [-0.06, 1.08, -10] },
  };
  const LIGHTS = { stadium: [1, 1, 1, 1], night: [1, 1, 1, 1], quiet: [0, 0, 0.8, 0] };
  const SKIES = {
    stadium: ["#02040c", "#0a1634", "#1a2c55"], night: ["#02040c", "#0b1838", "#1c305a"], quiet: ["#010208", "#060d24", "#0f1c3c"],
    morning: ["#3d8be0", "#a4d0f2", "#f7e7c9"], bench: ["#4f7fbf", "#a9c6e2", "#e8eef3"],
  };
  const camPos = new THREE.Vector3(), lookAt = new THREE.Vector3(), lookTmp = new THREE.Vector3();

  function apply(name) {
    const day = name === "morning" || name === "bench";
    if (name === "car") {
      renderPass.scene = car; renderer.toneMappingExposure = 1.0; bloom.strength = 0.9;
      setMood(carKid, "sad"); carKid.neck.rotation.set(0.05, 0.55, 0); carKid.phones.visible = false; S.phonesAt = -9;
      screenText = "Nothing yet"; drawScreen();
      return;
    }
    renderPass.scene = stadium;
    setSky(sky, ...SKIES[name]);
    stars.material.opacity = day ? 0 : name === "quiet" ? 1 : 0.75;
    moon.visible = name === "quiet";
    stadium.fog.color.set(day ? "#cfdfec" : "#05070d"); stadium.fog.density = day ? 0.0032 : 0.0065;
    sun.visible = day; sunGlow.visible = day;
    if (name === "morning") { sun.position.set(-62, 30, 48); sun.color.set("#ffe2b8"); sun.intensity = 3.4; }
    else { sun.position.set(-38, 58, 34); sun.color.set("#fff4e6"); sun.intensity = 3.2; }
    sunGlow.position.copy(sun.position).normalize().multiplyScalar(800);
    hemi.color.set(day ? "#bcd6ff" : "#8899bb"); hemi.groundColor.set(day ? "#3d5c34" : "#1a241a"); hemi.intensity = day ? 1.35 : 0.12;
    const crowdOn = name === "night" || name === "bench" || name === "stadium";
    bodies.visible = crowdOn; heads.visible = crowdOn;
    playersG.visible = name === "night" || name === "bench";
    parentsG.visible = name === "night" || name === "bench" || name === "stadium";
    benchG.visible = name === "bench"; morningG.visible = name === "morning"; quietG.visible = name === "quiet";
    adMat.emissiveIntensity = day ? 0.35 : 1.0;
    renderer.toneMappingExposure = day ? 0.95 : 1.0; bloom.strength = day ? 0.3 : 0.7; bloom.threshold = day ? 0.92 : 0.88;
    if (name === "quiet") { setMood(quietKid, "sad"); quietKid.neck.rotation.set(0.42, 0, 0); warm.intensity = 0; }
  }

  function updateCrowd(t) {
    const amp = 0.035 + S.jump * 0.3;
    for (let i = 0; i < crowd.length; i++) {
      const d = crowd[i];
      if (d.empty) continue;
      const b = Math.abs(Math.sin(t * d.f + d.ph)) * amp;
      m4.makeTranslation(d.x, d.y + 0.36 + b, d.z); bodies.setMatrixAt(i, m4);
      m4.makeTranslation(d.x, d.y + 0.79 + b, d.z); heads.setMatrixAt(i, m4);
    }
    bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  }
  function updatePlayers(t, dt) {
    const cheer = S.jump > 0.3;
    for (const p of squad) {
      const x = p.home.x + Math.sin(t * p.f + p.phase) * p.amp.x, z = p.home.z + Math.cos(t * p.f * 0.7 + p.phase) * p.amp.z;
      const vx = Math.cos(t * p.f + p.phase) * p.amp.x * p.f, vz = -Math.sin(t * p.f * 0.7 + p.phase) * p.amp.z * p.f * 0.7;
      p.root.position.set(x, 0.02, z);
      if (cheer && p.team === 0) { p.root.rotation.y = 0; poseCheer(p, t); }
      else { p.root.rotation.y = Math.atan2(vx, vz); poseRun(p, t, clamp(Math.hypot(vx, vz) / 3, 0.45, 1.3)); }
    }
    const rx = Math.sin(t * 0.35) * 6, rz = 2 + Math.cos(t * 0.25) * 3;
    ref.root.position.set(rx, 0.02, rz);
    if (S.scene === "night" && t - S.sceneAt < 3.6) { ref.root.rotation.y = 0; poseSignal(ref, t); }
    else { ref.root.rotation.y = Math.atan2(Math.cos(t * 0.35) * 2.1, -Math.sin(t * 0.25) * 0.75); poseRun(ref, t, 0.6, 0.05); }
    const B = ballState, a = squad[B.from], b = squad[B.to], k = clamp((t - B.t0) / B.dur, 0, 1);
    ball.position.set(lerp(a.root.position.x, b.root.position.x, k) + 0.22, 0.14 + Math.sin(k * Math.PI) * 0.9, lerp(a.root.position.z, b.root.position.z, k) + 0.2);
    ball.rotation.x += dt * 9;
    if (t - B.t0 > B.hold) { let n = Math.floor(Math.random() * squad.length); if (n === B.to) n = (n + 1) % squad.length; Object.assign(B, { from: B.to, to: n, t0: t, dur: 0.6, hold: rand(1.4, 2.6) }); }
  }
  function updateConfetti(dt) {
    let any = false;
    for (let i = 0; i < CONF; i++) {
      const c = confData[i];
      if (c.life <= 0) continue;
      any = true; c.life -= dt;
      c.v.y = Math.max(c.v.y - 2.6 * dt, -1.6); c.v.x += Math.sin(S.t * 3 + i) * 0.9 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
      qtmp.setFromEuler(c.r);
      const s = c.life > 0 ? Math.min(1, c.life) : 0;
      m4.compose(c.p, qtmp, stmp.set(s, s, s)); confetti.setMatrixAt(i, m4);
      if (c.life <= 0) { m4.makeScale(0, 0, 0); confetti.setMatrixAt(i, m4); }
    }
    if (any) confetti.instanceMatrix.needsUpdate = true;
  }

  const clock = { last: performance.now() };
  let running = true, rt = 0, perfSum = 0, perfN = 0, quality = 2;
  function update(dt) {
    const t = S.t, name = S.scene;
    for (const tw of towers) {
      tw.level = ease(tw.level, tw.target, 11, dt);
      const L = tw.level;
      tw.spot.intensity = L * (tw.far ? 2.6 : 1.6); tw.spot.visible = L > 0.01 && name !== "car";
      tw.headMat.emissiveIntensity = L * 3.4; tw.halo.material.opacity = L * 0.85; tw.beam.material.uniforms.uOpacity.value = L * 0.06;
    }
    const avg = (towers[0].level + towers[1].level + towers[2].level + towers[3].level) / 4;
    if (name !== "morning" && name !== "bench" && name !== "car") { hemi.intensity = 0.05 + avg * 0.28; roofLights.material.emissiveIntensity = avg * 2.2; }
    else roofLights.material.emissiveIntensity = 0;
    S.spotsNow = ease(S.spotsNow, S.spots, 4, dt);
    for (const sw of sweeps) {
      const on = S.spotsNow > 0.01 && name === "stadium";
      sw.sp.visible = on; sw.beam.visible = on;
      if (!on) continue;
      sw.sp.target.position.set(sw.s * -6 + Math.sin(t * 1.25 + sw.s) * 15, 9 + Math.sin(t * 0.9 + sw.s) * 4, -36);
      sw.sp.intensity = S.spotsNow * 45;
      aimBeam(sw.beam, sw.sp.position, sw.sp.target.position);
      sw.beam.material.uniforms.uOpacity.value = S.spotsNow * 0.45;
    }
    S.jump *= Math.pow(0.35, dt); S.shake *= Math.pow(0.02, dt); S.glow *= Math.pow(0.55, dt);
    S.flash *= Math.pow(0.03, dt); S.tint *= Math.pow(0.3, dt);
    fx.uniforms.uFlash.value = reduced ? 0 : S.flash; fx.uniforms.uTint.value = S.tint; fx.uniforms.uTime.value = t;

    if (name === "car") updateCar(t, dt);
    else {
      if (bodies.visible) updateCrowd(t);
      if (playersG.visible) updatePlayers(t, dt);
      if (parentsG.visible) for (const p of parents) { if (S.jump > 0.3) poseCheer(p, t); else if (p.pose === "cross") poseCross(p, t); else if (p.pose === "phone") posePhone(p, t); else poseStand(p, t); }
      if (benchG.visible) { benchKids.forEach((p) => poseSit(p, t)); poseCross(coach, t); marker.position.set(0.8, 1.5 + Math.sin(t * 4) * 0.04, 25.15); }
      if (morningG.visible) {
        joggers.forEach((p, k) => { const x = -14 + ((t * 2.6 + k * 2.3) % 28); p.root.position.set(x, 0.02, 9 + (k % 2) * 0.7); p.root.rotation.y = Math.PI / 2; poseRun(p, t, 0.75); });
        poseStand(morningCoach, t);
      }
      if (quietG.visible) {
        poseStand(quietKid, t, 0.5); blink(quietKid, t);
        quietHead = ease(quietHead, S.kid === "up" ? -0.12 : 0.42, 4, dt);
        quietKid.neck.rotation.x = quietHead;
        warm.intensity = S.glow * 7;
        flies.forEach((f) => { const u = f.userData; f.position.set(u.x + Math.sin(t * u.sp + u.p) * 0.6, u.y + Math.cos(t * u.sp * 1.3 + u.p) * 0.25, u.z + Math.sin(t * u.sp * 0.7 + u.p) * 0.4); f.material.opacity = Math.max(0, Math.sin(t * u.b + u.p)) * (0.85 + S.glow * 0.5); });
      }
      for (const s of sparks) {
        const u = s.userData; if (u.life <= 0) { s.visible = false; continue; }
        u.life -= dt; s.position.y += u.vy * dt; s.position.x += u.vx * dt;
        s.material.opacity = clamp(u.life / 0.6, 0, 1);
      }
      updateConfetti(dt);
    }

    /* camera: dolly-in, parallax, a little handheld sway, the tilt that keeps the action above the answer panel */
    if (t - S.user > 3) { S.tx = Math.sin(t * 0.23) * 0.35; S.ty = Math.cos(t * 0.17) * 0.2; }
    S.px = ease(S.px, S.tx, 2.5, dt); S.py = ease(S.py, S.ty, 2.5, dt);
    S.dolly = ease(S.dolly, S.dollyTo, 1.6, dt);
    S.mirror = ease(S.mirror, S.mirrorTo, 3.2, dt);
    const shot = SHOTS[name];
    const fovTarget = name === "car" ? lerp(S.fovBase + 8, 24, S.mirror) : S.fovBase;
    if (Math.abs(camera.fov - fovTarget) > 0.01) { camera.fov = ease(camera.fov, fovTarget, 3.2, dt); camera.updateProjectionMatrix(); }
    const sway = reduced ? 0 : 1;
    if (name === "car") {
      camPos.set(shot.cam[0] + S.px * 0.02, shot.cam[1] + Math.sin(t * 13) * 0.0025 + Math.sin(t * 2.3) * 0.004, shot.cam[2]);
      lookAt.set(...shot.look).lerp(lookTmp.copy(glassPos), S.mirror);
    } else {
      camPos.set(shot.cam[0] + S.px * 0.35 + Math.sin(t * 0.7) * 0.03 * sway, shot.cam[1] + S.dolly * 0.14 + S.py * 0.1 + Math.sin(t * 0.9) * 0.02 * sway, shot.cam[2] + S.dolly);
      lookAt.set(shot.look[0] + S.px * 0.8, shot.look[1], shot.look[2]);
    }
    camera.position.copy(camPos); camera.lookAt(lookAt);
    const factor = name === "car" ? lerp(0.38, 1, S.mirror) : 0.92;
    S.tilt = ease(S.tilt, Math.atan(S.panel * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * factor, 3, dt);
    camera.rotateX(-S.tilt);
    if (S.shake > 0.05 && !reduced) { camera.rotateZ((Math.random() - 0.5) * S.shake * 0.004); camera.rotateX((Math.random() - 0.5) * S.shake * 0.003); }
  }
  function updateCar(t, dt) {
    const speed = 21;
    roadTex.offset.y += (speed * dt) / 14;
    let nearest = null, best = 1e9;
    for (const l of lamps) {
      l.position.z += speed * dt;
      if (l.position.z > 14) l.position.z -= 14 * 28;
      const d = Math.abs(l.position.z + 6);
      if (d < best) { best = d; nearest = l; }
    }
    if (nearest) { passLight.position.set(nearest.position.x * 0.55, 6.5, nearest.position.z); passLight.intensity = 90 * Math.max(0, 1 - best / 22); }
    blink(carKid, t);
    const ph = carKid.phones;
    if (ph.visible) { const k = clamp((t - S.phonesAt) / 0.4, 0, 1); ph.position.y = 0.15 + (1 - k * k) * 0.42; }
    poseSit(carKid, t);
    const target = S.kid === "smile" ? 0 : S.kid === "headphones" ? 0.32 : 0.55;
    carKid.neck.rotation.y = ease(carKid.neck.rotation.y, target, 3, dt);
  }
  function renderMirror() {
    glass.visible = false;
    renderer.setRenderTarget(mirrorRT); renderer.render(car, mirrorCam); renderer.setRenderTarget(null);
    glass.visible = true;
  }
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - clock.last) / 1000)); clock.last = now; S.t += dt;
    update(dt);
    if (S.scene === "car") renderMirror();
    composer.render(dt);
    perfSum += dt; perfN++;
    if (perfSum > 2.5) {
      const avg = perfSum / perfN; perfSum = 0; perfN = 0;
      if (avg > 0.038 && quality > 0) {
        quality--;
        if (quality === 1) { renderer.setPixelRatio(1); composer.setPixelRatio(1); }
        else { bloom.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; }
      }
    }
    requestAnimationFrame(frame);
  }
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H); composer.setSize(W, H);
    camera.aspect = W / H; S.fovBase = W < H ? 72 : 50; camera.fov = S.fovBase; camera.updateProjectionMatrix();
  }
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; S.tx = (e.clientX / W - 0.5) * 2; S.ty = (e.clientY / H - 0.5) * 2; S.user = S.t; });
  addEventListener("deviceorientation", (e) => { if (e.gamma == null) return; S.tx = clamp(e.gamma / 25, -1, 1); S.ty = clamp((e.beta - 45) / 30, -1, 1); S.user = S.t; });
  resize();
  apply("stadium");
  if (document.fonts) document.fonts.load(`400 64px "Bebas Neue"`).then(() => document.fonts.load("800 30px Inter")).then(() => { adTex.redraw(); markerTex.redraw(); drawBoard(); drawScreen(); clusterTex.redraw(); numTexs.forEach((t) => t.redraw()); }).catch(() => {});
  requestAnimationFrame(frame);

  const toColor = (c) => { const [r, g, b] = String(c).split(",").map(Number); return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace); };
  return {
    show() { canvas.style.opacity = "1"; const w2 = document.getElementById("world"); setTimeout(() => { w2.style.display = "none"; }, 900); },
    dispose() { running = false; canvas.remove(); renderer.dispose(); },
    pause() {},
    scene(name, o = {}) {
      S.scene = name; S.sceneAt = S.t;
      const l = o.lights || LIGHTS[name] || [0, 0, 0, 0];
      towers.forEach((tw, i) => { tw.target = l[i]; tw.level = l[i]; });
      S.dolly = ((o.zoom || 1.07) - 1) * 45; S.dollyTo = o.hold ? S.dolly : 0;
      S.panel = 0; S.tilt = 0; S.mirror = 0; S.mirrorTo = 0; S.glow = 0; S.spots = 0; S.spotsNow = 0; S.tint = 0; S.kid = name === "car" ? "sad" : "neutral";
      apply(name);
    },
    light(i, v) { if (towers[i]) towers[i].target = v; },
    zoomTo(z) { S.dollyTo = (z - 1) * 45; },
    shake(v) { S.shake = Math.max(S.shake, v); },
    flash(c, a) { if (reduced) return; fx.uniforms.uFlashC.value.copy(toColor(c)); S.flash = a; },
    tint(c, a) { fx.uniforms.uTintC.value.copy(toColor(c)); S.tint = a * 1.4; },
    jump(v) { S.jump = Math.max(S.jump, v); },
    spots(v) { S.spots = v; },
    kid(mode) {
      S.kid = mode; S.kidAt = S.t;
      if (S.scene === "car") {
        if (mode === "headphones") { carKid.phones.visible = true; S.phonesAt = S.t; setMood(carKid, "sad"); }
        if (mode === "smile") { carKid.phones.visible = false; setMood(carKid, "smile"); }
      } else if (S.scene === "quiet") setMood(quietKid, mode === "up" ? "smile" : "sad");
    },
    focusMirror() { S.mirrorTo = 1; },
    flicker() { const tw = towers[2]; tw.target = 0; setTimeout(() => { if (S.scene === "quiet") tw.target = 0.38; }, 520); },
    glowUp() { S.glow = 1; spawnSparks(26, new THREE.Vector3(0.8, 1.3, 26.8), 0.6, 0xffd08a); },
    sparkle(n) { spawnSparks(Math.min(n, 40), tablePos, 0.7, 0xffd890); },
    confetti(n) {
      const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      camera.getWorldDirection(fwd); right.crossVectors(fwd, up).normalize();
      let k = 0;
      for (const c of confData) {
        if (k >= Math.min(n * 2.2, CONF)) break;
        if (c.life > 0) continue;
        c.life = rand(2.6, 4.2);
        c.p.copy(camera.position).addScaledVector(fwd, rand(3, 14)).addScaledVector(right, rand(-6, 6)).addScaledVector(up, rand(2.5, 7));
        c.v.set(rand(-0.6, 0.6), rand(-0.4, 0.8), rand(-0.6, 0.6)); c.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); c.w.set(rand(-7, 7), rand(-7, 7), rand(-7, 7));
        k++;
      }
    },
    stage(top) { S.panel = clamp(1 - top / H, 0, 0.8); },
    board(a, b, c) { boardLines = [String(a || ""), String(b || ""), String(c || "")]; drawBoard(); },
    screen(text) { screenText = text; drawScreen(); },
  };
}
