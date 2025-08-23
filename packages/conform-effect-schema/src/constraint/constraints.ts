import type { Constraint } from '@conform-to/dom';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import * as Option from 'effect/Option';

type Path = string;

export type Constraints = HashMap.HashMap<Path, Constraint>;

/**
 * Construct an empty constraints collection.
 * @private
 */
export const empty = (): Constraints => HashMap.empty<Path, Constraint>();

/**
 * Materialize a constraints collection to a plain record.
 * @private
 */
export const toRecord = (
	constraints: Constraints,
): Record.ReadonlyRecord<string, Constraint> => Record.fromEntries(constraints);

export const modify = (
	constraints: Constraints,
	path: Path,
	patch: Partial<Constraint>,
): Constraints =>
	HashMap.modifyAt(constraints, path, (maybeConstraint) =>
		Option.some({
			...Option.getOrElse(maybeConstraint, Record.empty),
			...patch,
		}),
	);

export const set = (
	constraints: Constraints,
	path: Path,
	patch: Partial<Constraint>,
): Constraints => HashMap.set(constraints, path, patch);
