#!/usr/bin/env node
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

import '@total-typescript/ts-reset';

import runProgram from './cli';

dotenv.config({
  path: [
    `${path.resolve(process.cwd(), '.env')}`,
    `${path.resolve(os.homedir(), '.config', 'regression-sniffer', '.env')}`,
    `${path.resolve(os.homedir(), '.env.regression-sniffer')}`,
    `${path.resolve(os.homedir(), '.env')}`,
  ],
});

try {
  runProgram();
} catch (error) {
  console.error(error);
  process.exit(1);
}
