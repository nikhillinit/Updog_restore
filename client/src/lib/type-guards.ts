/**
 * Compatibility facade for shared type guard utilities.
 *
 * Keep this module as the stable client import path while shared-safe
 * primitives live in `shared/utils/type-guards`.
 */

export {
  assertDefined,
  filterDefined,
  getValidProperty,
  hasElements,
  hasProperty,
  isDefined,
  isNonEmptyString,
  isNotNull,
  isNotUndefined,
  isRecord,
  isValidNumber,
  mapDefined,
  safeAccess,
  safeArray,
  safeGet,
  safeNumber,
  safeObjectAccess,
  safeString,
} from '@shared/utils/type-guards';
export { getErrorMessage, readJsonResponse } from './http-response';
