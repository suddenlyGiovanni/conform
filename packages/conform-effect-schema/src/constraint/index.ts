import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import { makeSchemaAstConstraintVisitor } from './make-schema-ast-constraint-visitor';
import { type NodeVisitor } from './types';
import * as Ctx from './ctx';
import { Constraints } from './constraints';

/**
 * A default, ready-to-use recursive visitor built by {@link makeSchemaAstConstraintVisitor}.
 *
 * Prefer this export for standard behavior. Use {@link makeSchemaAstConstraintVisitor} if
 * you need to customize traversal, add options, or inject alternate handlers.
 *
 * @see makeSchemaAstConstraintVisitor
 * @see NodeVisitor
 * @private
 */
const schemaAstConstraintVisitor: NodeVisitor<AST.AST> =
	makeSchemaAstConstraintVisitor();

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
 * const constraints = getEffectSchemaConstraint(schema);
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
	const ast = schema.ast;

	if (!AST.isTypeLiteral(ast)) {
		throw new Error(
			`root schema must be a TypeLiteral AST node (e.g. Schema.Struct), instead got: ${ast._tag}`,
		);
	}

	const constraintsEndo = schemaAstConstraintVisitor(Ctx.root())(ast);

	return pipe(Constraints.empty(), constraintsEndo, Constraints.toRecord);
}
