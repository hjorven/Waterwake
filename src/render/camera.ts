import * as THREE from 'three';

/**
 * Orbit-Kamera für Maus und Touch:
 * - Linke Maustaste auf Gelände: Werkzeug (wird von außen behandelt)
 * - Rechte Maustaste oder mittlere: drehen
 * - Shift + links oder Ziehen mit zwei Fingern: verschieben
 * - Rad oder Pinch: zoomen
 * - Ein Finger: Werkzeug, zwei Finger: drehen/zoomen/verschieben
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  yaw = Math.PI * 0.25;
  pitch = 0.9;
  distance = 70;
  minDistance = 12;
  maxDistance = 220;
  private readonly el: HTMLElement;
  private dragMode: 'none' | 'rotate' | 'pan' = 'none';
  private lastX = 0;
  private lastY = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private lastMid = { x: 0, y: 0 };
  private lastAngle = 0;
  private bounds = { w: 96, h: 96 };

  constructor(el: HTMLElement, aspect: number) {
    this.el = el;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 600);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    this.apply();
  }

  setBounds(w: number, h: number): void {
    this.bounds = { w, h };
    this.target.set(w / 2, 4, h / 2);
    this.distance = Math.max(w, h) * 0.9;
    this.apply();
  }

  /** true, wenn gerade die Kamera bewegt wird (dann kein Werkzeug) */
  get busy(): boolean {
    return this.dragMode !== 'none' || this.touches.size >= 2;
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        this.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
      }
      return;
    }
    if (e.button === 2 || e.button === 1) {
      this.dragMode = 'rotate';
    } else if (e.button === 0 && (e.shiftKey || e.ctrlKey)) {
      this.dragMode = 'pan';
    } else {
      return;
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (!this.touches.has(e.pointerId)) return;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const pinch = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (this.lastPinch > 0) this.zoomBy(this.lastPinch / pinch);
        this.pan(mid.x - this.lastMid.x, mid.y - this.lastMid.y);
        let da = angle - this.lastAngle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.yaw -= da;
        this.lastPinch = pinch;
        this.lastMid = mid;
        this.lastAngle = angle;
        this.apply();
      }
      return;
    }
    if (this.dragMode === 'none') return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.dragMode === 'rotate') {
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(0.25, Math.min(1.45, this.pitch + dy * 0.005));
    } else {
      this.pan(dx, dy);
    }
    this.apply();
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      this.lastPinch = 0;
      return;
    }
    this.dragMode = 'none';
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0012));
    this.apply();
  };

  private onKey = (e: KeyboardEvent) => {
    const step = this.distance * 0.08;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    switch (e.key) {
      case 'w': case 'ArrowUp': this.target.addScaledVector(fwd, step); break;
      case 's': case 'ArrowDown': this.target.addScaledVector(fwd, -step); break;
      case 'a': case 'ArrowLeft': this.target.addScaledVector(right, -step); break;
      case 'd': case 'ArrowRight': this.target.addScaledVector(right, step); break;
      case 'q': this.yaw += 0.1; break;
      case 'e': this.yaw -= 0.1; break;
      default: return;
    }
    this.apply();
  };

  private zoomBy(f: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * f));
  }

  private pan(dx: number, dy: number): void {
    const k = this.distance * 0.0016;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.target.addScaledVector(right, -dx * k);
    this.target.addScaledVector(fwd, dy * k);
  }

  apply(): void {
    this.target.x = Math.max(-5, Math.min(this.bounds.w + 5, this.target.x));
    this.target.z = Math.max(-5, Math.min(this.bounds.h + 5, this.target.z));
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + sp * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    this.camera.lookAt(this.target);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
