// LIGHTHOUSE — interactive skill-tree graph.

export { SkillTreeGraph } from './SkillTreeGraph';
export type { SkillTreeGraphProps } from './SkillTreeGraph';

export { SkillNodeShape } from './SkillNodeShape';
export type { SkillNodeShapeProps, NodeVisualState } from './SkillNodeShape';

export { NodeInfoPanel } from './NodeInfoPanel';
export type { NodeInfoPanelProps } from './NodeInfoPanel';

export {
  describeEffect,
  costText,
  isChoiceEffect,
  isCoreSkillChoice,
  isResourceChoice,
  CORE_SKILL_CHOICES,
  RESOURCE_CHOICES,
} from './effectText';

export {
  computeBounds,
  fitTransform,
  resolveEdges,
  curvePath,
  clampScale,
  MIN_SCALE,
  MAX_SCALE,
} from './geometry';
export type { Bounds, ViewTransform, ResolvedEdge } from './geometry';
