import { Constraint } from '@conform-to/dom';
import { hole } from 'effect/Function';
import * as Schema from 'effect/Schema';

export function getEffectSchemaConstraint<A, I>(
	_schema: Schema.Schema<A, I>,
): Record<string, Constraint> {
	return hole();
}
