import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Rich TS mock singleton
import { databaseMock as richMock } from '../helpers/database-mock';

// CJS shell used by server/db.ts

const { databaseMock: cjsMock } = require('../helpers/database-mock.cjs');

// Wire delegate: CJS mock (and its poolMock) now delegate to TS rich mock

(cjsMock as any).__setDelegate?.(richMock);
