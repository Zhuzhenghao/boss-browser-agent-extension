#!/usr/bin/env node

import { startServer } from '../dist/index.js';

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
