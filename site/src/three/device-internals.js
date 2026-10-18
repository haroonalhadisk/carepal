// CarePal Model 01 — internal modules shown in the exploded view.
//
// Each factory returns a THREE.Group whose origin sits at the bottom of the
// module (radar: centre of the board) so device.js can stack them cleanly.
// Everything is procedural; materials are shared via the `mats` bag.

import * as THREE from 'three';

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Horizontal board (XZ plane) from a 2D shape, top face at y = 0.
function board(shape, thickness, mat) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -thickness, 0);
  const m = new THREE.Mesh(g, mat);
  return m;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  return m;
}

// Deterministic PRNG so the passives scatter identically every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createMaterials() {
  return {
    pcb: new THREE.MeshStandardMaterial({ color: 0x0f4a45, roughness: 0.55, metalness: 0.05 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8ad55, roughness: 0.28, metalness: 1 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.42, metalness: 0.1 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc4c7ca, roughness: 0.32, metalness: 0.9 }),
    darkAlu: new THREE.MeshStandardMaterial({ color: 0x5d6064, roughness: 0.4, metalness: 0.85, side: THREE.DoubleSide }),
    cone: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.78, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.9 }),
    passive: new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.6 }),
    cell: new THREE.MeshStandardMaterial({ color: 0x1f8f86, roughness: 0.35, metalness: 0.2 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.38, metalness: 0.75 }),
    connector: new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.5 }),
    led: new THREE.MeshBasicMaterial({ color: 0x2fd6b8, toneMapped: false }),
  };
}

// Flat 60 GHz radar module: PCB with TX/RX patch-antenna array, RF shield, connector.
export function createRadar(mats) {
  const g = new THREE.Group();
  const W = 0.46, D = 0.32;
  g.add(board(roundedRectShape(W, D, 0.03), 0.016, mats.pcb));

  // Patch array: 2 TX + 4x2 RX, with feed lines — one instanced draw each.
  const patchGeo = new THREE.BoxGeometry(0.034, 0.003, 0.034);
  const patches = [];
  for (let i = 0; i < 2; i++) patches.push([-0.17, -0.06 + i * 0.07]);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) patches.push([-0.07 + c * 0.055, -0.05 + r * 0.07]);
  const patchMesh = new THREE.InstancedMesh(patchGeo, mats.gold, patches.length);
  const feedMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.002, 0.05), mats.gold, patches.length);
  const d = new THREE.Object3D();
  patches.forEach(([x, z], i) => {
    d.position.set(x, 0.0015, z);
    d.updateMatrix();
    patchMesh.setMatrixAt(i, d.matrix);
    d.position.set(x, 0.001, z + 0.04);
    d.updateMatrix();
    feedMesh.setMatrixAt(i, d.matrix);
  });
  g.add(patchMesh, feedMesh);

  // Radar SoC under an RF shield can, plus a crystal and FPC connector.
  g.add(box(0.12, 0.018, 0.1, mats.alu, 0.14, 0, -0.03));
  g.add(box(0.03, 0.008, 0.018, mats.alu, 0.14, 0, 0.07));
  g.add(box(0.1, 0.012, 0.03, mats.connector, 0.14, 0, 0.115));

  // Plated mounting holes.
  const hole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.002, 20), mats.gold, 4);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    d.position.set(sx * (W / 2 - 0.025), 0.001, sz * (D / 2 - 0.025));
    d.updateMatrix();
    hole.setMatrixAt(i, d.matrix);
  });
  g.add(hole);
  return g;
}

// Ring PCB carrying six MEMS microphones around the circumference.
export function createMicArray(mats) {
  const g = new THREE.Group();
  const ring = new THREE.Shape();
  ring.absarc(0, 0, 0.38, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.29, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.014, bevelEnabled: false, curveSegments: 96 });
  ringGeo.rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(ringGeo, mats.pcb));

  const n = 6;
  const can = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.014, 0.03), mats.alu, n);
  const port = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 16), mats.chip, n);
  const pad = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.0015, 24), mats.gold, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 0.335;
    const z = Math.sin(a) * 0.335;
    d.rotation.set(0, -a, 0);
    d.position.set(x, 0.014 + 0.0008, z);
    d.updateMatrix();
    pad.setMatrixAt(i, d.matrix);
    d.position.set(x, 0.014 + 0.007, z);
    d.updateMatrix();
    can.setMatrixAt(i, d.matrix);
    d.position.set(x, 0.014 + 0.0145, z);
    d.updateMatrix();
    port.setMatrixAt(i, d.matrix);
  }
  g.add(pad, can, port);

  // Flex tail running to the hub.
  g.add(box(0.05, 0.003, 0.12, mats.gold, 0, 0, -0.33));
  return g;
}

// Full-range speaker driver facing up: flange, surround, cone, dust cap, basket, magnet.
export function createSpeaker(mats) {
  const g = new THREE.Group();
  const seg = 72;
  const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

  // Flange (top y = 0).
  g.add(lathe([[0.176, -0.012], [0.205, -0.012], [0.21, -0.008], [0.21, -0.002], [0.205, 0], [0.176, 0], [0.176, -0.012]], mats.darkAlu));
  // Rubber surround roll.
  const roll = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    roll.push([0.163 - Math.cos(a) * 0.014, -0.004 + Math.sin(a) * 0.013]);
  }
  g.add(lathe(roll, mats.rubber));
  // Cone.
  const cone = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    cone.push([0.062 + u * 0.087, -0.052 + Math.pow(u, 0.8) * 0.048]);
  }
  g.add(lathe(cone, mats.cone));
  // Dust cap.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 48, 12, 0, Math.PI * 2, 0, 0.7), mats.rubber);
  cap.position.y = -0.1265;
  g.add(cap);
  // Basket.
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.1, 0.06, seg, 1, true), mats.darkAlu);
  basket.position.y = -0.042;
  g.add(basket);
  // Motor: top plate, magnet, back plate.
  g.add(lathe([[0, -0.072], [0.1, -0.072], [0.1, -0.082], [0.092, -0.082], [0.092, -0.118], [0.098, -0.118], [0.098, -0.13], [0, -0.13]], mats.chip));
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, seg), mats.alu);
  plate.position.y = -0.076;
  g.add(plate);

  // Origin at the bottom of the magnet.
  g.children.forEach((c) => (c.position.y += 0.13));
  return g;
}

// Compute + connectivity hub: SoC under heat spreader, RAM, Wi-Fi/BLE/LTE module, USB-C.
export function createHub(mats) {
  const g = new THREE.Group();
  const W = 0.52, D = 0.4;
  const b = board(roundedRectShape(W, D, 0.03), 0.016, mats.pcb);
  b.position.y = 0.016;
  g.add(b);
  const top = 0.016;

  g.add(box(0.12, 0.01, 0.12, mats.chip, -0.06, top, 0.02));
  g.add(box(0.09, 0.006, 0.09, mats.alu, -0.06, top + 0.01, 0.02));
  g.add(box(0.07, 0.008, 0.04, mats.chip, 0.06, top, 0.07));
  g.add(box(0.07, 0.008, 0.04, mats.chip, 0.06, top, -0.03));
  g.add(box(0.13, 0.016, 0.1, mats.alu, 0.17, top, 0.1));
  g.add(box(0.06, 0.02, 0.05, mats.alu, 0.0, top, -D / 2 + 0.03));
  g.add(box(0.045, 0.012, 0.03, mats.connector, -0.19, top, -D / 2 + 0.03));
  g.add(box(0.012, 0.004, 0.012, mats.led, -0.2, top, 0.15));

  // Antenna traces (gold L shapes along two edges).
  g.add(box(0.16, 0.002, 0.008, mats.gold, 0.13, top, D / 2 - 0.02));
  g.add(box(0.008, 0.002, 0.12, mats.gold, W / 2 - 0.02, top, 0.12));
  g.add(box(0.008, 0.002, 0.12, mats.gold, -W / 2 + 0.02, top, -0.08));

  // Passives.
  const rand = rng(7);
  const n = 64;
  const pass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.005, 0.007), mats.passive, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    let x, z;
    do {
      x = (rand() - 0.5) * (W - 0.06);
      z = (rand() - 0.5) * (D - 0.06);
    } while ((x > -0.13 && x < 0.24 && z > -0.06 && z < 0.16) || (x > -0.04 && x < 0.04 && z < -0.12));
    d.position.set(x, top + 0.0025, z);
    d.rotation.set(0, rand() > 0.5 ? 0 : Math.PI / 2, 0);
    d.updateMatrix();
    pass.setMatrixAt(i, d.matrix);
  }
  g.add(pass);
  return g;
}

// Base plate with two Li-ion cells and a small BMS board.
export function createBattery(mats) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.42, 0.018, 96), mats.plate);
  plate.position.y = 0.009;
  g.add(plate);

  const cellGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 40);
  cellGeo.rotateZ(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.012, 40);
  capGeo.rotateZ(Math.PI / 2);
  for (const z of [-0.06, 0.06]) {
    const cell = new THREE.Mesh(cellGeo, mats.cell);
    cell.position.set(-0.03, 0.018 + 0.05, z);
    g.add(cell);
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(capGeo, mats.alu);
      c.position.set(-0.03 + sx * 0.153, 0.068, z);
      g.add(c);
    }
  }
  // Nickel strips bridging the cells.
  g.add(box(0.008, 0.07, 0.2, mats.alu, -0.192, 0.034, 0));
  g.add(box(0.008, 0.07, 0.2, mats.alu, 0.132, 0.034, 0));
  // BMS board.
  const bms = board(roundedRectShape(0.1, 0.16, 0.012), 0.01, mats.pcb);
  bms.position.set(0.22, 0.028, 0);
  g.add(bms);
  g.add(box(0.03, 0.006, 0.03, mats.chip, 0.22, 0.028, -0.03));
  g.add(box(0.04, 0.012, 0.025, mats.connector, 0.22, 0.028, 0.045));
  return g;
}
