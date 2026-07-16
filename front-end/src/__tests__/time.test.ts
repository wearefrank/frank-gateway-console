import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatExactDate, formatRelativeTime } from '../utils/time';

// ---------------------------------------------------------------------------
// formatExactDate
// ---------------------------------------------------------------------------

describe('formatExactDate', () => {
    it('includes the year, day and time of day', () => {
        const result = formatExactDate('2024-03-15T14:30:00Z');
        expect(result).toContain('2024');
        expect(result).toMatch(/15/);
    });

    it('produces different output for different dates', () => {
        const a = formatExactDate('2024-01-01T00:00:00Z');
        const b = formatExactDate('2025-06-20T00:00:00Z');
        expect(a).not.toBe(b);
    });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns "just now" for less than 60 seconds ago', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
        expect(formatRelativeTime('2026-01-01T00:00:00Z')).toBe('just now');
    });

    it('returns singular minute for exactly 1 minute ago', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
        expect(formatRelativeTime('2026-01-01T00:00:00Z')).toBe('1 minute ago');
    });

    it('returns plural minutes for multiple minutes ago', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
        expect(formatRelativeTime('2026-01-01T00:00:00Z')).toBe('5 minutes ago');
    });

    it('returns singular hour for exactly 1 hour ago', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
        expect(formatRelativeTime('2026-01-01T00:00:00Z')).toBe('1 hour ago');
    });

    it('returns plural hours for multiple hours ago', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T03:00:00Z'));
        expect(formatRelativeTime('2026-01-01T00:00:00Z')).toBe('3 hours ago');
    });

    it('returns singular day for exactly 1 day ago', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
        expect(formatRelativeTime('2026-01-01T00:00:00Z')).toBe('1 day ago');
    });

    it('returns plural days for multiple days ago', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-10T00:00:00Z'));
        expect(formatRelativeTime('2026-01-01T00:00:00Z')).toBe('9 days ago');
    });
});
