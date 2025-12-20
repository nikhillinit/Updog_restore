import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Rich TS mock singleton
import { databaseMock as richMock } from '../helpers/database-mock';

// CJS shell used by server/db.ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { databaseMock: cjsMock } = require('../helpers/database-mock.cjs');

// Wire delegate: CJS mock (and its poolMock) now delegate to TS rich mock
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
(cjsMock as any).__setDelegate?.(richMock);
