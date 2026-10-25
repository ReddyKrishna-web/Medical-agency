import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom ships `window.scrollTo` as a stub that logs "Not implemented".
// Route transitions call it on every path change, so keep the test console clean.
window.scrollTo = () => {};

afterEach(() => cleanup());
