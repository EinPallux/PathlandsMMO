// Renders the other players the server reports. One code-authored character model per
// remote (built the same way as the local player, per class), positioned and animated
// each frame from the NetClient's interpolated remote state (ARCH §7). Gear is not
// rendered on character models by design (GDD), so class + pose is the whole picture.

import type * as THREE from 'three';
import { buildCharacterModel, type CharacterClass } from '@pathlands/shared';
import { ModelObject } from './voxelModel.js';
import type { RemoteRenderState } from '../net/netClient.js';

interface RemoteAvatar {
  obj: ModelObject;
  cls: CharacterClass;
}

export class RemotePlayerRenderer {
  private readonly avatars = new Map<string, RemoteAvatar>();

  constructor(private readonly scene: THREE.Scene) {}

  /** Reconcile the live set of remotes with the scene, then pose each one. */
  sync(states: RemoteRenderState[], dt: number): void {
    const present = new Set<string>();
    for (const s of states) {
      present.add(s.id);
      let avatar = this.avatars.get(s.id);
      if (avatar === undefined || avatar.cls !== s.cls) {
        if (avatar !== undefined) this.destroy(avatar);
        avatar = { obj: new ModelObject(buildCharacterModel(s.cls)), cls: s.cls };
        this.scene.add(avatar.obj.group);
        this.avatars.set(s.id, avatar);
      }
      avatar.obj.setTransform(s.x, s.y, s.z, s.yaw);
      avatar.obj.setClip(s.move);
      avatar.obj.update(dt);
    }
    for (const [id, avatar] of this.avatars) {
      if (!present.has(id)) {
        this.destroy(avatar);
        this.avatars.delete(id);
      }
    }
  }

  private destroy(avatar: RemoteAvatar): void {
    this.scene.remove(avatar.obj.group);
    avatar.obj.dispose();
  }

  dispose(): void {
    for (const avatar of this.avatars.values()) this.destroy(avatar);
    this.avatars.clear();
  }
}
