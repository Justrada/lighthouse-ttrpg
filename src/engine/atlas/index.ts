/**
 * Worldgen — the pure, deterministic half of the map feature.
 *
 * Imported as `@/engine/atlas` rather than through the main `@/engine` barrel,
 * so map code has one import site and combat code doesn't pull worldgen in.
 *
 * Everything here is a pure function of its inputs. See `purity.test.ts`, which
 * enforces that mechanically rather than by convention.
 */
export {
  mix32,
  hashPath,
  deriveSeed,
  seedForPath,
  rngFor,
  randInt,
  pick,
  shuffled,
  makeNoise3,
  fbm3,
  FBM_GAIN,
  FBM_LACUNARITY,
  type Seed,
  type SeedKey,
  type Noise3,
} from './rand';

export {
  compileBattlefield,
  reachableFrom,
  DEFAULT_DIMS,
  type ArenaArchetype,
  type CompileBattlefieldOptions,
} from './battlefield';
