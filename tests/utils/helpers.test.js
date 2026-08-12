import { describe, it, expect, vi } from 'vitest';
import { debounce } from '../../src/utils/helpers.js';

describe('helpers.js', () => {
  describe('debounce', () => {
    it('should debounce function calls', () => {
      vi.useFakeTimers();
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      // Should not be called immediately
      expect(mockFn).not.toHaveBeenCalled();

      // Fast-forward 50ms (still shouldn't be called)
      vi.advanceTimersByTime(50);
      expect(mockFn).not.toHaveBeenCalled();

      // Fast-forward another 50ms (100ms total, should be called once)
      vi.advanceTimersByTime(50);
      expect(mockFn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should pass arguments to the debounced function', () => {
      vi.useFakeTimers();
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('test', 123);
      vi.advanceTimersByTime(100);

      expect(mockFn).toHaveBeenCalledWith('test', 123);
      vi.useRealTimers();
    });
  });
});
