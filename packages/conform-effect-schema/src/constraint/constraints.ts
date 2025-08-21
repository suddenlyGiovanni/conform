import type { Constraint } from '@conform-to/dom';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';


export type Constraints = HashMap.HashMap<string, Constraint>;

/**
 * Construct an empty constraints collection.
 * @private
 */
export const empty = (): Constraints => HashMap.empty<string, Constraint>();

/**
 * Materialize a constraints collection to a plain record.
 * @private
 */
export const toRecord = (
	constraints: Constraints,
): Record.ReadonlyRecord<string, Constraint> => Record.fromEntries(constraints);
