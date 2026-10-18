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
// This file is a stand-in built from primitives so the page can be developed;
// 3d_boy replaces it with the detailed model, keeping the same contract.

import * as THREE from 'three';

export function createDevice({ screenTexture } = {}) {
  const group = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xd9dad6, roughness: 0.6 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.64, 0.28, 96), white);
  base.position.y = 0.14;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 96), white);
  body.position.y = 0.88;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.26, 96), white);
  cap.position.y = 1.62;

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true });
  const barGeo = new THREE.BoxGeometry(0.8, 0.02, 0.04, 32, 1, 1);
  const cols = [];
  const pos = barGeo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + 0.4) / 0.8;
    c.setHSL(0.02 + u * 0.48, 0.95, 0.6);
    cols.push(c.r, c.g, c.b);
  }
  barGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const lightBar = new THREE.Mesh(barGeo, lightMat);
  lightBar.position.set(0, 1.76, 0.12);

  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture || null, color: screenTexture ? 0xffffff : 0xcfe4f7, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), screenMat);
  screen.position.set(0, 0.95, 0.605);

  const radar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 48), grey);
  radar.position.y = 1.2;
  const mic = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.02, 12, 64), grey);
  mic.rotation.x = Math.PI / 2;
  mic.position.y = 1.45;
  const speaker = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 48), grey);
  speaker.position.y = 0.55;
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.3), grey);
  hub.position.y = 0.3;
  [radar, mic, speaker, hub].forEach((m) => (m.visible = false));

  group.add(base, body, cap, lightBar, screen, radar, mic, speaker, hub);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const home = new Map();
  group.children.forEach((m) => home.set(m, m.position.y));
  const lift = { cap: 1.1, lightBar: 1.1, radar: 0.75, mic: 0.95, body: 0.15, screen: 0.15, speaker: -0.1, hub: -0.3, base: -0.45 };
  const parts = { cap, lightBar, screen, body, radar, mic, speaker, hub, base };

  let barMode = 'spectrum';
  let barK = 1;

  return {
    group,
    parts,
    setScreenTexture(tex) { screenMat.map = tex; screenMat.color.set(0xffffff); screenMat.needsUpdate = true; },
    setLightBar(mode, k = 1) { barMode = mode; barK = k; },
    setExplode(t) {
      for (const [name, m] of Object.entries(parts)) m.position.y = home.get(m) + (lift[name] || 0) * t;
      body.material.opacity = 1;
      [radar, mic, speaker, hub].forEach((m) => (m.visible = t > 0.02));
    },
    update(dt, elapsed) {
      const breath = 0.75 + 0.25 * Math.sin((elapsed * Math.PI * 2 * 15) / 60);
      lightMat.opacity = barMode === 'dim' ? 0.35 * barK : breath * barK;
      lightMat.color.set(barMode === 'teal' ? 0x2fd6b8 : 0xffffff);
    },
  };
}
