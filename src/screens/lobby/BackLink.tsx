import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface BackLinkProps {
  /** Route to navigate to. Defaults to home. */
  to?: string;
  label?: string;
  className?: string;
}

/** A quiet "return to shore" link used on the lobby thresholds. */
export function BackLink({ to = '/', label = 'Back to home', className }: BackLinkProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-lg text-xs font-medium uppercase tracking-wider text-ink-faint transition-colors duration-200 tap-highlight-none hover:text-ink-muted focus-visible:outline-none focus-visible:text-ink-muted',
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
      {label}
    </button>
  );
}
