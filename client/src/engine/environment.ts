// Sky, lighting, day/night cycle, water, and fog (ARCH §5, roadmap "Environment v1").
// Day/night is a client-visual cycle (allowed to use render dt — not simulation time).

import * as THREE from 'three';
import { SEA_LEVEL } from '@pathlands/shared';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = pos.xyww; // force to far plane
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.8));
    float sun = pow(max(dot(dir, normalize(uSunDir)), 0.0), 220.0);
    float glow = pow(max(dot(dir, normalize(uSunDir)), 0.0), 6.0) * 0.15;
    col += uSunColor * (sun * 1.4 + glow);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const lerpColor = (a: THREE.Color, b: THREE.Color, t: number): THREE.Color => a.clone().lerp(b, t);

// Palette stops for the cycle.
const C = {
  dayTop: new THREE.Color(0x4a86c8),
  dayHorizon: new THREE.Color(0xbcd8ee),
  nightTop: new THREE.Color(0x070b1c),
  nightHorizon: new THREE.Color(0x18213f),
  duskHorizon: new THREE.Color(0xe28a52),
  sunDay: new THREE.Color(0xfff2d6),
  sunDusk: new THREE.Color(0xff9a4a),
  moon: new THREE.Color(0x9fb4e0),
};

export class Environment {
  private readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly skyMesh: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly fog: THREE.Fog;
  /** 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk. */
  time = 0.36;
  /** Cycle speed in day-fractions per second (0 pauses). Default: ~8-min day. */
  speed = 1 / 480;

  constructor(scene: THREE.Scene, viewDistanceChunks: number) {
    this.scene = scene;

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: C.dayTop.clone() },
        uHorizon: { value: C.dayHorizon.clone() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: C.sunDay.clone() },
      },
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), this.skyMat);
    this.skyMesh.frustumCulled = false;
    scene.add(this.skyMesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd8ee, 0x5a6a48, 0.55);
    scene.add(this.hemi);

    const waterSize = viewDistanceChunks * 32 * 2.2;
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(waterSize, waterSize),
      new THREE.MeshLambertMaterial({
        color: 0x2f6fb0,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = SEA_LEVEL + 0.35;
    this.water.frustumCulled = false;
    scene.add(this.water);

    const far = viewDistanceChunks * 32;
    this.fog = new THREE.Fog(C.dayHorizon.getHex(), far * 0.55, far * 0.98);
    scene.fog = this.fog;

    this.applyTime();
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.time = (this.time + this.speed * dt) % 1;
    this.applyTime();
    // Sky and water follow the camera so they always fill the view.
    this.skyMesh.position.copy(cameraPos);
    this.water.position.x = cameraPos.x;
    this.water.position.z = cameraPos.z;
  }

  setViewDistance(chunks: number): void {
    const far = chunks * 32;
    this.fog.near = far * 0.55;
    this.fog.far = far * 0.98;
  }

  private applyTime(): void {
    // Sun travels a circle; elevation drives day/night blending.
    const angle = this.time * Math.PI * 2 - Math.PI / 2;
    const dir = new THREE.Vector3(
      Math.cos(angle) * 0.6,
      Math.sin(angle),
      Math.sin(angle * 0.5) * 0.3,
    );
    dir.normalize();
    const elevation = dir.y;

    const dayF = THREE.MathUtils.clamp((elevation + 0.15) / 0.5, 0, 1);
    const duskF =
      THREE.MathUtils.clamp(1 - Math.abs(elevation) / 0.28, 0, 1) * (elevation > -0.3 ? 1 : 0);

    const top = lerpColor(C.nightTop, C.dayTop, dayF);
    let horizon = lerpColor(C.nightHorizon, C.dayHorizon, dayF);
    horizon = lerpColor(horizon, C.duskHorizon, duskF * 0.7);
    const sunColor = lerpColor(C.sunDusk, C.sunDay, dayF);

    (this.skyMat.uniforms.uTop!.value as THREE.Color).copy(top);
    (this.skyMat.uniforms.uHorizon!.value as THREE.Color).copy(horizon);
    (this.skyMat.uniforms.uSunColor!.value as THREE.Color).copy(sunColor);
    (this.skyMat.uniforms.uSunDir!.value as THREE.Vector3).copy(dir);

    // Directional sun (or faint moon when below the horizon).
    this.sun.position.copy(dir).multiplyScalar(300);
    if (elevation > 0) {
      this.sun.color.copy(sunColor);
      this.sun.intensity = 0.35 + dayF * 0.95;
    } else {
      this.sun.color.copy(C.moon);
      this.sun.intensity = 0.15;
      this.sun.position.set(-dir.x * 300, Math.max(30, -dir.y * 300), -dir.z * 300);
    }

    this.hemi.color.copy(horizon);
    this.hemi.intensity = 0.25 + dayF * 0.4;

    this.fog.color.copy(horizon);
    this.scene.background = horizon.clone();
  }

  dispose(): void {
    this.skyMesh.geometry.dispose();
    this.skyMat.dispose();
    this.water.geometry.dispose();
    (this.water.material as THREE.Material).dispose();
  }
}
