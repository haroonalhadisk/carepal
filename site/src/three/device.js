// CarePal Model 01 — procedural Three.js device.
//
// CONTRACT (the page in src/main.js depends on exactly this):
//
//   createDevice({ screenTexture }) -> {
//     group,                 // THREE.Group, device stands on y = 0, ~1.8 units tall, front faces +Z
//     parts: { cap, lightBar, screen, body, radar, mic, speaker, hub, base },
//     setScreenTexture(tex), // swap the texture shown on the display
//     setLightBar(mode, k),  // mode: 'spectrum' | 'teal' | 'dim'; k: 0..1 intensity
//     setExplode(t),         // 0 = assembled, 1 = fully exploded vertical stack
//     update(dt, elapsed),   // per-frame: light-bar breathing etc.
//   }
//
// Also returns dispose() to free every geometry/material/texture it created.
//
// Layout (world units, assembled):
//   base  y 0.00–0.25   round stepped plinth with two fine grooves
//   body  y 0.25–1.53   D-shaped shell (flat front at z 0.38) + rear volume on the right
//   front y 0.26–1.525  raised panel carrying the 9:16 screen, camera, speaker dots
//   cap   y 1.535–~1.85 sloped D-shaped cap with the spectrum light bar
// Hierarchy: lightBar is a child of cap; screen is a child of the (internal) front panel
// group, which follows the body during the explode and slides slightly forward.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  roundedRectShape,
  createMaterials,
  createRadar,
  createMicArray,
  createSpeaker,
  createHub,
  createBattery,
} from './device-internals.js';

const BODY_R = 0.5;
const BODY_F = 0.38; // flat front plane (z)
const BASE_TOP = 0.25;
const BODY_TOP = 1.53;
const CAP_BOTTOM = 1.535;
const CAP_TOP = 1.8;
const CAP_TUCK = 0.05; // cap bottom bevel hidden inside the body
const CAP_SLOPE = 0.12; // top rises toward the back so it faces the viewer
const PANEL_Z = BODY_F - 0.006;
const PANEL_DEPTH = 0.03;
const PANEL_FRONT = PANEL_Z + PANEL_DEPTH;
const SCREEN_W = 0.48;
const SCREEN_H = SCREEN_W * (16 / 9);
const SCREEN_Y = 0.98;

const BREATHS_PER_MIN = 15;

// Smooth min — rounds the corner where the flat front meets the cylinder.
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// D-shaped footprint as a Shape in (x, -z) so that rotateX(-PI/2) maps it back to world XZ.
function dShape(R, F, k, n = 192) {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const z = smin(Math.sin(a) * R, F, k);
    if (i === 0) s.moveTo(x, -z);
    else s.lineTo(x, -z);
  }
  s.closePath();
  return s;
}

function circleShape(cx, cz, r, n = 128) {
  const s = new THREE.Shape();
  s.absarc(cx, -cz, r, 0, Math.PI * 2, false);
  return s;
}

// Vertical extrusion y0..y1 with a rounded bevel that stays inside the outline.
function extrudeUp(shape, y0, y1, bevel, bevelSegments = 4, curveSegments = 96) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: y1 - y0 - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    curveSegments,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}

// Weld + smooth normals (ExtrudeGeometry is flat-shaded per face otherwise).
function smooth(g) {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-5);
  m.computeVertexNormals();
  g.dispose();
  return m;
}

// Lathe from [radius, y] pairs.
function lathe(pts, segments = 128) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// Flat shape in XY with 0..1 UVs across its bounding box.
function shapeWithUVs(shape, w, h) {
  const g = new THREE.ShapeGeometry(shape, 16);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

function capTopY(z) {
  return CAP_TOP - CAP_SLOPE * z;
}

function spectrumColor(u, out) {
  const stops = [
    [0.0, new THREE.Color('#ff6a55')],
    [0.32, new THREE.Color('#ffb23a')],
    [0.66, new THREE.Color('#6fdc6b')],
    [1.0, new THREE.Color('#22d8c6')],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (u <= b) return out.copy(ca).lerp(cb, (u - a) / (b - a));
  }
  return out.copy(stops[stops.length - 1][1]);
}

// Soft glow falloff texture (white RGB, alpha = gaussian across, fade at the ends).
function glowTexture() {
  const w = 128, h = 32;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h - 0.5;
    const across = Math.exp(-(v * v) / (2 * 0.16 * 0.16));
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const ends = Math.min(1, Math.min(u, 1 - u) / 0.12);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * across * ends * ends);
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function createDevice({ screenTexture } = {}) {
  const group = new THREE.Group();
  group.name = 'CarePal';

  // ---------- materials ----------
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3f2ef,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.32,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xffffff),
  });
  const panelMat = shellMat.clone();
  panelMat.color.set(0xf7f6f3);
  panelMat.roughness = 0.34;
  panelMat.clearcoat = 0.5;
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x34373a, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.8 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0b0d, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 });
  const lensIrisMat = new THREE.MeshPhysicalMaterial({ color: 0x1c2740, roughness: 0.15, metalness: 0.4, clearcoat: 1 });
  const slotMat = new THREE.MeshStandardMaterial({ color: 0xc9cac6, roughness: 0.6 });
  const screenMat = new THREE.MeshBasicMaterial({
    map: screenTexture || null,
    color: screenTexture ? 0xffffff : 0xcfe4f7,
    toneMapped: false,
  });
  const internalMats = createMaterials();

  // ---------- base: round stepped plinth with two fine grooves ----------
  const base = new THREE.Group();
  base.name = 'base';
  {
    const R = BODY_R, r2 = BODY_R - 0.008;
    const groove = (y, rr) => [[rr, y - 0.004], [rr - 0.004, y - 0.0025], [rr - 0.004, y + 0.0025], [rr, y + 0.004]];
    const pts = [
      [0, 0], [R - 0.03, 0], [R - 0.012, 0.003], [R - 0.003, 0.012], [R, 0.024],
      ...groove(0.062, R),
      ...groove(0.112, R),
      [R, 0.162], [R - 0.002, 0.167], [r2 + 0.001, 0.17], [r2, 0.173],
      [r2, BASE_TOP - 0.012], [r2 - 0.003, BASE_TOP - 0.003], [r2 - 0.012, BASE_TOP], [0, BASE_TOP],
    ];
    const m = new THREE.Mesh(lathe(pts, 160), shellMat);
    base.add(m);
  }

  // ---------- body: D-shaped shell + secondary rear volume on the right ----------
  const body = new THREE.Group();
  body.name = 'body';
  {
    const shell = new THREE.Mesh(smooth(extrudeUp(dShape(BODY_R, BODY_F, 0.06), BASE_TOP, BODY_TOP, 0.012, 4)), shellMat);
    const rc = [0.13, -0.12], rr = 0.37;
    const rearLow = new THREE.Mesh(smooth(extrudeUp(circleShape(rc[0], rc[1], rr), BASE_TOP, 0.71, 0.01, 3)), shellMat);
    const rearHigh = new THREE.Mesh(smooth(extrudeUp(circleShape(rc[0], rc[1], rr), 0.715, 1.11, 0.03, 6)), shellMat);
    body.add(shell, rearLow, rearHigh);
  }

  // ---------- front panel: screen, camera, speaker dots ----------
  const front = new THREE.Group();
  front.name = 'front';
  let screen;
  {
    const PW = 0.6, PY0 = 0.26, PY1 = 1.525, PB = 0.008;
    const ph = PY1 - PY0;
    const pg = new THREE.ExtrudeGeometry(roundedRectShape(PW, ph, 0.045), {
      depth: PANEL_DEPTH - PB * 2,
      bevelEnabled: true,
      bevelThickness: PB,
      bevelSize: PB,
      bevelOffset: -PB,
      bevelSegments: 4,
      curveSegments: 16,
    });
    pg.translate(0, (PY0 + PY1) / 2, PANEL_Z + PB);
    front.add(new THREE.Mesh(smooth(pg), panelMat));

    // Dark glass border, then the display itself.
    const border = 0.007;
    const glass = new THREE.Mesh(
      new THREE.ShapeGeometry(roundedRectShape(SCREEN_W + border * 2, SCREEN_H + border * 2, 0.05), 16),
      glassMat,
    );
    glass.position.set(0, SCREEN_Y, PANEL_FRONT + 0.0006);
    screen = new THREE.Mesh(shapeWithUVs(roundedRectShape(SCREEN_W, SCREEN_H, 0.04), SCREEN_W, SCREEN_H), screenMat);
    screen.name = 'screen';
    screen.position.set(0, SCREEN_Y, PANEL_FRONT + 0.0012);
    front.add(glass, screen);

    // Punch-hole front camera near the top of the display.
    const cam = new THREE.Group();
    cam.add(new THREE.Mesh(new THREE.CircleGeometry(0.017, 40), lensMat));
    const iris = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0075, 32), lensIrisMat);
    iris.position.z = 0.0004;
    cam.add(iris);
    cam.position.set(0, SCREEN_Y + SCREEN_H / 2 - 0.032, PANEL_FRONT + 0.0022);
    front.add(cam);

    // Two groups of three speaker dots below the screen.
    const dotGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 16);
    dotGeo.rotateX(Math.PI / 2);
    const dots = new THREE.InstancedMesh(dotGeo, holeMat, 6);
    const d = new THREE.Object3D();
    let i = 0;
    for (const gx of [-0.13, 0.13]) for (const k of [-1, 0, 1]) {
      d.position.set(gx + k * 0.024, 0.42, PANEL_FRONT - 0.0012);
      d.updateMatrix();
      dots.setMatrixAt(i++, d.matrix);
    }
    front.add(dots);
  }

  // ---------- cap: sloped D-shaped cap ----------
  const cap = new THREE.Group();
  cap.name = 'cap';
  {
    // The lower bevel starts below the seam, inside the body, so the visible
    // bottom edge reads as a crisp undercut while the top gets a soft round.
    const y0 = CAP_BOTTOM - CAP_TUCK;
    const g = extrudeUp(dShape(BODY_R + 0.006, BODY_F + 0.032, 0.07), y0, CAP_TOP, 0.075, 10);
    // Shear the top: front edge drops, back rises, bottom stays flat.
    const p = g.attributes.position;
    const h = CAP_TOP - y0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setY(i, y - CAP_SLOPE * p.getZ(i) * ((y - y0) / h));
    }
    cap.add(new THREE.Mesh(smooth(g), shellMat));
  }

  // ---------- light bar (child of cap) ----------
  const lightBar = new THREE.Group();
  lightBar.name = 'lightBar';
  const BAR_L = 0.33;
  const barPoint = (u) => {
    const x = (u * 2 - 1) * BAR_L;
    const z = 0.305 - 0.055 * (x / BAR_L) ** 2;
    return new THREE.Vector3(x, capTopY(z), z);
  };
  const barCurve = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => barPoint(i / 16)));
  const tilt = new THREE.Vector3(0, 1, CAP_SLOPE).normalize(); // cap top normal

  // Tapered tube along the bar curve; taper keeps the open ends tucked into the cap.
  const taperedTube = (radius, sink, tubular = 96, radial = 12) => {
    const g = new THREE.TubeGeometry(barCurve, tubular, radius, radial, false);
    const p = g.attributes.position;
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const u = Math.floor(i / (radial + 1)) / tubular;
      barCurve.getPointAt(u, c);
      const e = Math.min(1, Math.min(u, 1 - u) / 0.05);
      const taper = Math.sqrt(Math.max(0, 1 - (1 - e) ** 2));
      v.fromBufferAttribute(p, i).sub(c).multiplyScalar(Math.max(taper, 0.05));
      v.add(c).addScaledVector(tilt, -sink);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return { g, u: (i) => Math.floor(i / (radial + 1)) / tubular };
  };

  const slot = taperedTube(0.021, 0.016, 64, 10);
  const slotMesh = new THREE.Mesh(slot.g, slotMat);
  const core = taperedTube(0.014, 0.005);
  const coreMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const coreMesh = new THREE.Mesh(core.g, coreMat);

  // Halo: a strip lying on the cap top following the bar, alpha from glowTexture.
  const haloTex = glowTexture();
  const haloGeo = (() => {
    const segs = 64, width = 0.22;
    const pos = [], uv = [], idx = [];
    const t = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const c = barCurve.getPointAt(u);
      barCurve.getTangentAt(u, t);
      side.crossVectors(tilt, t).normalize();
      for (const s of [-1, 1]) {
        const ext = (u - 0.5) * 0.08; // overshoot the ends slightly
        const px = c.x + side.x * s * width * 0.5 + t.x * ext;
        const pz = c.z + side.z * s * width * 0.5 + t.z * ext;
        pos.push(px, capTopY(pz) + 0.0015, pz);
        uv.push(u, s < 0 ? 0 : 1);
      }
      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { g, u: (i) => Math.floor(i / 2) / segs };
  })();
  const haloMat = new THREE.MeshBasicMaterial({
    map: haloTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const haloMesh = new THREE.Mesh(haloGeo.g, haloMat);
  haloMesh.renderOrder = 2;
  haloMesh.castShadow = false;
  lightBar.add(slotMesh, coreMesh, haloMesh);
  cap.add(lightBar);

  // Per-vertex spectrum colours (linear), plus colour attributes we rewrite each frame.
  const prepColors = (geo, uOf) => {
    const n = geo.attributes.position.count;
    const spec = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      spectrumColor(Math.min(1, Math.max(0, uOf(i))), c);
      spec[i * 3] = c.r; spec[i * 3 + 1] = c.g; spec[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return spec;
  };
  const coreSpec = prepColors(core.g, core.u);
  const haloSpec = prepColors(haloGeo.g, haloGeo.u);
  const TEAL = new THREE.Color('#2fd6b8');
  const OFF = new THREE.Color(0xd9d9d5);

  // ---------- internals (exploded view only) ----------
  const radar = createRadar(internalMats);
  radar.name = 'radar';
  const mic = createMicArray(internalMats);
  mic.name = 'mic';
  const speaker = createSpeaker(internalMats);
  speaker.name = 'speaker';
  const hub = createHub(internalMats);
  hub.name = 'hub';
  const battery = createBattery(internalMats);
  battery.name = 'battery';
  const internals = [radar, mic, speaker, hub, battery];
  internals.forEach((m) => (m.visible = false));

  group.add(base, body, front, cap, battery, hub, speaker, mic, radar);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o !== haloMesh && o !== screen;
      o.receiveShadow = o !== haloMesh && o !== screen && o !== coreMesh;
    }
  });

  // ---------- explode: assembled -> exploded transforms, mapped linearly ----------
  // Stack (exploded, bottom to top): base, battery, hub, speaker, body+front, mic, radar, cap.
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const explode = [
    { o: base, a: V(0, 0, 0), b: V(0, -0.75, 0) },
    { o: battery, a: V(0, 0.04, 0), b: V(0, -0.37, 0) },
    { o: hub, a: V(0, 0.3, -0.05), b: V(0, -0.12, 0) },
    { o: speaker, a: V(0, 0.42, -0.08), b: V(0, 0.08, 0) },
    { o: body, a: V(0, 0, 0), b: V(0, 0.26, 0) },
    { o: front, a: V(0, 0, 0), b: V(0, 0.26, 0.14) },
    { o: mic, a: V(0, 1.45, -0.04), b: V(0, 2.0, 0) },
    { o: radar, a: V(0, 1.05, 0.2), b: V(0, 2.24, 0), ra: Math.PI / 2, rb: 0.5 },
    { o: cap, a: V(0, 0, 0), b: V(0, 0.98, 0) },
  ];

  const setExplode = (t) => {
    const k = Math.min(1, Math.max(0, t || 0));
    for (const e of explode) {
      e.o.position.lerpVectors(e.a, e.b, k);
      if (e.ra !== undefined) e.o.rotation.x = e.ra + (e.rb - e.ra) * k;
    }
    const show = k > 0.001;
    internals.forEach((m) => (m.visible = show));
  };
  setExplode(0);

  // ---------- light bar state ----------
  let barMode = 'spectrum';
  let barK = 1;
  let level = 1; // smoothed overall brightness
  let teal = 0; // smoothed 0 = spectrum, 1 = teal

  const writeColors = (geo, spec, I, gain) => {
    const col = geo.attributes.color;
    const arr = col.array;
    const tr = TEAL.r, tg = TEAL.g, tb = TEAL.b;
    for (let i = 0; i < arr.length; i += 3) {
      const r = (spec[i] + (tr - spec[i]) * teal) * gain;
      const g = (spec[i + 1] + (tg - spec[i + 1]) * teal) * gain;
      const b = (spec[i + 2] + (tb - spec[i + 2]) * teal) * gain;
      arr[i] = OFF.r + (r - OFF.r) * I;
      arr[i + 1] = OFF.g + (g - OFF.g) * I;
      arr[i + 2] = OFF.b + (b - OFF.b) * I;
    }
    col.needsUpdate = true;
  };

  const applyBar = (elapsed) => {
    // 15 breaths/min -> 0.25 Hz; b eases 0..1..0 like an inhale/exhale.
    const b = 0.5 - 0.5 * Math.cos(elapsed * Math.PI * 2 * (BREATHS_PER_MIN / 60));
    const I = Math.min(1, level * (0.62 + 0.38 * b));
    writeColors(core.g, coreSpec, Math.min(1, 0.25 + I), 1.15);
    writeColors(haloGeo.g, haloSpec, 1, 1);
    haloMat.opacity = 0.9 * I;
  };
  applyBar(0);

  return {
    group,
    parts: { cap, lightBar, screen, body, radar, mic, speaker, hub, base },

    setScreenTexture(tex) {
      screenMat.map = tex || null;
      screenMat.color.set(tex ? 0xffffff : 0xcfe4f7);
      screenMat.needsUpdate = true;
    },

    setLightBar(mode, k = 1) {
      if (mode === 'spectrum' || mode === 'teal' || mode === 'dim') barMode = mode;
      barK = Math.min(1, Math.max(0, k));
    },

    setExplode,

    update(dt, elapsed) {
      const s = 1 - Math.exp(-Math.min(dt || 0, 0.1) * 6);
      const targetLevel = barMode === 'dim' ? 0.22 * barK : barK;
      level += (targetLevel - level) * s;
      teal += ((barMode === 'teal' ? 1 : 0) - teal) * s;
      applyBar(elapsed || 0);
    },

    dispose() {
      const seen = new Set();
      group.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) if (!seen.has(m)) { seen.add(m); m.dispose(); }
      });
      haloTex.dispose();
      group.removeFromParent();
    },
  };
}
