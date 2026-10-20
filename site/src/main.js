import { CAPTURE, clock } from './capture.js'; // first: patches clocks in capture mode
import './styles/main.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createDevice } from './three/device.js';
import { createScreen, SCRIPT } from './screen.js';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = !CAPTURE && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth <= 860;

/* ------------------------------------------------------------------ smooth scroll */
let lenis = null;
if (!reduceMotion && !CAPTURE) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
document.querySelectorAll('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const el = document.querySelector(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(el, { duration: 1.6 }) : el.scrollIntoView();
  })
);

/* ------------------------------------------------------------------ three */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

const hemi = new THREE.HemisphereLight(0xffffff, 0xe8e6e0, 0.7);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 8;
key.shadow.bias = -0.0004;
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
const rim = new THREE.DirectionalLight(0xdff3ff, 1.1);
rim.position.set(4, 3, -4);
scene.add(hemi, key, rim);

// floor: shadow catcher + a soft teal pool of light under the device
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.13 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const pool = new THREE.Mesh(
  new THREE.PlaneGeometry(4.2, 4.2),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(120,214,196,0.55)'], [0.35, 'rgba(150,220,205,0.18)'], [1, 'rgba(150,220,205,0)']]),
    transparent: true, depthWrite: false,
  })
);
pool.rotation.x = -Math.PI / 2;
pool.position.y = 0.002;
scene.add(pool);

// radar rings on the floor
const rings = [];
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1, 160),
    new THREE.MeshBasicMaterial({ color: 0x1f9e8c, transparent: true, opacity: 0, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  rings.push(m);
  scene.add(m);
}

// device + screen
const screen = createScreen();
const device = createDevice({ screenTexture: screen.texture });
const rig = new THREE.Group(); // positions/rotates the device; device.group spins inside
rig.add(device.group);
scene.add(rig);

let videoTex = null;
const media = import.meta.env.BASE_URL + 'media/';
const video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, autoplay: !CAPTURE, crossOrigin: 'anonymous', preload: 'auto' });
if (!CAPTURE) video.innerHTML = `<source src="${media}screen-idle.webm" type="video/webm"><source src="${media}screen-idle.mp4" type="video/mp4">`;
const videoReady = new Promise((resolve) => video.addEventListener('canplay', () => {
  if (videoTex) return;
  videoTex = new THREE.VideoTexture(video); // capture mode seeks it and flags each update itself
  videoTex.colorSpace = THREE.SRGBColorSpace;
  if (CAPTURE) videoTex.needsUpdate = true;
  else video.play().catch(() => {});
  resolve();
}, { once: true }));
// capture mode loads the clip as a blob so it is seekable whatever serves the page
if (CAPTURE) fetch(`${media}screen-idle.webm`).then((r) => r.blob()).then((b) => { video.src = URL.createObjectURL(b); video.load(); });
else video.load();

/* ------------------------------------------------------------------ state */
// Everything the scroll story animates lives here; the render loop reads it.
const HERO = () => ({
  x: 0, rotY: -0.42, spin: 1, dist: isMobile() ? 1.19 : 1, camY: 1.05, lookY: isMobile() ? 1.4 : 0.88,
  explode: 0, night: 0, radar: 0, chat: 0, circle: 0, hot: 1, tags: 0,
  hairline: 1, teal: 0,
});
const S = { ...HERO(), intro: 0 };

const vh = () => innerHeight;
const baseDist = () => (isMobile() ? 8.4 : 6.3);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ DOM helpers */
const root = document.documentElement;
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(mix(v, hex(b)[i], t))).join(',')})`;

const v3 = new THREE.Vector3();
const box = new THREE.Box3();
function toScreen(vec) {
  v3.copy(vec).project(camera);
  return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight };
}
function partCenter(name) {
  const p = device.parts[name];
  if (!p) return null;
  box.setFromObject(p);
  if (box.isEmpty()) return null;
  return box.getCenter(new THREE.Vector3());
}
function localPoint(x, y, z) {
  return device.group.localToWorld(new THREE.Vector3(x, y, z));
}

// 3D-anchored labels
const anchors = document.getElementById('anchors');
function tag({ title, sub, side = 'right', no }) {
  const el = document.createElement('div');
  el.className = `tag ${side}`;
  el.innerHTML = `<i class="dot">+</i><i class="ln"></i><div>${no ? `<b class="no">${no}</b>` : ''}<strong>${title}</strong><span>${sub}</span></div>`;
  anchors.appendChild(el);
  return el;
}
const hotTags = [
  { el: tag({ title: 'Light bar', sub: 'Teal means all is well.' }), at: () => localPoint(0.5, 1.62, 0.25), key: 'hot' },
  { el: tag({ title: 'Contactless radar', sub: 'Reads breathing through the air.', side: 'left' }), at: () => localPoint(-0.56, 0.5, 0.25), key: 'hot' },
];
const openTags = [
  { part: 'lightBar', el: tag({ no: '01', title: 'Light bar', sub: 'Glows teal when all is well.' }) },
  { part: 'radar', el: tag({ no: '02', title: 'Contactless radar', sub: 'Breathing, sleep and falls, from across the room.' }) },
  { part: 'mic', el: tag({ no: '03', title: 'Microphones', sub: 'Made for conversation, not menus.' }) },
  { part: 'speaker', el: tag({ no: '04', title: 'Speaker', sub: 'A warm voice, clear from the bed.' }) },
  { part: 'hub', el: tag({ no: '05', title: 'Device hub', sub: '75+ medical devices over Bluetooth and Wi-Fi.' }) },
].map((t) => ({ ...t, key: 'tags' }));

function placeTag(t, pos, k, edge = 0, y) {
  const el = t.el;
  if (k <= 0.001 || !pos) { el.style.opacity = 0; return; }
  const p = toScreen(pos);
  const w = (t.w ||= el.offsetWidth);
  const left = el.classList.contains('left');
  const x = left ? p.x - w - edge : p.x + edge;
  el.style.opacity = k;
  el.style.transform = `translate3d(${x}px, ${(y ?? p.y) - el.offsetHeight / 2}px, 0)`;
}
// exploded labels: keep them in order down the stack with a minimum gap
function placeOpenTags(k) {
  const gap = isMobile() ? 34 : 70;
  const list = openTags.map((o) => ({ o, pos: k > 0 ? partCenter(o.part) : null }));
  let prev = -Infinity;
  list.forEach((l) => {
    if (!l.pos) return;
    l.y = Math.max(toScreen(l.pos).y, prev + gap);
    prev = l.y;
  });
  list.forEach((l) => placeTag(l.o, l.pos, k, isMobile() ? 20 : 120, l.y));
}
addEventListener('resize', () => [...hotTags, ...openTags].forEach((t) => (t.w = 0)));

// hairline follows the light bar's height on screen
const hairline = document.getElementById('hairline');

// talk captions
const talkLine = document.getElementById('talkLine');
const talkTele = document.getElementById('talkTele');
const talkRail = document.getElementById('talkRail');
SCRIPT.forEach(() => talkRail.insertAdjacentHTML('beforeend', '<li><i></i></li>'));
const railBars = [...talkRail.querySelectorAll('i')];
let talkIdx = -1;
function setTalk(p) {
  const i = Math.min(SCRIPT.length - 1, Math.floor(p));
  railBars.forEach((b, j) => (b.style.transform = `scaleX(${gsap.utils.clamp(0, 1, p - j)})`));
  if (i === talkIdx) return;
  talkIdx = i;
  const m = SCRIPT[i];
  talkLine.innerHTML = `<em>${m.who} · ${m.t} a.m.</em>${m.text}`;
  const [head, ...rest] = m.tele.split('  ');
  talkTele.innerHTML = `<b>${head}</b><br/>${rest.join(' ')}`;
  gsap.fromTo([talkLine, talkTele], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' });
}
setTalk(0);

// radar traces
const breathPath = document.getElementById('breathPath');
const sleepSvg = document.getElementById('sleepSvg');
(() => {
  // a believable night: 23:41 → 06:45, restless around 02:58
  const segs = [[0, 6, 'light'], [6, 26, ''], [26, 34, 'light'], [34, 48, ''], [48, 52, 'wake'], [52, 58, 'light'], [58, 78, ''], [78, 92, 'light'], [92, 100, 'wake']];
  sleepSvg.innerHTML = segs.map(([a, b, c]) => {
    const h = c === 'wake' ? 70 : c === 'light' ? 46 : 26;
    return `<rect class="${c}" x="${a * 4}" y="${80 - h}" width="${(b - a) * 4 - 2}" height="${h}" rx="1"/>`;
  }).join('');
})();
function drawBreath(t) {
  let d = '';
  for (let x = 0; x <= 400; x += 4) {
    const y = 40 - Math.sin((x / 400) * Math.PI * 2 * 3 - t * ((Math.PI * 2 * 15) / 60) * 3) * 26 * (0.85 + 0.15 * Math.sin(x * 0.05));
    d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1);
  }
  breathPath.setAttribute('d', d);
}

// care-circle threads
const threads = document.getElementById('threads');
const people = [...document.querySelectorAll('.person')];
threads.innerHTML = people.map((p) => `<path class="${p.dataset.node === 'private' ? 'off' : 'on'}"/>`).join('') + people.map(() => '<circle r="3.5"/>').join('');
const threadPaths = [...threads.querySelectorAll('path')];
const threadDots = [...threads.querySelectorAll('circle')];
function drawThreads(k, t) {
  if (k <= 0.001) { threads.style.opacity = 0; people.forEach((p) => (p.style.opacity = 0)); return; }
  threads.style.opacity = 1;
  const c = toScreen(localPoint(0, 1.0, 0.45));
  people.forEach((p, i) => {
    const r = p.getBoundingClientRect();
    const right = p.classList.contains('p-doc') || p.classList.contains('p-nurse');
    const tx = right ? r.right - 4 : r.left + 4;
    const ty = r.top + 4;
    const mx = (c.x + tx) / 2;
    const path = threadPaths[i];
    path.setAttribute('d', `M${c.x} ${c.y} C${mx} ${c.y} ${mx} ${ty} ${tx} ${ty}`);
    const len = (path._len = path.getTotalLength());
    const ki = gsap.utils.clamp(0, 1, k * 1.6 - i * 0.18);
    const isOff = path.classList.contains('off');
    if (!isOff) { path.style.strokeDasharray = len; path.style.strokeDashoffset = len * (1 - ki); }
    else path.style.opacity = ki;
    p.style.opacity = gsap.utils.clamp(0, 1, ki * 2 - 1);
    const dot = threadDots[i];
    if (isOff || ki < 1) { dot.style.opacity = 0; return; }
    const pt = path.getPointAtLength(((t * 0.35 + i * 0.23) % 1) * len);
    dot.style.opacity = 1;
    dot.setAttribute('cx', pt.x);
    dot.setAttribute('cy', pt.y);
  });
}

// count-ups
document.querySelectorAll('[data-count]').forEach((el) => {
  const o = { v: 0 };
  ScrollTrigger.create({
    trigger: el, start: 'top 85%', once: true,
    onEnter: () => gsap.to(o, { v: +el.dataset.count, duration: 1.8, ease: 'power3.out', onUpdate: () => (el.textContent = Math.round(o.v)) }),
  });
});

/* ------------------------------------------------------------------ scroll story */
const story = document.getElementById('story');
const scenes = [...story.querySelectorAll('.scene')];
const heroL = document.querySelector('.hw-l');
const heroR = document.querySelector('.hw-r');
let master = null;

function layoutScenes() {
  scenes.forEach((s) => (s.style.height = `${parseFloat(s.dataset.len) * 100}vh`));
}

function buildStory() {
  master?.scrollTrigger?.kill();
  master?.kill();
  layoutScenes();
  Object.assign(S, HERO()); // timeline start values are recorded from the hero pose

  const H = vh();
  const mob = isMobile();
  const m = (desk, phone) => (mob ? phone : desk);
  const top = (i) => scenes[i].offsetTop; // px, == scrollY where scene i pins
  const len = (i) => scenes[i].offsetHeight;
  const side = isMobile() ? 0 : 0.42; // device x when copy sits on the left
  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
  const into = (i, vars, d = H) => tl.to(S, { ...vars, duration: d }, top(i) - H);

  // 01 → hero words part as you leave; hotspots go
  tl.to(S, { hot: 0, spin: 0.3, duration: H * 0.35, ease: 'none' }, 0);
  tl.fromTo(heroL, { xPercent: 0, opacity: 1 }, { xPercent: -40, opacity: 0, duration: len(0), ease: 'power1.in' }, 0);
  tl.fromTo(heroR, { xPercent: 0, opacity: 1 }, { xPercent: 40, opacity: 0, duration: len(0), ease: 'power1.in' }, 0);
  tl.to(S, { hairline: 0, duration: H * 0.6, ease: 'none' }, len(0) - H * 0.6);

  // 02 night
  into(1, { night: 1, x: side, rotY: -0.7, spin: 0, dist: m(1.02, 1.7), camY: 1.15, lookY: m(0.88, 2.5) });

  // 03 turn + conversation
  into(2, { night: 0, rotY: Math.PI * 2, dist: m(0.8, 1.22), lookY: m(0.92, 0.75), camY: 1.0, x: m(0.4, 0) }, H * 1.1);
  tl.to(S, { chat: SCRIPT.length - 0.01, duration: len(2) - H * 0.9, ease: 'none' }, top(2) - H * 0.1);

  // 04 open it up
  tl.to(S, { chat: 0, duration: H * 0.05, ease: 'none' }, top(3) - H * 0.35);
  into(3, { x: m(0.14, -0.4), rotY: Math.PI * 2 - 0.5, dist: m(1.45, 1.75), lookY: m(1.25, 1.55), camY: 1.6 });
  tl.to(S, { explode: 1, duration: H * 0.9, ease: 'power3.inOut' }, top(3) - H * 0.3);
  tl.to(S, { tags: 1, duration: H * 0.25, ease: 'none' }, top(3) + H * 0.35);
  tl.to(S, { tags: 0, duration: H * 0.2, ease: 'none' }, top(4) - H * 0.75);

  // 05 radar: reassemble, rise above the floor
  into(4, { explode: 0, x: 0, rotY: Math.PI * 2 - 0.25, dist: m(1.55, 1.6), camY: 4.2, lookY: m(0.5, 1.6), radar: 1 });

  // 06 care circle
  into(5, { radar: 0, camY: 1.4, lookY: 0.85, dist: m(1.5, 2.4), rotY: Math.PI * 2 });
  tl.to(S, { circle: 1, duration: H * 1.2, ease: 'power1.inOut' }, top(5) - H * 0.2);

  // 07 rest: back on the floor, light turns teal
  into(6, { circle: 0, dist: m(1.25, 1.43), camY: 1.1, lookY: m(0.9, 0.48), rotY: Math.PI * 2 - 0.42, x: 0, teal: 1, hairline: 1, spin: 0.3 });
  tl.to({}, { duration: 1 }, story.offsetHeight + document.getElementById('pilot').offsetHeight - H); // pad to max scroll

  master = tl;

  // active nav link
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) ScrollTrigger.create({ trigger: target, start: 'top 50%', end: 'bottom 50%', toggleClass: { targets: a, className: 'on' } });
  });
  ScrollTrigger.create({ animation: tl, start: 0, end: 'max', scrub: reduceMotion || CAPTURE ? true : 0.8 });

  // section copy reveals
  scenes.forEach((s, i) => {
    const items = s.querySelectorAll('.copy > *, .night-log li, .talk-layers, .traces figure, .outcomes > div');
    if (!items.length || i === 0) return;
    gsap.set(items, { opacity: 0, y: 40 });
    gsap.timeline({ scrollTrigger: { trigger: s, start: 'top 45%', end: 'top -5%', scrub: true } })
      .to(items, { opacity: 1, y: 0, stagger: 0.08, ease: 'power2.out' });
    gsap.timeline({ scrollTrigger: { trigger: s, start: 'bottom 110%', end: 'bottom 60%', scrub: true } })
      .to(items, { opacity: 0, y: -30, stagger: 0.04, ease: 'power1.in', immediateRender: false });
  });
}

let built = false;
function rebuild() {
  ScrollTrigger.getAll().forEach((t) => !t.vars.once && t.kill());
  buildStory();
  ScrollTrigger.refresh();
  built = true;
}
let rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(rebuild, 200); });

/* ------------------------------------------------------------------ intro */
function intro() {
  gsap.set(rig.position, { y: -0.25 });
  gsap.from([heroL, heroR], { yPercent: 30, opacity: 0, duration: 1.6, ease: 'expo.out', stagger: 0.08 });
  gsap.to(rig.position, { y: 0, duration: 2, ease: 'expo.out' });
  gsap.to(S, { intro: 1, duration: 1.8, ease: 'power2.out' });
  gsap.from('.hero-kicker, .hero-foot > *, .nav', { opacity: 0, y: 16, duration: 1.2, stagger: 0.08, delay: 0.5, ease: 'power3.out' });
}

/* ------------------------------------------------------------------ render loop */
const timer = new THREE.Timer();
timer.connect(document);
let screenMode = '';
const lookAt = new THREE.Vector3();
const nightBg = { bg: ['#f8f7f4', '#151b1f'], floor: ['#ecede9', '#1a2125'], ink: ['#101614', '#eef1ee'], mute: ['#5d6461', '#93a19d'] };
let lastNight = -1;

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();

  // device pose
  device.group.rotation.y = S.rotY + (reduceMotion ? 0 : S.spin * 0.55 * Math.sin(t * 0.28));
  device.setExplode(S.explode);

  // camera: dolly + frame the device to one side when copy needs room
  const dist = baseDist() * S.dist;
  const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect;
  rig.position.x = S.x * halfW;
  camera.position.set(0, S.camY, dist);
  lookAt.set(0, S.lookY, 0);
  camera.lookAt(lookAt);

  // night: page colours, light levels
  if (Math.abs(S.night - lastNight) > 0.001) {
    lastNight = S.night;
    for (const [k, [a, b]] of Object.entries(nightBg)) root.style.setProperty(`--${k}`, mixHex(a, b, S.night));
    root.style.setProperty('--rule', `rgba(${S.night > 0.5 ? '238,241,238' : '16,22,20'},0.12)`);
  }
  key.intensity = 2.2 * (1 - 0.82 * S.night);
  hemi.intensity = 0.7 * (1 - 0.75 * S.night);
  rim.intensity = 1.1 * (1 - 0.4 * S.night);
  renderer.toneMappingExposure = 1.05 - 0.35 * S.night;
  floor.material.opacity = 0.13 * (1 - S.night);
  pool.material.opacity = 0.6 + 0.4 * S.night + 0.2 * Math.sin((t * Math.PI * 2 * 15) / 60);
  pool.position.x = rig.position.x;

  // light bar
  device.setLightBar(S.night > 0.5 ? 'dim' : S.teal > 0.5 ? 'teal' : 'spectrum', 1);
  device.update(dt, t);

  // screen
  const mode = S.night > 0.5 ? 'night' : S.chat > 0.02 ? 'chat' : 'idle';
  if (mode === 'idle' && videoTex) {
    if (screenMode !== 'video') { device.setScreenTexture(videoTex); screenMode = 'video'; }
  } else {
    if (screenMode !== 'canvas') { device.setScreenTexture(screen.texture); screenMode = 'canvas'; }
    screen.draw(mode, t, S.chat);
  }
  if (S.chat > 0.02) setTalk(S.chat);

  // radar rings sweep outward from the device
  rings.forEach((r, i) => {
    const ph = (t * 0.25 + i / rings.length) % 1;
    const s = 0.7 + ph * 2.7;
    r.scale.setScalar(s);
    r.position.x = rig.position.x;
    r.material.opacity = S.radar * 0.4 * Math.sin(ph * Math.PI) * (1 - ph * 0.5);
  });
  if (S.radar > 0.01) drawBreath(t);

  renderer.render(scene, camera);

  // DOM overlays that follow 3D
  hotTags.forEach((h) => placeTag(h, h.at(), isMobile() ? 0 : S.hot * S.intro, 0));
  placeOpenTags(S.tags);
  const bar = toScreen(partCenter('lightBar') || localPoint(0, 1.75, 0));
  hairline.style.setProperty('--hl-y', `${bar.y}px`);
  hairline.style.setProperty('--hl-k', S.hairline * S.intro);
  hairline.classList.toggle('teal', S.teal > 0.5);
  drawThreads(S.circle, t);
}

/* ------------------------------------------------------------------ go */
let started;
const ready = new Promise((r) => (started = r));
const start = () => {
  if (built) return;
  rebuild();
  intro();
  gsap.ticker.add(frame);
  started();
};
document.fonts.ready.then(start);
setTimeout(start, 2500);

/* ------------------------------------------------------------------ capture */
// The video renderer drives the page: scroll to y, then step the clock to t.
if (CAPTURE) {
  const seekVideo = (s) => new Promise((resolve) => {
    if (!videoTex || !video.duration) return resolve();
    const target = s % video.duration;
    if (Math.abs(video.currentTime - target) < 1e-3) return resolve();
    video.addEventListener('seeked', resolve, { once: true });
    video.currentTime = target;
  });
  window.__carepal = {
    ready: Promise.all([ready, videoReady, document.fonts.ready]),
    // scroll offsets the story is built on, in px
    marks: () => ({
      vh: vh(),
      max: ScrollTrigger.maxScroll(window),
      scenes: scenes.map((s) => ({ id: s.id || s.className, top: s.offsetTop, len: s.offsetHeight })),
    }),
    state: () => ({ video: { readyState: video.readyState, duration: video.duration, time: video.currentTime, error: video.error?.code ?? null, src: video.currentSrc }, texture: !!videoTex, screenMode }),
    async renderAt(t, y) {
      window.scrollTo(0, y);
      ScrollTrigger.update();
      await seekVideo(t);
      if (videoTex) videoTex.needsUpdate = true;
      if (t * 1000 > clock.now) clock.advanceTo(t * 1000, 1000 / 30);
      else gsap.ticker.tick(); // same instant (or earlier): redraw in place
    },
  };
}
