import { useEffect, useRef } from 'react';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import '@babylonjs/core/Culling/ray';
import { Engine } from '@babylonjs/core/Engines/engine';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import type { GridNode, Unit } from '../module_bindings/types';

const FACTION_COLORS: Record<string, string> = {
  HELIX: '#65aeb8',
  NOVA: '#c76c73',
  VOID: '#d3aa55',
  NEUTRAL: '#969883',
};

const RESOURCE_COLORS: Record<string, string> = {
  ENERGY: '#f0c968',
  MATTER: '#789cc5',
  DATA: '#77ae82',
};

type UnitAvatar = {
  root: TransformNode;
  rig: TransformNode;
  head: TransformNode;
  leftArm: TransformNode;
  rightArm: TransformNode;
  leftLeg: TransformNode;
  rightLeg: TransformNode;
  ring?: TransformNode;
  own: boolean;
  target: Vector3;
  lastGridPosition: string;
  arrivalPending: boolean;
  jumpProgress: number;
  phase: number;
  blinkTimer: number;
};

type TheaterRuntime = {
  engine: Engine;
  scene: Scene;
  tiles: Map<number, Mesh>;
  tileMaterials: Map<number, PBRMaterial>;
  unitAvatars: Map<string, UnitAvatar>;
  disposed: boolean;
};

function color(hex: string): Color3 {
  return Color3.FromHexString(hex);
}

function worldPosition(x: number, y: number): Vector3 {
  return new Vector3((x - 5.5) * 1.08, 0, (y - 3.5) * 1.08);
}

function unitPosition(unit: Unit, node: GridNode | undefined, own: boolean): Vector3 {
  const position = worldPosition(unit.x, unit.y);
  const angle = Number(unit.id % 8n) * (Math.PI / 4);
  const spread = own ? 0 : 0.13 + Number(unit.id % 3n) * 0.03;
  position.x += Math.cos(angle) * spread;
  position.z += Math.sin(angle) * spread;
  position.y = (node ? sectorHeight(node) : 0.25) + 0.1;
  return position;
}

function sectorHeight(node: GridNode): number {
  return 0.18 + node.yieldRate * 0.025 + (node.controller !== 'NEUTRAL' ? 0.07 : 0);
}

function pbr(
  scene: Scene,
  name: string,
  albedo: string,
  metallic = 0.25,
  roughness = 0.72,
  emissive?: string,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color(albedo);
  material.metallic = metallic;
  material.roughness = roughness;
  if (emissive) material.emissiveColor = color(emissive);
  return material;
}

function standard(scene: Scene, name: string, diffuse: string, emissive?: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color(diffuse);
  material.specularColor = new Color3(0.16, 0.16, 0.13);
  if (emissive) material.emissiveColor = color(emissive);
  return material;
}

function addPickMetadata(mesh: AbstractMesh, nodeId: number) {
  mesh.metadata = { ...(mesh.metadata ?? {}), nodeId };
  mesh.isPickable = true;
}

function buildCrenellations(
  scene: Scene,
  parent: TransformNode,
  start: Vector3,
  count: number,
  axis: 'x' | 'z',
  material: PBRMaterial,
) {
  for (let index = 0; index < count; index += 1) {
    const merlon = MeshBuilder.CreateBox(`merlon-${parent.name}-${index}`, {
      width: axis === 'x' ? 0.7 : 0.85,
      height: 0.48,
      depth: axis === 'z' ? 0.7 : 0.85,
    }, scene);
    merlon.position = start.clone();
    if (axis === 'x') merlon.position.x += index * 1.35;
    else merlon.position.z += index * 1.35;
    merlon.material = material;
    merlon.parent = parent;
  }
}

function buildCastleEnvironment(scene: Scene, shadowGenerator: ShadowGenerator) {
  // Cozy dusk-purple night to match the rest of the indie theme.
  scene.clearColor = new Color4(0.067, 0.043, 0.11, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0052;
  scene.fogColor = color('#241838');
  scene.imageProcessingConfiguration.contrast = 1.22;
  scene.imageProcessingConfiguration.exposure = 0.92;

  const sky = MeshBuilder.CreateSphere('day-sky', { diameter: 90, segments: 20, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMaterial = standard(scene, 'day-sky-material', '#2a1f44');
  skyMaterial.disableLighting = true;
  sky.material = skyMaterial;
  sky.isPickable = false;

  const courtyard = MeshBuilder.CreateGround('castle-courtyard', { width: 54, height: 44, subdivisions: 2 }, scene);
  courtyard.position.y = -0.82;
  courtyard.material = pbr(scene, 'courtyard-stone', '#ab9b7f', 0.02, 0.96);
  courtyard.receiveShadows = true;

  const pathMaterial = pbr(scene, 'path-stone', '#c8b993', 0.01, 0.94);
  for (let index = -8; index <= 8; index += 1) {
    const slab = MeshBuilder.CreateBox(`courtyard-slab-${index}`, { width: 2.1, height: 0.035, depth: 3.2 }, scene);
    slab.position = new Vector3(index * 2.2, -0.79, 10.5);
    slab.rotation.y = (index % 2) * 0.025;
    slab.material = pathMaterial;
    slab.receiveShadows = true;
  }

  const wallMaterial = pbr(scene, 'castle-wall-stone', '#b9a780', 0.04, 0.9);
  const wallRoot = new TransformNode('castle-walls', scene);
  const backWall = MeshBuilder.CreateBox('back-wall', { width: 34, height: 4.5, depth: 1.25 }, scene);
  backWall.position = new Vector3(0, 1.25, -13);
  backWall.material = wallMaterial;
  backWall.parent = wallRoot;
  backWall.receiveShadows = true;
  shadowGenerator.addShadowCaster(backWall);
  buildCrenellations(scene, wallRoot, new Vector3(-15.5, 3.72, -13), 24, 'x', wallMaterial);

  for (const side of [-1, 1]) {
    const sideWall = MeshBuilder.CreateBox(`side-wall-${side}`, { width: 1.15, height: 3.3, depth: 19 }, scene);
    sideWall.position = new Vector3(side * 16.8, 0.65, -3.8);
    sideWall.material = wallMaterial;
    sideWall.parent = wallRoot;
    sideWall.receiveShadows = true;
    shadowGenerator.addShadowCaster(sideWall);
    buildCrenellations(scene, wallRoot, new Vector3(side * 16.8, 2.55, -12), 13, 'z', wallMaterial);
  }

  const towerRoofMaterial = pbr(scene, 'tower-roof', '#5d6471', 0.12, 0.76);
  for (const [x, z] of [[-16.8, -13], [16.8, -13], [-16.8, 5.4], [16.8, 5.4]] as const) {
    const tower = MeshBuilder.CreateCylinder(`castle-tower-${x}-${z}`, {
      diameter: 3.4,
      height: 5.5,
      tessellation: 10,
    }, scene);
    tower.position = new Vector3(x, 1.65, z);
    tower.material = wallMaterial;
    tower.receiveShadows = true;
    shadowGenerator.addShadowCaster(tower);

    const roof = MeshBuilder.CreateCylinder(`tower-roof-${x}-${z}`, {
      diameterTop: 0.2,
      diameterBottom: 4.2,
      height: 2.2,
      tessellation: 10,
    }, scene);
    roof.position = new Vector3(x, 5.45, z);
    roof.material = towerRoofMaterial;
    shadowGenerator.addShadowCaster(roof);
  }

  const gate = MeshBuilder.CreateBox('castle-gate-frame', { width: 7, height: 5, depth: 1.5 }, scene);
  gate.position = new Vector3(0, 1.5, -12.25);
  gate.material = pbr(scene, 'gate-iron', '#5b5141', 0.58, 0.48);
  shadowGenerator.addShadowCaster(gate);

  const gateOpening = MeshBuilder.CreateBox('castle-gate-opening', { width: 4.4, height: 3.6, depth: 1.7 }, scene);
  gateOpening.position = new Vector3(0, 0.8, -11.9);
  gateOpening.material = standard(scene, 'gate-darkness', '#302c25');

  const bannerMaterial = standard(scene, 'banner-cloth', '#9a4349');
  const bannerGold = standard(scene, 'banner-gold', '#d0a84e');
  for (const x of [-10.5, -5.25, 5.25, 10.5]) {
    const banner = MeshBuilder.CreatePlane(`banner-${x}`, { width: 2.1, height: 3.2 }, scene);
    banner.position = new Vector3(x, 1.45, -12.32);
    banner.material = x < 0 ? bannerMaterial : bannerGold;
    banner.isPickable = false;
  }

  const tableBase = MeshBuilder.CreateBox('war-table-base', { width: 15.6, height: 0.72, depth: 11.2 }, scene);
  tableBase.position.y = -0.48;
  tableBase.material = pbr(scene, 'war-table-wood', '#76543a', 0.04, 0.78);
  tableBase.receiveShadows = true;
  shadowGenerator.addShadowCaster(tableBase);

  const tableRim = MeshBuilder.CreateBox('war-table-rim', { width: 14.8, height: 0.18, depth: 10.45 }, scene);
  tableRim.position.y = -0.06;
  tableRim.material = pbr(scene, 'war-table-brass', '#8f784c', 0.48, 0.46);
  tableRim.receiveShadows = true;

  const brazierMetal = pbr(scene, 'brazier-metal', '#514a3e', 0.58, 0.44);
  for (const [x, z] of [[-8.8, -5.7], [8.8, -5.7], [-8.8, 5.7], [8.8, 5.7]] as const) {
    const stand = MeshBuilder.CreateCylinder(`brazier-stand-${x}-${z}`, {
      diameterTop: 0.35,
      diameterBottom: 0.62,
      height: 1.6,
      tessellation: 8,
    }, scene);
    stand.position = new Vector3(x, 0.05, z);
    stand.material = brazierMetal;
    shadowGenerator.addShadowCaster(stand);

    const bowl = MeshBuilder.CreateCylinder(`brazier-bowl-${x}-${z}`, {
      diameterTop: 1,
      diameterBottom: 0.55,
      height: 0.35,
      tessellation: 8,
    }, scene);
    bowl.position = new Vector3(x, 0.95, z);
    bowl.material = brazierMetal;

    const flame = MeshBuilder.CreateSphere(`brazier-flame-${x}-${z}`, { diameter: 0.42, segments: 8 }, scene);
    flame.position = new Vector3(x, 1.25, z);
    flame.scaling.y = 1.65;
    const flameMaterial = standard(scene, `flame-material-${x}-${z}`, '#f0a33a', '#f0a33a');
    flameMaterial.disableLighting = true;
    flame.material = flameMaterial;

    const fireLight = new PointLight(`fire-light-${x}-${z}`, new Vector3(x, 1.45, z), scene);
    fireLight.diffuse = color('#f0a33a');
    fireLight.intensity = 1.2;
    fireLight.range = 8;
  }

  const mountainMaterial = pbr(scene, 'distant-mountains', '#728a76', 0, 1);
  for (let index = 0; index < 9; index += 1) {
    const mountain = MeshBuilder.CreateCylinder(`mountain-${index}`, {
      diameterTop: 0,
      diameterBottom: 9 + (index % 3) * 3,
      height: 8 + (index % 4) * 2,
      tessellation: 5,
    }, scene);
    mountain.position = new Vector3(-30 + index * 7.5, 1, -25 - (index % 2) * 3);
    mountain.material = mountainMaterial;
    mountain.isPickable = false;
  }

  const trunkMaterial = pbr(scene, 'courtyard-tree-trunks', '#76573e', 0, 1);
  const leafMaterials = [
    pbr(scene, 'courtyard-leaves-sage', '#6f8f69', 0, 1),
    pbr(scene, 'courtyard-leaves-pine', '#52735f', 0, 1),
  ];
  for (const [index, [x, z]] of [
    [-13.2, -8.2], [-12.7, 1.5], [13.1, -8], [13.4, 1.8],
    [-20, -2], [20, -1], [-10, -19], [10, -19],
  ].entries()) {
    const trunk = MeshBuilder.CreateCylinder(`tree-trunk-${index}`, {
      diameterTop: 0.26,
      diameterBottom: 0.4,
      height: 2.2,
      tessellation: 7,
    }, scene);
    trunk.position = new Vector3(x, 0.2, z);
    trunk.material = trunkMaterial;

    const crown = MeshBuilder.CreateCylinder(`tree-crown-${index}`, {
      diameterTop: 0.15,
      diameterBottom: 2.2 + (index % 2) * 0.45,
      height: 3.4,
      tessellation: 7,
    }, scene);
    crown.position = new Vector3(x, 2.65, z);
    crown.material = leafMaterials[index % leafMaterials.length];
    crown.rotation.y = index * 0.37;
    crown.isPickable = false;
  }
}

function buildResourceLandmark(scene: Scene, node: GridNode, parent: TransformNode, height: number) {
  if (node.yieldRate < 7) return;
  const resourceColor = RESOURCE_COLORS[node.resource] ?? '#ffffff';
  const stone = pbr(scene, `landmark-stone-${node.id}`, '#736c5e', 0.08, 0.82, resourceColor);
  stone.emissiveColor.scaleInPlace(0.08);
  const glow = standard(scene, `landmark-glow-${node.id}`, resourceColor, resourceColor);
  glow.disableLighting = true;

  const base = MeshBuilder.CreateCylinder(`landmark-base-${node.id}`, {
    diameterTop: 0.26,
    diameterBottom: 0.38,
    height: 0.12,
    tessellation: 8,
  }, scene);
  base.position = new Vector3(-0.27, height + 0.06, 0.23);
  base.material = stone;
  base.parent = parent;
  addPickMetadata(base, node.id);

  if (node.resource === 'ENERGY') {
    for (let index = 0; index < 3; index += 1) {
      const pylon = MeshBuilder.CreateCylinder(`energy-pylon-${node.id}-${index}`, {
        diameter: 0.045,
        height: 0.28 + index * 0.05,
        tessellation: 6,
      }, scene);
      pylon.position = new Vector3(-0.34 + index * 0.07, height + 0.22 + index * 0.025, 0.23);
      pylon.material = index === 1 ? glow : stone;
      pylon.parent = parent;
      addPickMetadata(pylon, node.id);
    }
  } else if (node.resource === 'MATTER') {
    const keep = MeshBuilder.CreateBox(`matter-keep-${node.id}`, { size: 0.25 }, scene);
    keep.position = new Vector3(-0.27, height + 0.22, 0.23);
    keep.rotation.y = Math.PI / 4;
    keep.material = stone;
    keep.parent = parent;
    addPickMetadata(keep, node.id);

    const crystal = MeshBuilder.CreatePolyhedron(`matter-crystal-${node.id}`, { type: 1, size: 0.085 }, scene);
    crystal.position = new Vector3(-0.27, height + 0.4, 0.23);
    crystal.material = glow;
    crystal.parent = parent;
    addPickMetadata(crystal, node.id);
  } else {
    const tower = MeshBuilder.CreateCylinder(`data-obelisk-${node.id}`, {
      diameterTop: 0.08,
      diameterBottom: 0.16,
      height: 0.36,
      tessellation: 6,
    }, scene);
    tower.position = new Vector3(-0.27, height + 0.25, 0.23);
    tower.material = stone;
    tower.parent = parent;
    addPickMetadata(tower, node.id);

    const beacon = MeshBuilder.CreateTorus(`data-beacon-${node.id}`, {
      diameter: 0.22,
      thickness: 0.025,
      tessellation: 16,
    }, scene);
    beacon.position = new Vector3(-0.27, height + 0.4, 0.23);
    beacon.rotation.x = Math.PI / 2;
    beacon.material = glow;
    beacon.parent = parent;
    addPickMetadata(beacon, node.id);
  }
}

function buildBoard(
  scene: Scene,
  nodes: readonly GridNode[],
): { tiles: Map<number, Mesh>; materials: Map<number, PBRMaterial> } {
  const tiles = new Map<number, Mesh>();
  const materials = new Map<number, PBRMaterial>();

  for (const node of nodes) {
    const height = sectorHeight(node);
    const position = worldPosition(node.x, node.y);
    const sectorRoot = new TransformNode(`sector-root-${node.id}`, scene);
    sectorRoot.position = position;

    const plinth = MeshBuilder.CreateBox(`sector-plinth-${node.id}`, {
      width: 1,
      height: 0.08,
      depth: 1,
    }, scene);
    plinth.position.y = 0.02;
    plinth.material = pbr(scene, `sector-plinth-material-${node.id}`, '#574a39', 0.18, 0.72);
    plinth.parent = sectorRoot;
    addPickMetadata(plinth, node.id);

    const tile = MeshBuilder.CreateBox(`sector-tile-${node.id}`, {
      width: 0.94,
      height,
      depth: 0.94,
    }, scene);
    tile.position.y = height / 2 + 0.07;
    const factionColor = FACTION_COLORS[node.controller] ?? FACTION_COLORS.NEUTRAL;
    const material = pbr(scene, `sector-material-${node.id}`, factionColor, 0.08, 0.76);
    material.emissiveColor = color(factionColor).scale(node.controller === 'NEUTRAL' ? 0.015 : 0.04);
    tile.material = material;
    tile.parent = sectorRoot;
    tile.receiveShadows = true;
    addPickMetadata(tile, node.id);
    tile.metadata.baseHeight = height;

    const rune = MeshBuilder.CreatePolyhedron(`resource-rune-${node.id}`, {
      type: 1,
      size: 0.075 + node.yieldRate * 0.004,
    }, scene);
    rune.position = new Vector3(0.17, height + 0.13, -0.16);
    const runeColor = RESOURCE_COLORS[node.resource] ?? '#ffffff';
    const runeMaterial = standard(scene, `rune-material-${node.id}`, runeColor, runeColor);
    runeMaterial.disableLighting = true;
    rune.material = runeMaterial;
    rune.parent = sectorRoot;
    addPickMetadata(rune, node.id);

    buildResourceLandmark(scene, node, sectorRoot, height);
    tiles.set(node.id, tile);
    materials.set(node.id, material);
  }

  return { tiles, materials };
}

function createUnitAvatar(
  runtime: TheaterRuntime,
  unit: Unit,
  node: GridNode | undefined,
  own: boolean,
): UnitAvatar {
  const root = new TransformNode(`unit-${unit.id}`, runtime.scene);
  const rig = new TransformNode(`unit-rig-${unit.id}`, runtime.scene);
  rig.parent = root;
  const base = unitPosition(unit, node, own);
  root.position = base;

  const factionColor = FACTION_COLORS[unit.faction] ?? '#ffffff';
  const armorName = `knight-armor-${unit.faction}`;
  const armor = (runtime.scene.getMaterialByName(armorName) as PBRMaterial | null)
    ?? pbr(runtime.scene, armorName, factionColor, 0.34, 0.5, factionColor);
  armor.emissiveColor = color(factionColor).scale(own ? 0.08 : 0.025);
  const iron = (runtime.scene.getMaterialByName('knight-iron') as PBRMaterial | null)
    ?? pbr(runtime.scene, 'knight-iron', '#858477', 0.55, 0.42);
  const cloth = (runtime.scene.getMaterialByName('knight-cloth') as PBRMaterial | null)
    ?? pbr(runtime.scene, 'knight-cloth', '#583b32', 0.02, 0.94);

  // Cute chibi proportions: chunky little body + oversized helmet head.
  const body = MeshBuilder.CreateBox(`knight-body-${unit.id}`, {
    width: 0.32,
    height: 0.32,
    depth: 0.22,
  }, runtime.scene);
  body.position.y = 0.42;
  body.material = armor;
  body.parent = rig;

  const belt = MeshBuilder.CreateBox(`knight-belt-${unit.id}`, {
    width: 0.35,
    height: 0.08,
    depth: 0.24,
  }, runtime.scene);
  belt.position.y = 0.3;
  belt.material = iron;
  belt.parent = rig;

  // Head pivot lets the whole helmet bob, sway and tilt independently.
  const headPivot = new TransformNode(`knight-head-pivot-${unit.id}`, runtime.scene);
  headPivot.position.y = 0.64;
  headPivot.parent = rig;

  const head = MeshBuilder.CreateSphere(`knight-head-${unit.id}`, {
    diameter: 0.3,
    segments: 10,
  }, runtime.scene);
  head.position.y = 0.1;
  head.material = iron;
  head.parent = headPivot;

  const visor = MeshBuilder.CreateBox(`knight-visor-${unit.id}`, {
    width: 0.26,
    height: 0.085,
    depth: 0.03,
  }, runtime.scene);
  visor.position = new Vector3(0, 0.09, -0.14);
  visor.material = armor;
  visor.parent = headPivot;

  // Glowing eyes peeking out of the visor slot — gives the character life.
  const eyeName = `knight-eye-${unit.faction}`;
  const eyeMaterial = (runtime.scene.getMaterialByName(eyeName) as StandardMaterial | null)
    ?? standard(runtime.scene, eyeName, own ? '#bdf4ff' : '#ffd98a', own ? '#bdf4ff' : '#ffd98a');
  eyeMaterial.disableLighting = true;
  for (const side of [-1, 1]) {
    const eye = MeshBuilder.CreateBox(`knight-eyeball-${unit.id}-${side}`, {
      width: 0.045,
      height: 0.05,
      depth: 0.02,
    }, runtime.scene);
    eye.position = new Vector3(side * 0.06, 0.095, -0.16);
    eye.material = eyeMaterial;
    eye.parent = headPivot;
  }

  const plume = MeshBuilder.CreateBox(`knight-plume-${unit.id}`, {
    width: 0.07,
    height: 0.24,
    depth: 0.13,
  }, runtime.scene);
  plume.position = new Vector3(0, 0.27, 0.03);
  plume.rotation.x = -0.22;
  plume.material = armor;
  plume.parent = headPivot;

  const leftArm = new TransformNode(`knight-left-arm-${unit.id}`, runtime.scene);
  leftArm.position = new Vector3(-0.2, 0.55, 0);
  leftArm.parent = rig;
  const rightArm = new TransformNode(`knight-right-arm-${unit.id}`, runtime.scene);
  rightArm.position = new Vector3(0.2, 0.55, 0);
  rightArm.parent = rig;
  for (const [arm, side] of [[leftArm, -1], [rightArm, 1]] as const) {
    const limb = MeshBuilder.CreateBox(`knight-arm-${unit.id}-${side}`, {
      width: 0.1,
      height: 0.3,
      depth: 0.1,
    }, runtime.scene);
    limb.position.y = -0.13;
    limb.material = armor;
    limb.parent = arm;
  }

  const leftLeg = new TransformNode(`knight-left-leg-${unit.id}`, runtime.scene);
  leftLeg.position = new Vector3(-0.09, 0.28, 0);
  leftLeg.parent = rig;
  const rightLeg = new TransformNode(`knight-right-leg-${unit.id}`, runtime.scene);
  rightLeg.position = new Vector3(0.09, 0.28, 0);
  rightLeg.parent = rig;
  for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]] as const) {
    const limb = MeshBuilder.CreateBox(`knight-leg-${unit.id}-${side}`, {
      width: 0.11,
      height: 0.3,
      depth: 0.13,
    }, runtime.scene);
    limb.position.y = -0.14;
    limb.material = iron;
    limb.parent = leg;
  }

  const sword = MeshBuilder.CreateBox(`knight-sword-${unit.id}`, {
    width: 0.035,
    height: 0.42,
    depth: 0.035,
  }, runtime.scene);
  sword.position = new Vector3(0, -0.28, -0.06);
  sword.rotation.z = -0.18;
  sword.material = iron;
  sword.parent = rightArm;

  const shield = MeshBuilder.CreateCylinder(`knight-shield-${unit.id}`, {
    diameter: 0.23,
    height: 0.035,
    tessellation: 8,
  }, runtime.scene);
  shield.position = new Vector3(0, -0.2, -0.09);
  shield.rotation.x = Math.PI / 2;
  shield.material = armor;
  shield.parent = leftArm;

  const cape = MeshBuilder.CreatePlane(`knight-cape-${unit.id}`, {
    width: 0.27,
    height: 0.4,
  }, runtime.scene);
  cape.position = new Vector3(0, 0.43, 0.12);
  cape.rotation.y = Math.PI;
  cape.material = cloth;
  cape.parent = rig;

  let ring: TransformNode | undefined;
  if (own) {
    ring = new TransformNode(`command-ring-pivot-${unit.id}`, runtime.scene);
    ring.position.y = 0.035;
    ring.parent = root;
    const commandRing = MeshBuilder.CreateTorus(`command-ring-${unit.id}`, {
      diameter: 0.52,
      thickness: 0.035,
      tessellation: 24,
    }, runtime.scene);
    commandRing.rotation.x = Math.PI / 2;
    const ringMaterial = standard(runtime.scene, `command-ring-material-${unit.id}`, '#7ad8ff', '#7ad8ff');
    ringMaterial.disableLighting = true;
    commandRing.material = ringMaterial;
    commandRing.parent = ring;
  }

  root.getChildMeshes().forEach(mesh => {
    mesh.isPickable = false;
  });

  return {
    root,
    rig,
    head: headPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    ring,
    own,
    target: base.clone(),
    lastGridPosition: `${unit.x}:${unit.y}`,
    arrivalPending: false,
    jumpProgress: 1,
    phase: Number(unit.id % 13n),
    blinkTimer: Number(unit.id % 7n) + 1,
  };
}

export function HolographicTheater(props: {
  nodes: readonly GridNode[];
  units: readonly Unit[];
  myUnit?: Unit;
  selectedNodeId?: number;
  onSelectNode: (node: GridNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<TheaterRuntime | null>(null);
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      antialias: true,
      adaptToDeviceRatio: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      stencil: true,
    });
    // Render at a lower internal resolution and let CSS `image-rendering: pixelated`
    // upscale it, giving the board a crunchy low-poly / pixel indie look.
    engine.setHardwareScalingLevel(Math.max(1.5, window.devicePixelRatio * 0.85));
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera(
      'castle-war-camera',
      -Math.PI / 2.05,
      1.08,
      19.4,
      new Vector3(0, 0.45, 0.45),
      scene,
    );
    camera.fov = 0.64;
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 24;
    camera.lowerBetaLimit = 0.65;
    camera.upperBetaLimit = 1.2;
    camera.wheelPrecision = 45;
    camera.panningSensibility = 90;
    camera.inertia = 0.82;

    const ambient = new HemisphericLight('castle-ambient', new Vector3(0, 1, 0), scene);
    ambient.diffuse = color('#ffe2b4');
    ambient.groundColor = color('#3a2c5a');
    ambient.intensity = 0.74;

    const moon = new DirectionalLight('sunlight', new Vector3(-0.42, -1, 0.32), scene);
    moon.position = new Vector3(12, 19, -14);
    moon.diffuse = color('#ffe5b2');
    moon.intensity = 1.35;

    const shadowGenerator = new ShadowGenerator(512, moon);
    shadowGenerator.usePoissonSampling = true;
    shadowGenerator.bias = 0.0005;

    buildCastleEnvironment(scene, shadowGenerator);
    const board = buildBoard(scene, propsRef.current.nodes);
    const runtime: TheaterRuntime = {
      engine,
      scene,
      tiles: board.tiles,
      tileMaterials: board.materials,
      unitAvatars: new Map(),
      disposed: false,
    };
    runtimeRef.current = runtime;

    scene.onPointerObservable.add(pointerInfo => {
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
      const nodeId = pointerInfo.pickInfo?.pickedMesh?.metadata?.nodeId;
      if (typeof nodeId !== 'number') return;
      const node = propsRef.current.nodes.find(candidate => candidate.id === nodeId);
      if (node) propsRef.current.onSelectNode(node);
    });

    scene.onBeforeRenderObservable.add(() => {
      const delta = Math.min(0.05, engine.getDeltaTime() / 1000);
      runtime.unitAvatars.forEach(avatar => {
        const distance = Vector3.Distance(avatar.root.position, avatar.target);
        const moving = distance > 0.018;
        avatar.phase += delta * (moving ? 11 : 1.7);

        if (moving) {
          const direction = avatar.target.subtract(avatar.root.position);
          avatar.root.rotation.y = Math.atan2(direction.x, direction.z);
          avatar.root.position = Vector3.Lerp(avatar.root.position, avatar.target, 1 - Math.exp(-delta * 6));
        } else if (avatar.arrivalPending) {
          avatar.root.position.copyFrom(avatar.target);
          avatar.arrivalPending = false;
          avatar.jumpProgress = 0;
        }

        if (avatar.jumpProgress < 1) {
          // ---- CAPTURE / VICTORY: hop, raise the sword, squash-stretch landing,
          // and (for your own commander) a celebratory spin. ----
          avatar.jumpProgress = Math.min(1, avatar.jumpProgress + delta * 1.45);
          const t = avatar.jumpProgress;
          const jump = Math.sin(t * Math.PI);
          avatar.rig.position.y = jump * 0.42;
          // anticipation squash, airborne stretch, landing squash
          const stretch = t < 0.12 ? 1 - (0.12 - t) * 2.2 : 1 + jump * 0.22;
          avatar.rig.scaling.y = stretch;
          avatar.rig.scaling.x = 2 - stretch;
          avatar.rig.scaling.z = 2 - stretch;
          avatar.rightArm.rotation.x = -jump * 2.4; // sword thrust skyward
          avatar.leftArm.rotation.x = -jump * 1.0;
          avatar.leftLeg.rotation.x = jump * 0.45;
          avatar.rightLeg.rotation.x = -jump * 0.45;
          avatar.head.rotation.x = -jump * 0.35; // look up at the raised blade
          avatar.head.rotation.y = 0;
          if (avatar.own) avatar.root.rotation.y += delta * 7 * (1 - t);
          if (avatar.ring) avatar.ring.scaling.setAll(1 + jump * 0.6);
        } else if (moving) {
          // ---- BOUNCY WALK: stride swing, forward lean, a little squash bounce. ----
          const stride = Math.sin(avatar.phase) * 0.9;
          const bounce = Math.abs(Math.sin(avatar.phase));
          avatar.rig.position.y = bounce * 0.06;
          avatar.rig.rotation.x += (0.16 - avatar.rig.rotation.x) * Math.min(1, delta * 8);
          avatar.rig.scaling.y += (1 + bounce * 0.05 - avatar.rig.scaling.y) * Math.min(1, delta * 10);
          avatar.rig.scaling.x += (1 - avatar.rig.scaling.x) * Math.min(1, delta * 10);
          avatar.rig.scaling.z += (1 - avatar.rig.scaling.z) * Math.min(1, delta * 10);
          avatar.leftArm.rotation.x = stride;
          avatar.rightArm.rotation.x = -stride;
          avatar.leftLeg.rotation.x = -stride;
          avatar.rightLeg.rotation.x = stride;
          avatar.head.rotation.x += (0 - avatar.head.rotation.x) * Math.min(1, delta * 8);
          avatar.head.rotation.y = Math.sin(avatar.phase * 0.5) * 0.08;
          if (avatar.ring) avatar.ring.scaling.setAll(1);
        } else {
          // ---- IDLE: gentle breathing, soft head sway, an occasional alert glance,
          // and a slow pulsing command aura. ----
          const breathe = Math.sin(avatar.phase);
          avatar.rig.position.y = breathe * 0.012;
          avatar.rig.rotation.x += (0 - avatar.rig.rotation.x) * Math.min(1, delta * 5);
          avatar.rig.scaling.y += (1 + breathe * 0.03 - avatar.rig.scaling.y) * Math.min(1, delta * 6);
          avatar.rig.scaling.x += (1 - breathe * 0.012 - avatar.rig.scaling.x) * Math.min(1, delta * 6);
          avatar.rig.scaling.z += (1 - breathe * 0.012 - avatar.rig.scaling.z) * Math.min(1, delta * 6);
          avatar.leftArm.rotation.x *= 0.86;
          avatar.rightArm.rotation.x *= 0.86;
          avatar.leftLeg.rotation.x *= 0.82;
          avatar.rightLeg.rotation.x *= 0.82;

          avatar.blinkTimer -= delta;
          if (avatar.blinkTimer <= 0) {
            avatar.blinkTimer = 3 + Math.random() * 3;
            avatar.head.rotation.y = (Math.random() - 0.5) * 0.7; // quick glance
          }
          // ease the glance back into a slow ambient sway
          const sway = Math.sin(avatar.phase * 0.6) * 0.14;
          avatar.head.rotation.y += (sway - avatar.head.rotation.y) * Math.min(1, delta * 2.4);
          avatar.head.rotation.x += (0 - avatar.head.rotation.x) * Math.min(1, delta * 4);
          if (avatar.ring) avatar.ring.scaling.setAll(1 + (breathe * 0.5 + 0.5) * 0.12);
        }
      });
    });

    engine.runRenderLoop(() => scene.render());
    const resize = () => engine.resize();
    window.addEventListener('resize', resize);

    return () => {
      runtime.disposed = true;
      window.removeEventListener('resize', resize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    for (const node of props.nodes) {
      const tile = runtime.tiles.get(node.id);
      const material = runtime.tileMaterials.get(node.id);
      if (!tile || !material) continue;
      const height = sectorHeight(node);
      const baseHeight = Number(tile.metadata?.baseHeight ?? height);
      tile.scaling.y = height / Math.max(0.001, baseHeight);
      tile.position.y = height / 2 + 0.07;
      const factionColor = color(FACTION_COLORS[node.controller] ?? FACTION_COLORS.NEUTRAL);
      material.albedoColor = factionColor;
      material.emissiveColor = factionColor.scale(
        node.id === props.selectedNodeId ? 0.24 : node.controller === 'NEUTRAL' ? 0.01 : 0.035,
      );
      material.metallic = node.id === props.selectedNodeId ? 0.28 : 0.08;
    }
  }, [props.nodes, props.selectedNodeId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const nodeByPosition = new Map(props.nodes.map(node => [`${node.x}:${node.y}`, node]));
    const liveIds = new Set(props.units.map(unit => unit.id.toString()));

    runtime.unitAvatars.forEach((avatar, id) => {
      if (liveIds.has(id)) return;
      avatar.root.getChildMeshes().forEach(mesh => mesh.dispose());
      avatar.root.dispose();
      runtime.unitAvatars.delete(id);
    });

    for (const unit of props.units) {
      const id = unit.id.toString();
      const node = nodeByPosition.get(`${unit.x}:${unit.y}`);
      const own = props.myUnit?.id === unit.id;
      const target = unitPosition(unit, node, own);
      const existing = runtime.unitAvatars.get(id);
      if (existing) {
        const gridPosition = `${unit.x}:${unit.y}`;
        if (existing.lastGridPosition !== gridPosition) {
          existing.lastGridPosition = gridPosition;
          existing.target.copyFrom(target);
          existing.arrivalPending = true;
        } else {
          existing.target.y = target.y;
        }
        continue;
      }

      runtime.unitAvatars.set(id, createUnitAvatar(runtime, unit, node, own));
    }
  }, [props.nodes, props.units, props.myUnit?.id]);

  return (
    <div className="holographic-theater castle-theater" aria-label="Interactive Babylon.js castle war table">
      <canvas ref={canvasRef} />
    </div>
  );
}
