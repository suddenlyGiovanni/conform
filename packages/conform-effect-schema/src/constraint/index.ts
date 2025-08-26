import { Constraint } from '@conform-to/dom';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';

import { makeSchemaAstConstraintVisitor } from './make-schema-ast-constraint-visitor';
import { Ctx } from './ctx';
import { Constraints } from './constraints';

export const getEffectSchemaConstraint = <A, I>(
	schema: Schema.Schema<A, I>,
): Record<string, Constraint> =>
	pipe(
		makeSchemaAstConstraintVisitor(),
		(visit) => visit(Ctx.Root(), schema.ast, Constraints.empty()),
		Either.getOrThrowWith((error) => {
			throw error;
		}),
		Constraints.toRecord,
	);
