import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingId } from '../data/buildings';

/**
 * Eigene Low-Poly-Modelle aus Grundkörpern mit Vertexfarben. Alle Maße in
 * Zellen, y zeigt nach oben, der Ursprung liegt in der Mitte der
 * Grundfläche auf Bodenhöhe.
 */

const C = {
  holz: 0x8a5a2b,
  holzDunkel: 0x5a3b1e,
  holzHell: 0xb08d4a,
  stroh: 0xc9a85a,
  stein: 0x8c8c86,
  steinDunkel: 0x5f5f5a,
  eisen: 0x4d4d4d,
  otter: 0x6b4a2b,
  otterBauch: 0xa88560,
  otterNase: 0x2b2117,
  laub: 0x3f8a36,
  laubDunkel: 0x2f6b2a,
  busch: 0x3c7d2f,
  beere: 0xc0392b,
  wasser: 0x3b8fc0,
};

function colored(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.getAttribute('position').count;
  const col = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  }
  return g;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, ry = 0): THREE.BufferGeometry {
  const g = colored(new THREE.BoxGeometry(w, h, d), color);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
}

function cylinder(r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 8, rTop = r): THREE.BufferGeometry {
  const g = colored(new THREE.CylinderGeometry(rTop, r, h, seg), color);
  g.translate(x, y + h / 2, z);
  return g;
}

function cone(r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 4, ry = 0): THREE.BufferGeometry {
  const g = colored(new THREE.ConeGeometry(r, h, seg), color);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
}

function ball(r: number, color: number, x = 0, y = 0, z = 0, detail = 0): THREE.BufferGeometry {
  const g = colored(new THREE.IcosahedronGeometry(r, detail), color);
  g.translate(x, y, z);
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** Hütte mit Pyramidendach, Größe in Zellen */
function hut(size: number, wall = C.holz, roof = C.stroh): THREE.BufferGeometry[] {
  const s = size * 0.78;
  return [
    box(s, 0.5, s, wall),
    cone(s * 0.82, 0.42, roof, 0, 0.5, 0, 4, Math.PI / 4),
    box(0.16, 0.26, 0.04, C.holzDunkel, 0, 0, s / 2 + 0.01), // Tür
  ];
}

export function otterGeometry(): THREE.BufferGeometry {
  return merge([
    box(0.26, 0.22, 0.5, C.otter, 0, 0.1, 0), // Rumpf
    box(0.2, 0.08, 0.4, C.otterBauch, 0, 0.1, 0.02), // Bauch
    box(0.24, 0.2, 0.22, C.otter, 0, 0.2, 0.3), // Kopf
    box(0.12, 0.08, 0.08, C.otterBauch, 0, 0.24, 0.43), // Schnauze
    box(0.06, 0.04, 0.03, C.otterNase, 0, 0.3, 0.46), // Nase
    box(0.06, 0.06, 0.04, C.otter, -0.09, 0.38, 0.3), // Ohren
    box(0.06, 0.06, 0.04, C.otter, 0.09, 0.38, 0.3),
    box(0.1, 0.08, 0.34, C.otter, 0, 0.12, -0.38), // Schwanz
    box(0.08, 0.1, 0.08, C.otter, -0.09, 0, 0.16), // Beine
    box(0.08, 0.1, 0.08, C.otter, 0.09, 0, 0.16),
    box(0.08, 0.1, 0.08, C.otter, -0.09, 0, -0.14),
    box(0.08, 0.1, 0.08, C.otter, 0.09, 0, -0.14),
  ]);
}

export function treeGeometry(): THREE.BufferGeometry {
  return merge([
    cylinder(0.09, 0.55, C.holzDunkel, 0, 0, 0, 6, 0.07),
    ball(0.42, C.laub, 0, 0.78, 0),
    ball(0.3, C.laubDunkel, 0.12, 1.02, 0.08),
  ]);
}

export function bushGeometry(): THREE.BufferGeometry {
  return merge([ball(0.3, C.busch, 0, 0.26, 0), ball(0.2, C.laubDunkel, 0.16, 0.2, 0.1)]);
}

export function berriesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spots = [
    [0.18, 0.4, 0.14],
    [-0.14, 0.44, 0.1],
    [0.04, 0.5, -0.16],
    [-0.2, 0.28, -0.1],
    [0.22, 0.26, -0.12],
    [-0.02, 0.3, 0.26],
  ];
  for (const [x, y, z] of spots) parts.push(ball(0.055, C.beere, x, y, z));
  return merge(parts);
}

export function logGeometry(): THREE.BufferGeometry {
  const g = colored(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6), C.holz);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.36, 0);
  return merge([g]);
}

export function basketGeometry(): THREE.BufferGeometry {
  return merge([cylinder(0.1, 0.12, C.holzHell, 0, 0.3, 0, 6, 0.12), cylinder(0.08, 0.03, C.beere, 0, 0.42, 0, 6)]);
}

/** Baugerüst für Baustellen, Größe in Zellen */
export function siteGeometry(size: number): THREE.BufferGeometry {
  const s = size * 0.8;
  const h = size * 0.7;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(0.08, h, 0.08, C.holzHell, (sx * s) / 2, 0, (sz * s) / 2));
  }
  parts.push(box(s + 0.08, 0.06, 0.08, C.holzHell, 0, h, s / 2));
  parts.push(box(s + 0.08, 0.06, 0.08, C.holzHell, 0, h, -s / 2));
  parts.push(box(0.08, 0.06, s + 0.08, C.holzHell, s / 2, h, 0));
  parts.push(box(0.08, 0.06, s + 0.08, C.holzHell, -s / 2, h, 0));
  return merge(parts);
}

export function buildingGeometry(id: BuildingId): THREE.BufferGeometry {
  switch (id) {
    case 'huette':
      return merge(hut(1));
    case 'pumpe': {
      const wheel = colored(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10), C.holz);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(0.28, 0.42, 0);
      const spokes = colored(new THREE.BoxGeometry(0.1, 0.5, 0.06), C.holzDunkel);
      spokes.rotateZ(Math.PI / 2);
      spokes.rotateX(Math.PI / 4);
      spokes.translate(0.28, 0.42, 0);
      return merge([
        box(0.55, 0.32, 0.6, C.stein, -0.1, 0, 0),
        cone(0.4, 0.28, C.holzDunkel, -0.1, 0.32, 0, 4, Math.PI / 4),
        box(0.06, 0.42, 0.06, C.holzDunkel, 0.28, 0, 0),
        wheel,
        spokes,
        box(0.12, 0.1, 0.5, C.eisen, -0.1, 0.3, 0.3),
      ]);
    }
    case 'tank':
      return merge([
        cylinder(0.4, 0.78, C.holz, 0, 0, 0, 10),
        cylinder(0.42, 0.05, C.eisen, 0, 0.14, 0, 10),
        cylinder(0.42, 0.05, C.eisen, 0, 0.58, 0, 10),
        cylinder(0.36, 0.06, C.wasser, 0, 0.75, 0, 10),
      ]);
    case 'sammler':
      return merge([
        ...hut(0.85, C.holz, C.laubDunkel),
        cylinder(0.14, 0.18, C.holzHell, 0.3, 0, 0.3, 6, 0.17),
        cylinder(0.12, 0.04, C.beere, 0.3, 0.18, 0.3, 6),
      ]);
    case 'holzfaeller': {
      const logs: THREE.BufferGeometry[] = [];
      for (const [x, y] of [
        [-0.08, 0],
        [0.08, 0],
        [0, 0.13],
      ]) {
        const l = colored(new THREE.CylinderGeometry(0.07, 0.07, 0.46, 6), C.holz);
        l.rotateX(Math.PI / 2);
        l.translate(0.34 + x, 0.07 + y, -0.1);
        logs.push(l);
      }
      return merge([...hut(0.85, C.holzDunkel, C.holz), ...logs, box(0.05, 0.3, 0.05, C.holzDunkel, -0.38, 0, 0.36), box(0.12, 0.12, 0.04, C.eisen, -0.38, 0.24, 0.36)]);
    }
    case 'foerster':
      return merge([
        ...hut(0.85, C.holz, C.laub),
        cylinder(0.08, 0.2, C.holzDunkel, 0.32, 0, 0.3, 5, 0.03),
        ball(0.12, C.laub, 0.32, 0.3, 0.3),
        cylinder(0.08, 0.2, C.holzDunkel, -0.32, 0, 0.3, 5, 0.03),
        ball(0.12, C.laub, -0.32, 0.3, 0.3),
      ]);
    case 'lager': {
      const parts: THREE.BufferGeometry[] = [box(1.8, 0.08, 1.8, C.holzDunkel)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.1, 0.95, 0.1, C.holz, sx * 0.82, 0.08, sz * 0.82));
      parts.push(box(1.9, 0.08, 1.9, C.stroh, 0, 1.0, 0));
      parts.push(cone(1.35, 0.35, C.stroh, 0, 1.08, 0, 4, Math.PI / 4));
      parts.push(box(0.4, 0.4, 0.4, C.holzHell, -0.45, 0.08, -0.4));
      parts.push(box(0.4, 0.4, 0.4, C.holzHell, 0.1, 0.08, -0.45));
      parts.push(box(0.36, 0.36, 0.36, C.holzHell, -0.2, 0.48, -0.42));
      parts.push(cylinder(0.22, 0.3, C.holzHell, 0.45, 0.08, 0.35, 6, 0.26));
      return merge(parts);
    }
  }
}

export const BUILDING_IDS: BuildingId[] = ['lager', 'huette', 'pumpe', 'tank', 'sammler', 'holzfaeller', 'foerster'];
