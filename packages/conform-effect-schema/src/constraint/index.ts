import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import { makeVisitor } from './update-constraint';
import { Ctx, type NodeVisitor } from './types';

/**
 * A default, ready-to-use recursive visitor built by {@link makeVisitor}.
 *
 * Prefer this export for standard behavior. Use {@link makeVisitor} if
 * you need to customize traversal, add options, or inject alternate handlers.
 *
 * @see makeVisitor
 * @see NodeVisitor
 * @private
 */
const visitor: NodeVisitor = makeVisitor();

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

	return pipe(
		HashMap.empty<string, Constraint>(),
		visitor(Ctx.root())(schema.ast),
		Record.fromEntries,
	);
}
