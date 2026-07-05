// @pathlands/shared — deterministic simulation core.
// Pure TypeScript: no DOM, no Three.js, no React, no Node APIs.
// This barrel is the public surface consumed by the client and (Phase 6) the server.

export const SHARED_VERSION = '0.1.0';

export * from './core/index.js';
export * from './worldgen/index.js';
export * from './models/index.js';
export * from './data/index.js';
export * from './combat/index.js';
export * from './sim/index.js';
export * from './proto/index.js';
