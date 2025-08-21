import type { Constraint } from '@conform-to/dom';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Constraints {
	type Type = HashMap.HashMap<string, Constraint>;
}

export class Constraints {
	/**
	 * Construct an empty constraints collection.
	 * @private
	 */

	static empty = (): Constraints.Type => HashMap.empty<string, Constraint>();

	/**
	 * Materialize a constraints collection to a plain record.
	 * @private
	 */
	static toRecord = (
		constraints: Constraints.Type,
	): Record.ReadonlyRecord<string, Constraint> =>
		Record.fromEntries(constraints);
}
