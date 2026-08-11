import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Explicit cleanup: vitest runs with globals disabled, so RTL's auto-cleanup
// (which relies on a global afterEach) does not fire on its own.
afterEach(() => {
  cleanup();
});