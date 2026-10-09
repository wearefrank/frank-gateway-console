import type { ReactNode } from 'react';

interface ToggleButtonProps {
    checked: boolean;
    onToggle: (checked: boolean) => void;
    children: ReactNode;
    className?: string;
}

export const ToggleButton = ({ checked, onToggle, children, className = '' }: ToggleButtonProps) => (
    <button
        type="button"
        onClick={() => onToggle(!checked)}
        className={`${checked ? 'btn-primary' : ''} ${className}`}
        aria-pressed={checked}
    >
        {children}
    </button>
);
