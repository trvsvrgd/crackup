/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Crackdown-Style Third-Person Orbital Spring-Arm Camera (PRD Section 2.2.1)
 */

import * as THREE from 'three';
import {
  CAMERA_ARM_AIM,
  CAMERA_ARM_DEFAULT,
  CAMERA_ARM_SPRINT_MAX,
  CAMERA_PITCH_MAX_RAD,
  CAMERA_PITCH_MIN_RAD,
  CAMERA_SHOULDER_OFFSET,
} from '../../shared/constants.js';
import { AgentPhysicsBody, SharedPhysicsWorld } from '../../shared/physics/characterController.js';
import { Vec3 } from '../../shared/protocol/binaryProtocol.js';

export class SpringArmCameraController {
  public readonly camera: THREE.PerspectiveCamera;
  public yaw = 0; // Radians (0 faces -Z North)
  public pitch = -0.18; // Slightly looking down from shoulder pivot
  public currentArmLength = CAMERA_ARM_DEFAULT;
  public currentFov = 68.0;
  public isAiming = false;
  public sensitivity = 0.0022;

  private readonly smoothedPivot = new THREE.Vector3();
  private initializedPivot = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(68.0, aspect, 0.15, 900.0);
  }

  public onMouseMove(movementX: number, movementY: number): void {
    this.yaw -= movementX * this.sensitivity;
    this.pitch = Math.max(
      CAMERA_PITCH_MIN_RAD,
      Math.min(CAMERA_PITCH_MAX_RAD, this.pitch - movementY * this.sensitivity)
    );
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = Math.max(0.1, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
  }

  /**
   * Updates the 3D Spring-Arm Camera every frame with wall-occlusion whisker raycast + spherecast
   */
  public update(
    playerFootPos: Vec3,
    playerVelocity: Vec3,
    physicsWorld: SharedPhysicsWorld,
    localAgent: AgentPhysicsBody | undefined,
    dt: number
  ): void {
    // 1. Compute Over-the-Right-Shoulder Target Pivot in 3D World Space (+0.45m X, +1.65m Y)
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    const targetPivotX = playerFootPos.x + rightX * CAMERA_SHOULDER_OFFSET.x;
    const targetPivotY = playerFootPos.y + CAMERA_SHOULDER_OFFSET.y;
    const targetPivotZ = playerFootPos.z + rightZ * CAMERA_SHOULDER_OFFSET.x;

    if (!this.initializedPivot) {
      this.smoothedPivot.set(targetPivotX, targetPivotY, targetPivotZ);
      this.initializedPivot = true;
    } else {
      const pivotLerp = Math.min(1.0, dt * 24.0);
      this.smoothedPivot.x += (targetPivotX - this.smoothedPivot.x) * pivotLerp;
      this.smoothedPivot.y += (targetPivotY - this.smoothedPivot.y) * pivotLerp;
      this.smoothedPivot.z += (targetPivotZ - this.smoothedPivot.z) * pivotLerp;
    }

    // 2. Compute Desired Arm Length (2.2m aiming, 4.5m exploration, up to 7.5m high-speed sprint/flight)
    const speed3D = Math.hypot(playerVelocity.x, playerVelocity.y * 0.4, playerVelocity.z);
    let desiredArm = CAMERA_ARM_DEFAULT;
    if (this.isAiming) {
      desiredArm = CAMERA_ARM_AIM;
    } else if (speed3D > 8.5) {
      const speedFactor = Math.min(1.0, (speed3D - 8.5) / 14.0);
      desiredArm = CAMERA_ARM_DEFAULT + speedFactor * (CAMERA_ARM_SPRINT_MAX - CAMERA_ARM_DEFAULT);
    }

    // 3. Spherical Coordinate Camera Offset Vector (from pivot toward camera eye)
    // Forward view direction is (-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch)
    // Therefore the vector from pivot BACK to the camera is (+sinYaw * cosPitch, -sinPitch, +cosYaw * cosPitch)
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const camBackDir: Vec3 = {
      x: sinYaw * cosPitch,
      y: -sinPitch,
      z: cosYaw * cosPitch,
    };

    // 4. Camera Occlusion Whisker Raycast & SphereCast against Rapier3D Environment Colliders
    const safeDistance = physicsWorld.computeCameraSafeDistance(
      {
        x: this.smoothedPivot.x,
        y: this.smoothedPivot.y,
        z: this.smoothedPivot.z,
      },
      camBackDir,
      desiredArm,
      localAgent
    );

    // Snap immediately inward if obstructed; smoothly damp outward when clear
    if (safeDistance < this.currentArmLength) {
      this.currentArmLength = safeDistance;
    } else {
      this.currentArmLength +=
        (safeDistance - this.currentArmLength) * Math.min(1.0, dt * 10.0);
    }

    // 5. Position Camera and Aim along Forward View Vector
    const camX = this.smoothedPivot.x + camBackDir.x * this.currentArmLength;
    const camY = this.smoothedPivot.y + camBackDir.y * this.currentArmLength;
    const camZ = this.smoothedPivot.z + camBackDir.z * this.currentArmLength;
    this.camera.position.set(camX, camY, camZ);

    const lookAtX = this.smoothedPivot.x - camBackDir.x * 30.0;
    const lookAtY = this.smoothedPivot.y - camBackDir.y * 30.0;
    const lookAtZ = this.smoothedPivot.z - camBackDir.z * 30.0;
    this.camera.lookAt(lookAtX, lookAtY, lookAtZ);

    // 6. Velocity-Based Dynamic FOV
    let targetFov = 68.0;
    if (this.isAiming) {
      targetFov = 52.0;
    } else if (speed3D > 6.0) {
      targetFov = Math.min(86.0, 68.0 + (speed3D - 6.0) * 1.15);
    }

    if (Math.abs(targetFov - this.currentFov) > 0.05) {
      this.currentFov += (targetFov - this.currentFov) * Math.min(1.0, dt * 10.0);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }
}

