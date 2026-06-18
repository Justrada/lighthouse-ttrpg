import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Use the brighter raised surface. */
  raised?: boolean;
  /** Adds the animated gradient ring border for featured panels. */
  ring?: boolean;
  /** Inset padding shortcut; pass `false` for flush content (e.g. headers). */
  padded?: boolean;
}

/** The workhorse glass surface. Compose with PanelHeader/Body/Footer. */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ raised, ring, padded = false, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        raised ? 'lh-panel-raised' : 'lh-panel',
        ring && 'lh-ring',
        padded && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Panel.displayName = 'Panel';

export interface PanelHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned slot for actions/icons. */
  actions?: ReactNode;
  /** Leading slot, e.g. an icon or avatar. */
  leading?: ReactNode;
}

export const PanelHeader = forwardRef<HTMLDivElement, PanelHeaderProps>(
  ({ title, subtitle, actions, leading, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3 border-b border-line/70 px-5 py-4',
        className,
      )}
      {...props}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      {(title || subtitle) && (
        <div className="min-w-0 flex-1">
          {title && (
            <h3 className="truncate font-display text-base font-semibold tracking-wide text-ink">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="truncate text-xs text-ink-muted">{subtitle}</p>
          )}
        </div>
      )}
      {children}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  ),
);
PanelHeader.displayName = 'PanelHeader';

export interface PanelBodyProps extends HTMLAttributes<HTMLDivElement> {}

export const PanelBody = forwardRef<HTMLDivElement, PanelBodyProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('p-5', className)} {...props}>
      {children}
    </div>
  ),
);
PanelBody.displayName = 'PanelBody';

export interface PanelFooterProps extends HTMLAttributes<HTMLDivElement> {}

export const PanelFooter = forwardRef<HTMLDivElement, PanelFooterProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-end gap-2 border-t border-line/70 px-5 py-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
PanelFooter.displayName = 'PanelFooter';
