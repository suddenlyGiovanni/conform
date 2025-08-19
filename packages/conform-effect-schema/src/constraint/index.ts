import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import { makeUpdateConstraint } from './update-constraint';
import { Ctx } from './types';

/**
 * A default, ready-to-use recursive updater built by {@link makeUpdateConstraint}.
 *
 * Prefer this export for standard behavior. Use {@link makeUpdateConstraint} if
 * you need to customize traversal, add options, or inject alternate handlers.
 *
 * @see makeUpdateConstraint
 * @see Rec
 * @private
 */
const updateConstraint = makeUpdateConstraint();

/**
 * Traverses a Schema AST and materializes a Record<string, Constraint> describing
 * HTML-like input constraints inferred from the schema (e.g., required, min/max,
 * minLength/maxLength, pattern, multiple).
 *
 * @example
 * const schema = Schema.Struct({
 *   email: Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+$/)),
 *   tags: Schema.Array(Schema.String)
 * });
 * const constraints = index(schema);
 * // {
 * //   email: { required: true, pattern: '^[^@]+@[^@]+$' },
 * //   tags: { required: true, multiple: true },
 * //   'tags[]': { required: true }
 * // }
 *
 * @param schema - A Struct schema whose AST will be traversed.
 * @returns A plain Record of constraints keyed by logical field path.
 * @throws Error If the root schema is not a TypeLiteral/Struct (when enforced).
 * @public
 */
export function getEffectSchemaConstraint<Fields extends Schema.Struct.Fields>(
	schema: Schema.Struct<Fields>,
): Record<string, Constraint> {
	if (!AST.isTypeLiteral(schema.ast)) {
		throw new Error(
			'root schema must be a TypeLiteral AST node, e.g. Schema.Struct, instead got: ' +
				schema.ast._tag,
		);
	}

	const rootCtx = Ctx.make({ path: '' });

	return pipe(
		HashMap.empty<string, Constraint>(),
		updateConstraint(schema.ast, rootCtx),
		Record.fromEntries,
	);
}
