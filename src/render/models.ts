import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { GOOD_CODE } from '../data/goods';

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
  feuer: 0xe8742a,
  flamme: 0xf5c542,
  fisch: 0x9bb0b8,
  brot: 0xb8793a,
  erde: 0x6b4a2f,
  rauch: 0xb0b0b0,
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

/** Satteldach: dreieckiges Prisma, Breite w (Giebelseite), Höhe h, Länge d */
function gable(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, ry = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = colored(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), color);
  g.translate(0, 0, -d / 2);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** Vier Pfosten an den Ecken eines Quadrats */
function posts(s: number, h: number, color: number, y = 0, t = 0.07): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(t, h, t, color, (sx * s) / 2, y, (sz * s) / 2));
  return out;
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

function logGeometry(): THREE.BufferGeometry {
  const g = colored(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6), C.holz);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.36, 0);
  return merge([g]);
}

function basketGeometry(top: number): THREE.BufferGeometry {
  return merge([cylinder(0.1, 0.12, C.holzHell, 0, 0.3, 0, 6, 0.12), cylinder(0.08, 0.03, top, 0, 0.42, 0, 6)]);
}

/** Kennziffern der getragenen Waren, für die es ein Modell gibt */
export const CARRY_CODES: number[] = Object.values(GOOD_CODE);

/** Getragene Ware auf dem Rücken eines Otters, je Kennziffer aus GOOD_CODE */
export function carryGeometry(code: number): THREE.BufferGeometry {
  switch (code) {
    case GOOD_CODE.holz:
      return logGeometry();
    case GOOD_CODE.beeren:
      return basketGeometry(C.beere);
    case GOOD_CODE.kraeuter:
      return basketGeometry(C.laub);
    case GOOD_CODE.bretter:
      return merge([box(0.16, 0.03, 0.36, C.holzHell, 0, 0.3, 0), box(0.16, 0.03, 0.36, C.holzHell, 0.02, 0.34, 0.02), box(0.16, 0.03, 0.36, C.holzHell, -0.02, 0.38, -0.02)]);
    case GOOD_CODE.fisch: {
      const body = colored(new THREE.IcosahedronGeometry(0.09, 0), C.fisch);
      body.scale(1, 0.7, 2);
      body.translate(0, 0.36, 0);
      return merge([body, cone(0.06, 0.1, C.fisch, 0, 0.3, -0.2, 3, Math.PI / 2)]);
    }
    case GOOD_CODE.korn:
      return merge([cylinder(0.1, 0.16, C.stroh, 0, 0.28, 0, 7, 0.07), ball(0.05, C.stroh, 0, 0.46, 0)]);
    case GOOD_CODE.brot:
      return merge([ball(0.09, C.brot, 0, 0.36, 0.05, 0), ball(0.09, C.brot, 0, 0.36, -0.08, 0)]);
    case GOOD_CODE.werkzeug:
      return merge([box(0.22, 0.1, 0.14, C.holzDunkel, 0, 0.3, 0), box(0.12, 0.03, 0.03, C.eisen, 0, 0.42, 0), box(0.03, 0.06, 0.03, C.eisen, -0.05, 0.4, 0), box(0.03, 0.06, 0.03, C.eisen, 0.05, 0.4, 0)]);
    default:
      return logGeometry();
  }
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
    case 'badesteg': {
      const parts: THREE.BufferGeometry[] = [box(0.92, 0.06, 0.92, C.holzHell, 0, 0.3, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cylinder(0.05, 0.32, C.holzDunkel, sx * 0.38, 0, sz * 0.38, 6));
      // Geländer an einer Seite und Leiter ins Wasser an der anderen
      parts.push(box(0.92, 0.04, 0.04, C.holz, 0, 0.64, -0.44));
      parts.push(box(0.04, 0.3, 0.04, C.holz, -0.42, 0.36, -0.44));
      parts.push(box(0.04, 0.3, 0.04, C.holz, 0.42, 0.36, -0.44));
      parts.push(box(0.04, 0.5, 0.04, C.holz, -0.12, 0.02, 0.47));
      parts.push(box(0.04, 0.5, 0.04, C.holz, 0.12, 0.02, 0.47));
      for (const y of [0.12, 0.26, 0.4]) parts.push(box(0.2, 0.03, 0.03, C.holzHell, 0, y, 0.47));
      parts.push(box(0.3, 0.03, 0.2, C.beere, 0.2, 0.33, 0.1)); // Handtuch
      return merge(parts);
    }
    case 'musikplatz': {
      const parts: THREE.BufferGeometry[] = [cylinder(0.46, 0.08, C.holzHell, 0, 0, 0, 10)];
      parts.push(cylinder(0.14, 0.22, C.holzDunkel, 0.16, 0.08, 0.1, 8)); // Trommel
      parts.push(cylinder(0.15, 0.03, C.stroh, 0.16, 0.3, 0.1, 8));
      parts.push(cylinder(0.1, 0.18, C.holzDunkel, -0.14, 0.08, 0.22, 8)); // kleine Trommel
      parts.push(cylinder(0.11, 0.03, C.stroh, -0.14, 0.26, 0.22, 8));
      parts.push(box(0.05, 0.95, 0.05, C.holzDunkel, -0.3, 0.08, -0.3)); // Fahnenmast
      parts.push(box(0.34, 0.2, 0.02, C.beere, -0.12, 0.8, -0.3));
      parts.push(box(0.05, 0.95, 0.05, C.holzDunkel, 0.3, 0.08, -0.3));
      parts.push(box(0.34, 0.2, 0.02, C.wasser, 0.12, 0.8, -0.3));
      return merge(parts);
    }
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
    case 'heiler':
      return merge([
        ...hut(0.9, C.holzHell, C.laub),
        // grünes Kreuz über der Tür und ein Kräuterbeet
        box(0.2, 0.06, 0.04, C.laubDunkel, 0, 0.56, 0.37),
        box(0.06, 0.2, 0.04, C.laubDunkel, 0, 0.49, 0.37),
        box(0.3, 0.08, 0.2, C.holzDunkel, 0.3, 0, 0.36),
        ball(0.07, C.laub, 0.22, 0.12, 0.36),
        ball(0.07, C.laub, 0.38, 0.12, 0.36),
      ]);
    case 'brunnen': {
      const parts: THREE.BufferGeometry[] = [
        cylinder(0.32, 0.3, C.stein, 0, 0, 0, 10),
        cylinder(0.24, 0.32, C.steinDunkel, 0, 0, 0, 10),
        box(0.06, 0.7, 0.06, C.holzDunkel, -0.3, 0.3, 0),
        box(0.06, 0.7, 0.06, C.holzDunkel, 0.3, 0.3, 0),
        box(0.76, 0.05, 0.05, C.holzDunkel, 0, 0.98, 0),
        cylinder(0.1, 0.1, C.holzHell, 0, 0.5, 0, 6),
      ];
      const roof = cone(0.5, 0.26, C.stroh, 0, 1.03, 0, 4, Math.PI / 4);
      parts.push(roof);
      return merge(parts);
    }
    case 'zisterne':
      return merge([
        cylinder(0.85, 0.95, C.holz, 0, 0, 0, 14),
        cylinder(0.88, 0.07, C.eisen, 0, 0.2, 0, 14),
        cylinder(0.88, 0.07, C.eisen, 0, 0.62, 0, 14),
        cone(0.92, 0.45, C.holzDunkel, 0, 0.95, 0, 8),
        box(0.14, 0.4, 0.14, C.stein, 0.95, 0, 0.3),
        box(0.5, 0.08, 0.08, C.eisen, 0.75, 0.4, 0.3),
      ]);
    case 'wasserrad': {
      const wheel = colored(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 12), C.holz);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(0.32, 0.42, 0);
      const hub = colored(new THREE.CylinderGeometry(0.12, 0.12, 0.24, 8), C.holzDunkel);
      hub.rotateZ(Math.PI / 2);
      hub.translate(0.32, 0.42, 0);
      const parts: THREE.BufferGeometry[] = [wheel, hub];
      for (let k = 0; k < 6; k++) {
        const paddle = colored(new THREE.BoxGeometry(0.18, 0.1, 0.9), C.holzHell);
        paddle.rotateX((k * Math.PI) / 6);
        paddle.translate(0.32, 0.42, 0);
        parts.push(paddle);
      }
      parts.push(box(0.5, 0.36, 0.5, C.stein, -0.18, 0, 0));
      parts.push(cone(0.38, 0.26, C.holzDunkel, -0.18, 0.36, 0, 4, Math.PI / 4));
      parts.push(box(0.06, 0.5, 0.06, C.holzDunkel, 0.32, 0, 0.3));
      parts.push(box(0.06, 0.5, 0.06, C.holzDunkel, 0.32, 0, -0.3));
      return merge(parts);
    }
    case 'laufrad': {
      const wheel = colored(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), C.holzHell);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(0, 0.46, 0);
      const inner = colored(new THREE.CylinderGeometry(0.34, 0.34, 0.32, 12), C.holzDunkel);
      inner.rotateZ(Math.PI / 2);
      inner.translate(0, 0.46, 0);
      return merge([
        wheel,
        inner,
        box(0.08, 0.5, 0.08, C.holzDunkel, -0.22, 0, 0.3),
        box(0.08, 0.5, 0.08, C.holzDunkel, 0.22, 0, 0.3),
        box(0.08, 0.5, 0.08, C.holzDunkel, -0.22, 0, -0.3),
        box(0.08, 0.5, 0.08, C.holzDunkel, 0.22, 0, -0.3),
        box(0.6, 0.06, 0.06, C.holzDunkel, 0, 0.5, 0.3),
        box(0.6, 0.06, 0.06, C.holzDunkel, 0, 0.5, -0.3),
        box(0.2, 0.2, 0.3, C.eisen, 0.35, 0, 0),
      ]);
    }
    case 'pumpwerk': {
      const fly = colored(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), C.eisen);
      fly.rotateZ(Math.PI / 2);
      fly.translate(0.36, 0.5, -0.1);
      return merge([
        box(0.64, 0.5, 0.6, C.stein, -0.08, 0, 0),
        box(0.7, 0.08, 0.66, C.holzDunkel, -0.08, 0.5, 0),
        cylinder(0.08, 0.5, C.steinDunkel, -0.25, 0.58, -0.15, 8), // Schlot
        fly,
        box(0.12, 0.1, 0.56, C.eisen, 0.2, 0.3, 0.3), // Rohr zum Wasser
        box(0.3, 0.04, 0.5, C.wasser, 0.2, 0.09, 0.42),
      ]);
    }
    case 'sandfilter':
      return merge([
        box(0.7, 0.2, 0.7, C.stein, 0, 0, 0),
        box(0.6, 0.18, 0.6, C.stroh, 0, 0.2, 0),
        box(0.6, 0.12, 0.6, C.steinDunkel, 0, 0.38, 0),
        box(0.6, 0.08, 0.6, C.wasser, 0, 0.5, 0),
        box(0.66, 0.04, 0.66, C.holzDunkel, 0, 0.58, 0),
        box(0.08, 0.3, 0.4, C.eisen, 0.36, 0.3, 0.1),
      ]);
    case 'pfahlhaus': {
      // Hütte auf hohen Pfählen mit Leiter
      const h = hut(0.85, C.holzHell, C.laubDunkel);
      for (const g of h) g.translate(0, 0.55, 0);
      return merge([
        ...h,
        ...posts(0.6, 0.55, C.holzDunkel, 0, 0.08),
        box(0.8, 0.06, 0.8, C.holz, 0, 0.5, 0),
        box(0.04, 0.5, 0.04, C.holz, -0.1, 0.02, 0.44),
        box(0.04, 0.5, 0.04, C.holz, 0.1, 0.02, 0.44),
        box(0.2, 0.03, 0.03, C.holzHell, 0, 0.14, 0.44),
        box(0.2, 0.03, 0.03, C.holzHell, 0, 0.28, 0.44),
        box(0.2, 0.03, 0.03, C.holzHell, 0, 0.42, 0.44),
      ]);
    }
    case 'langhaus':
      return merge([
        box(1.7, 0.6, 1.0, C.holzHell, 0, 0, 0),
        gable(1.15, 0.5, 1.8, C.stroh, 0, 0.6, 0, Math.PI / 2),
        box(0.2, 0.3, 0.04, C.holzDunkel, -0.45, 0, 0.51),
        box(0.2, 0.3, 0.04, C.holzDunkel, 0.45, 0, 0.51),
        box(0.16, 0.14, 0.04, C.wasser, 0, 0.3, 0.51),
        box(0.16, 0.14, 0.04, C.wasser, -0.3, 0.3, -0.51),
        box(0.16, 0.14, 0.04, C.wasser, 0.3, 0.3, -0.51),
      ]);
    case 'bibliothek':
      return merge([
        ...hut(0.9, C.holzHell, C.wasser),
        // aufgeschlagenes Buch vor der Tür
        box(0.22, 0.03, 0.16, C.stroh, -0.28, 0.08, 0.36),
        box(0.22, 0.03, 0.16, C.stroh, -0.06, 0.08, 0.36),
        box(0.46, 0.08, 0.2, C.holzDunkel, -0.17, 0, 0.36),
        cylinder(0.04, 0.3, C.stroh, 0.32, 0, 0.36, 6),
      ]);
    case 'schule':
      return merge([
        box(0.9, 0.55, 0.72, C.holzHell, 0, 0, 0),
        gable(0.8, 0.4, 0.98, C.beere, 0, 0.55, 0),
        box(0.16, 0.28, 0.04, C.holzDunkel, 0, 0, 0.37),
        box(0.14, 0.14, 0.04, C.wasser, -0.3, 0.25, 0.37),
        box(0.14, 0.14, 0.04, C.wasser, 0.3, 0.25, 0.37),
        // Glockenturm
        box(0.16, 0.3, 0.16, C.holzDunkel, 0.25, 0.85, 0),
        cone(0.14, 0.14, C.beere, 0.25, 1.15, 0, 4, Math.PI / 4),
        ball(0.05, C.stroh, 0.25, 1.0, 0.09),
      ]);
    case 'sternwarte': {
      const scope = colored(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 6), C.eisen);
      scope.rotateX(-0.9);
      scope.translate(0, 1.05, 0.12);
      return merge([
        cylinder(0.36, 0.8, C.stein, 0, 0, 0, 10),
        cylinder(0.38, 0.05, C.steinDunkel, 0, 0.8, 0, 10),
        ball(0.32, C.wasser, 0, 0.9, 0, 1),
        scope,
        box(0.14, 0.24, 0.04, C.holzDunkel, 0, 0, 0.36),
      ]);
    }
    case 'saegewerk': {
      const blade = colored(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), C.eisen);
      blade.rotateZ(Math.PI / 2);
      blade.translate(0.05, 0.42, 0);
      const log = colored(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), C.holz);
      log.rotateZ(Math.PI / 2);
      log.translate(0.05, 0.36, 0);
      return merge([
        box(0.9, 0.06, 0.9, C.holzDunkel, 0, 0, 0),
        ...posts(0.8, 0.75, C.holzDunkel, 0.06),
        box(0.96, 0.05, 0.96, C.stroh, 0, 0.8, 0),
        box(0.8, 0.22, 0.3, C.holz, 0.05, 0.06, 0),
        blade,
        log,
        box(0.16, 0.03, 0.4, C.holzHell, -0.3, 0.06, 0.3),
        box(0.16, 0.03, 0.4, C.holzHell, -0.3, 0.09, 0.3),
      ]);
    }
    case 'werkstatt':
      return merge([
        ...hut(0.9, C.holzDunkel, C.stein),
        // Amboss und Werkbank
        box(0.14, 0.1, 0.1, C.eisen, 0.3, 0.1, 0.38),
        box(0.08, 0.1, 0.08, C.steinDunkel, 0.3, 0, 0.38),
        box(0.3, 0.04, 0.14, C.holzHell, -0.26, 0.2, 0.4),
        box(0.03, 0.2, 0.03, C.holzDunkel, -0.36, 0, 0.44),
        box(0.03, 0.2, 0.03, C.holzDunkel, -0.16, 0, 0.44),
        box(0.08, 0.04, 0.03, C.eisen, -0.26, 0.24, 0.4),
      ]);
    case 'kraeutergarten': {
      const parts: THREE.BufferGeometry[] = [box(0.84, 0.1, 0.84, C.erde, 0, 0, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.05, 0.3, 0.05, C.holzHell, sx * 0.44, 0, sz * 0.44));
      for (const sx of [-1, 1]) parts.push(box(0.05, 0.04, 0.9, C.holzHell, sx * 0.44, 0.22, 0));
      for (const sz of [-1, 1]) parts.push(box(0.9, 0.04, 0.05, C.holzHell, 0, 0.22, sz * 0.44));
      for (let k = 0; k < 9; k++) {
        const x = ((k % 3) - 1) * 0.26;
        const z = (Math.floor(k / 3) - 1) * 0.26;
        parts.push(ball(0.08, k % 2 ? C.laub : C.busch, x, 0.16, z));
      }
      return merge(parts);
    }
    case 'fischer': {
      const rod = colored(new THREE.CylinderGeometry(0.015, 0.02, 0.7, 5), C.holzDunkel);
      rod.rotateZ(-0.7);
      rod.translate(0.42, 0.55, 0.1);
      const fish = colored(new THREE.IcosahedronGeometry(0.06, 0), C.fisch);
      fish.scale(1, 0.7, 1.8);
      fish.translate(0.62, 0.3, 0.1);
      return merge([
        ...posts(0.6, 0.3, C.holzDunkel, 0, 0.07),
        box(0.84, 0.06, 0.84, C.holz, 0, 0.28, 0),
        box(0.6, 0.42, 0.6, C.holzHell, -0.08, 0.34, 0),
        cone(0.5, 0.3, C.laubDunkel, -0.08, 0.76, 0, 4, Math.PI / 4),
        rod,
        fish,
        cylinder(0.1, 0.1, C.holzHell, 0.3, 0.34, -0.3, 6),
      ]);
    }
    case 'fischteich': {
      const parts: THREE.BufferGeometry[] = [
        box(1.9, 0.14, 1.9, C.erde, 0, 0, 0),
        box(1.6, 0.04, 1.6, C.wasser, 0, 0.14, 0),
        box(0.5, 0.05, 0.2, C.holzHell, -0.5, 0.17, 0.75),
      ];
      for (const [x, z] of [
        [0.7, 0.6],
        [0.78, 0.4],
        [-0.72, -0.6],
        [-0.6, -0.72],
        [0.6, -0.7],
      ]) {
        parts.push(cylinder(0.025, 0.4, C.laubDunkel, x, 0.1, z, 4));
        parts.push(ball(0.04, C.holzDunkel, x, 0.5, z));
      }
      const fish = colored(new THREE.IcosahedronGeometry(0.06, 0), C.fisch);
      fish.scale(1, 0.5, 1.8);
      fish.translate(0.2, 0.17, -0.1);
      parts.push(fish);
      return merge(parts);
    }
    case 'beerengaertner':
      return merge([
        ...hut(0.8, C.holz, C.busch),
        ball(0.14, C.busch, 0.36, 0.12, 0.34),
        ball(0.04, C.beere, 0.42, 0.22, 0.4),
        ball(0.04, C.beere, 0.3, 0.2, 0.42),
        ball(0.12, C.busch, -0.36, 0.1, 0.36),
        ball(0.04, C.beere, -0.36, 0.2, 0.44),
        cylinder(0.1, 0.12, C.holzHell, 0.36, 0, -0.36, 6, 0.12),
      ]);
    case 'feld': {
      const parts: THREE.BufferGeometry[] = [box(1.9, 0.08, 1.9, C.erde, 0, 0, 0)];
      for (let r = 0; r < 4; r++) {
        const z = (r - 1.5) * 0.42;
        parts.push(box(1.7, 0.06, 0.18, C.holzDunkel, 0, 0.08, z));
        for (let k = 0; k < 6; k++) parts.push(cone(0.07, 0.24, C.stroh, (k - 2.5) * 0.3, 0.14, z, 4));
      }
      // Vogelscheuche
      parts.push(box(0.05, 0.7, 0.05, C.holzDunkel, 0.8, 0.08, 0.8));
      parts.push(box(0.4, 0.05, 0.05, C.holzDunkel, 0.8, 0.55, 0.8));
      parts.push(ball(0.08, C.stroh, 0.8, 0.82, 0.8));
      return merge(parts);
    }
    case 'baeckerei':
      return merge([
        ...hut(0.9, C.stroh, C.holzDunkel),
        // Kuppelofen mit Schlot neben der Hütte
        ball(0.2, C.stein, 0.42, 0.12, 0.3, 1),
        box(0.14, 0.1, 0.04, C.otterNase, 0.42, 0.04, 0.5),
        cylinder(0.04, 0.3, C.steinDunkel, 0.42, 0.28, 0.3, 6),
        ball(0.07, C.rauch, 0.42, 0.66, 0.3),
        ball(0.05, C.rauch, 0.48, 0.78, 0.26),
      ]);
    case 'lagerfeuer': {
      const parts: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        parts.push(ball(0.07, C.stein, Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3));
      }
      for (let k = 0; k < 3; k++) {
        const l = colored(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 5), C.holzDunkel);
        l.rotateZ(Math.PI / 2);
        l.rotateY((k * Math.PI) / 3);
        l.translate(0, 0.06, 0);
        parts.push(l);
      }
      parts.push(cone(0.14, 0.34, C.feuer, 0, 0.08, 0, 5));
      parts.push(cone(0.08, 0.22, C.flamme, 0.02, 0.14, 0.02, 5));
      // Sitzstämme
      for (const [x, z, ry] of [
        [0.55, 0.1, 0],
        [-0.5, 0.25, 0.6],
        [0.05, -0.55, 1.5],
      ]) {
        const seat = colored(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), C.holz);
        seat.rotateZ(Math.PI / 2);
        seat.rotateY(ry);
        seat.translate(x, 0.06, z);
        parts.push(seat);
      }
      return merge(parts);
    }
    case 'beerenschenke':
      return merge([
        ...hut(0.9, C.holz, C.beere),
        // Tresen und Fass davor, Schild über der Tür
        box(0.5, 0.26, 0.12, C.holzHell, -0.12, 0, 0.5),
        cylinder(0.11, 0.24, C.holzDunkel, 0.36, 0, 0.42, 8),
        cylinder(0.12, 0.03, C.eisen, 0.36, 0.1, 0.42, 8),
        box(0.3, 0.14, 0.03, C.stroh, 0, 0.5, 0.38),
        ball(0.04, C.beere, -0.06, 0.57, 0.4),
        ball(0.04, C.beere, 0.06, 0.57, 0.4),
      ]);
    case 'statue':
      return merge([
        box(0.6, 0.3, 0.6, C.stein, 0, 0, 0),
        box(0.5, 0.06, 0.5, C.steinDunkel, 0, 0.3, 0),
        // stehender Otter aus hellem Holz
        box(0.24, 0.5, 0.2, C.holzHell, 0, 0.36, 0),
        box(0.22, 0.2, 0.2, C.holzHell, 0, 0.86, 0.02),
        box(0.1, 0.06, 0.06, C.holzHell, 0, 0.9, 0.14),
        box(0.06, 0.06, 0.04, C.holzHell, -0.08, 1.04, 0),
        box(0.06, 0.06, 0.04, C.holzHell, 0.08, 1.04, 0),
        box(0.08, 0.3, 0.08, C.holzHell, 0.18, 0.5, 0),
        box(0.08, 0.3, 0.08, C.holzHell, -0.18, 0.5, 0),
        box(0.08, 0.08, 0.3, C.holzHell, 0, 0.36, -0.24),
      ]);
    case 'spielplatz': {
      const slide = colored(new THREE.BoxGeometry(0.2, 0.03, 0.6), C.wasser);
      slide.rotateX(0.6);
      slide.translate(-0.25, 0.3, 0.1);
      const seesaw = colored(new THREE.BoxGeometry(0.7, 0.04, 0.12), C.holzHell);
      seesaw.rotateZ(0.25);
      seesaw.translate(0.22, 0.2, -0.3);
      return merge([
        box(0.9, 0.05, 0.9, C.stroh, 0, 0, 0),
        slide,
        box(0.04, 0.5, 0.04, C.holzDunkel, -0.33, 0.05, -0.18),
        box(0.04, 0.5, 0.04, C.holzDunkel, -0.17, 0.05, -0.18),
        box(0.2, 0.03, 0.03, C.holzHell, -0.25, 0.2, -0.18),
        box(0.2, 0.03, 0.03, C.holzHell, -0.25, 0.35, -0.18),
        box(0.2, 0.04, 0.2, C.wasser, -0.25, 0.5, -0.18),
        box(0.06, 0.16, 0.06, C.holzDunkel, 0.22, 0.05, -0.3),
        seesaw,
        ball(0.09, C.beere, 0.3, 0.14, 0.3),
      ]);
    }
    case 'aussichtsturm':
      return merge([
        ...posts(0.6, 1.5, C.holzDunkel, 0, 0.07),
        box(0.66, 0.04, 0.04, C.holz, 0, 0.5, 0.3),
        box(0.66, 0.04, 0.04, C.holz, 0, 0.5, -0.3),
        box(0.04, 0.04, 0.66, C.holz, 0.3, 0.5, 0),
        box(0.04, 0.04, 0.66, C.holz, -0.3, 0.5, 0),
        box(0.66, 0.04, 0.04, C.holz, 0, 1.0, 0.3),
        box(0.66, 0.04, 0.04, C.holz, 0, 1.0, -0.3),
        box(0.84, 0.06, 0.84, C.holzHell, 0, 1.5, 0),
        box(0.84, 0.04, 0.04, C.holz, 0, 1.8, 0.4),
        box(0.84, 0.04, 0.04, C.holz, 0, 1.8, -0.4),
        box(0.04, 0.04, 0.84, C.holz, 0.4, 1.8, 0),
        box(0.04, 0.04, 0.84, C.holz, -0.4, 1.8, 0),
        ...posts(0.8, 0.3, C.holz, 1.56, 0.04),
        cone(0.62, 0.32, C.laubDunkel, 0, 1.88, 0, 4, Math.PI / 4),
        box(0.04, 0.4, 0.04, C.holzDunkel, 0, 2.2, 0),
        box(0.22, 0.12, 0.02, C.beere, 0.12, 2.46, 0),
      ]);
    case 'lagerhaus': {
      const parts: THREE.BufferGeometry[] = [
        box(1.8, 0.1, 1.8, C.holzDunkel, 0, 0, 0),
        box(1.7, 0.85, 1.4, C.holz, 0, 0.1, 0),
        gable(1.6, 0.55, 1.86, C.stroh, 0, 0.95, 0, Math.PI / 2),
        box(1.76, 0.06, 0.06, C.holzDunkel, 0, 0.92, 0.72),
        box(1.76, 0.06, 0.06, C.holzDunkel, 0, 0.92, -0.72),
        // großes Tor und ein Schild
        box(0.6, 0.6, 0.04, C.holzDunkel, 0, 0.1, 0.71),
        box(0.03, 0.6, 0.05, C.holzHell, 0, 0.1, 0.72),
        box(0.36, 0.16, 0.03, C.holzHell, 0, 0.74, 0.72),
      ];
      // Fässer und Kisten vor der Tür
      parts.push(cylinder(0.14, 0.26, C.holzHell, -0.7, 0.1, 0.78, 7, 0.16));
      parts.push(cylinder(0.14, 0.26, C.holzHell, 0.72, 0.1, 0.8, 7, 0.16));
      parts.push(box(0.26, 0.26, 0.26, C.holzHell, 0.72, 0.36, 0.8));
      parts.push(cylinder(0.1, 0.06, C.beere, -0.7, 0.36, 0.78, 7));
      return merge(parts);
    }
    case 'flossanleger': {
      const parts: THREE.BufferGeometry[] = [box(0.92, 0.06, 0.92, C.holzHell, 0, 0.3, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cylinder(0.05, 0.32, C.holzDunkel, sx * 0.38, 0, sz * 0.38, 6));
      // Ladekran: zwei schräge Stämme, Querbalken, Seil mit Kiste
      const l1 = box(0.06, 1.0, 0.06, C.holzDunkel, 0, 0, 0);
      l1.rotateZ(0.35);
      l1.translate(-0.28, 0.36, -0.25);
      const l2 = box(0.06, 1.0, 0.06, C.holzDunkel, 0, 0, 0);
      l2.rotateZ(-0.35);
      l2.translate(0.28, 0.36, -0.25);
      parts.push(l1, l2);
      parts.push(box(0.1, 0.06, 0.7, C.holzDunkel, 0, 1.28, 0));
      parts.push(cylinder(0.012, 0.5, C.stroh, 0, 0.8, 0.22, 4));
      parts.push(box(0.22, 0.2, 0.22, C.holzHell, 0, 0.6, 0.22));
      // Poller und ein Seilring
      parts.push(cylinder(0.05, 0.22, C.holzDunkel, 0.36, 0.36, 0.36, 6));
      parts.push(cylinder(0.09, 0.04, C.stroh, -0.3, 0.36, 0.3, 8));
      return merge(parts);
    }
    case 'steg': {
      // steht auf dem Flussgrund, das Deck liegt über dem Wasser
      const parts: THREE.BufferGeometry[] = [box(0.96, 0.06, 0.96, C.holzHell, 0, 0.6, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cylinder(0.05, 0.62, C.holzDunkel, sx * 0.4, 0, sz * 0.4, 6));
      for (const z of [-0.3, 0, 0.3]) parts.push(box(0.96, 0.02, 0.03, C.holz, 0, 0.66, z));
      parts.push(cylinder(0.04, 0.22, C.holzDunkel, 0.42, 0.66, -0.42, 6));
      return merge(parts);
    }
  }
}

/** Floß aus Stämmen mit Querbalken und Staken */
export function raftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const g = colored(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), k % 2 ? C.holz : C.holzHell);
    g.rotateX(Math.PI / 2);
    g.translate(-0.4 + k * 0.16, 0.08, 0);
    parts.push(g);
  }
  parts.push(box(0.95, 0.05, 0.08, C.holzDunkel, 0, 0.16, 0.3));
  parts.push(box(0.95, 0.05, 0.08, C.holzDunkel, 0, 0.16, -0.3));
  const pole = colored(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), C.holzDunkel);
  pole.rotateZ(0.3);
  pole.translate(0.38, 0.55, -0.32);
  parts.push(pole);
  return merge(parts);
}

/** Ladung auf dem Floß, größer als auf dem Rücken eines Otters */
export function raftCargoGeometry(code: number): THREE.BufferGeometry {
  const g = carryGeometry(code);
  g.translate(0, -0.12, 0);
  g.scale(1.5, 1.5, 1.5);
  g.computeBoundingSphere();
  return g;
}

export const BUILDING_IDS: BuildingId[] = Object.keys(BUILDINGS) as BuildingId[];
