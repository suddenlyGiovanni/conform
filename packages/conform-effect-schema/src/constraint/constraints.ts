import type { Constraint } from '@conform-to/dom';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import * as Option from 'effect/Option';

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Constraints {
	type Path = string;
	type Constraints = HashMap.HashMap<Path, Constraint>;
}

export class Constraints {
	/**
	 * Construct an empty constraints collection.
	 * @private
	 */
	static empty = (): Constraints.Constraints =>
		HashMap.empty<Constraints.Path, Constraint>();

	/**
	 * Materialize a constraints collection to a plain record.
	 * @private
	 */
	static toRecord = (
		constraints: Constraints.Constraints,
	): Record.ReadonlyRecord<string, Constraint> =>
		Record.fromEntries(constraints);

	static modify = (
		constraints: Constraints.Constraints,
		path: Constraints.Path,
		patch: Partial<Constraint>,
	): Constraints.Constraints =>
		HashMap.modifyAt(constraints, path, (maybeConstraint) =>
			Option.some({
				...Option.getOrElse(maybeConstraint, Record.empty),
				...patch,
			}),
		);

	static set = (
		constraints: Constraints.Constraints,
		path: Constraints.Path,
		patch: Partial<Constraint>,
	): Constraints.Constraints => HashMap.set(constraints, path, patch);
}
