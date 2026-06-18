// LIGHTHOUSE — UI component library barrel.
// Presentational components only (props in, callbacks out).

// Shared hooks & utilities
export {
  usePrefersReducedMotion,
  useScrollLock,
  useEscapeKey,
  useFocusTrap,
  useId,
} from './hooks';

// Primitives
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { IconButton } from './IconButton';
export type {
  IconButtonProps,
  IconButtonVariant,
  IconButtonSize,
} from './IconButton';

export { Panel, PanelHeader, PanelBody, PanelFooter } from './Panel';
export type {
  PanelProps,
  PanelHeaderProps,
  PanelBodyProps,
  PanelFooterProps,
} from './Panel';

export { Card } from './Card';
export type { CardProps } from './Card';

export { Portal } from './Portal';
export type { PortalProps } from './Portal';

export { Modal } from './Modal';
export type { ModalProps, ModalSize } from './Modal';

export { Drawer } from './Drawer';
export type { DrawerProps, DrawerSide } from './Drawer';

export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { Tooltip } from './Tooltip';
export type { TooltipProps, TooltipSide } from './Tooltip';

// Form controls
export { Field } from './Field';
export type { FieldProps } from './Field';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { NumberStepper } from './NumberStepper';
export type { NumberStepperProps } from './NumberStepper';

export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentOption } from './SegmentedControl';

// Display
export { Badge } from './Badge';
export type { BadgeProps, BadgeTone, BadgeVariant } from './Badge';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { Tag } from './Tag';
export type { TagProps } from './Tag';

export { ConditionBadge } from './ConditionBadge';
export type { ConditionBadgeProps, ConditionTone } from './ConditionBadge';

export { ResourceBar } from './ResourceBar';
export type { ResourceBarProps, ResourceKind } from './ResourceBar';

export { StatBadge } from './StatBadge';
export type { StatBadgeProps } from './StatBadge';

export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize, SpinnerTone } from './Spinner';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Divider } from './Divider';
export type { DividerProps } from './Divider';

export { Kbd } from './Kbd';
export type { KbdProps } from './Kbd';

export { ProgressRing } from './ProgressRing';
export type { ProgressRingProps } from './ProgressRing';

// Toasts
export { Toast } from './Toast';
export type { ToastProps, ToastData, ToastTone } from './Toast';

export { ToastViewport } from './ToastViewport';
export type { ToastViewportProps, ToastPosition } from './ToastViewport';

// Dice
export { Die } from './Die';
export type { DieProps, DieSides, DieTone } from './Die';

export { DiceResult } from './DiceResult';
export type { DiceResultProps } from './DiceResult';

export { DiceTray } from './DiceTray';
export type { DiceTrayProps } from './DiceTray';

// Avatar
export { Sigil } from './Sigil';
export type { SigilProps } from './Sigil';

export { Avatar } from './Avatar';
export type { AvatarProps, AvatarStatus, AvatarRing } from './Avatar';

// Layout
export { PageShell } from './PageShell';
export type { PageShellProps } from './PageShell';

export { TopBar } from './TopBar';
export type { TopBarProps } from './TopBar';
