import { Constraint } from '@conform-to/dom';
import { flow, pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as HashMap from 'effect/HashMap';
import * as Option from 'effect/Option';
import * as Record from 'effect/Record';
import * as Struct from 'effect/Struct';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import {
	bigintRefinement,
	dateRefinement,
	numberRefinement,
	stringRefinement,
} from './internal/refinements';

import {
	visitRefinement,
	visitTransformation,
	visitTupleType,
	visitUnion,
	visitTypeLiteral,
} from './internal/handlers';

import type { Rec } from './internal/types';

/**
 * Processes the Schema abstract syntax tree (AST) and generates a function that operates on a collection of constraints.
 * This operation takes an optional name and applies transformations to the provided data based on the AST.
 *
 * @param ast - The abstract syntax tree used for processing logic.
 * @param name - An optional identifier for the operation or processing context.
 * @returns A function that takes a HashMap of constraints as input and returns a transformed HashMap of constraints.
 * @internal
 */
const updateConstraint: Rec =
	(ast, name = '') =>
	(data) =>
		Match.value(ast).pipe(
			Match.withReturnType<HashMap.HashMap<string, Constraint>>(),

			// for these AST nodes we do not need to process them further
			Match.whenOr(
				AST.isStringKeyword, // Schema.String
				AST.isNumberKeyword, // Schema.Number
				AST.isBigIntKeyword, // Schema.BigIntFromSelf
				AST.isBooleanKeyword, // Schema.Boolean
				AST.isUndefinedKeyword, // Schema.Undefined
				() => data,
			),

			// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
			Match.whenOr(
				AST.isAnyKeyword, // Schema.Any
				AST.isNeverKeyword, // Schema.Never
				AST.isObjectKeyword, // Schema.Object
				AST.isSymbolKeyword, // Schema.SymbolFromSelf
				AST.isVoidKeyword, // Schema.Void
				AST.isUnknownKeyword, // Schema.Unknown,
				AST.isUniqueSymbol,
				(_) => {
					throw new Error(
						'Unsupported AST type for Constraint extraction AST: ' + _._tag,
					);
				},
			),

			// for these AST nodes we do not need to process them further
			Match.whenOr(
				AST.isLiteral, // string | number | boolean | null | bigint
				AST.isDeclaration,
				AST.isTemplateLiteral,
				AST.isEnums,
				() => data,
			),

			Match.when(
				AST.isTypeLiteral, // Schema.Struct | Schema.Record ??
				(ast) => visitTypeLiteral(updateConstraint)(ast, name)(data),
			),

			Match.when(
				AST.isTupleType,
				/**
				 * Schema.Array is represented as special case of Schema.Tuple where it is defined as [...rest: Schema.Any]
				 * we need to distinguish between Schema.Array and Schema.Tuple
				 * Schema.Array is a special case of Schema.Tuple where ast.elements is empty and ast.rest contains the element type
				 * need to set the filed name e.g. {'list[]': { required: true }}
				 */
				flow(
					Match.value<AST.TupleType>,
					Match.whenAnd(
						({ elements }) => elements.length === 0,
						({ rest }) => rest.length > 0,
						flow(
							Struct.get('rest')<AST.TupleType>,
							ReadonlyArray.reduce(
								HashMap.modifyAt(data, name, (constraint) =>
									Option.some({
										...Option.getOrElse(constraint, Record.empty),
										multiple: true,
									}),
								),
								(hashMap, type) =>
									pipe(
										HashMap.set(hashMap, `${name}[]`, { required: true }),
										updateConstraint(type.type, `${name}[]`),
									),
							),
						),
					),

					Match.whenAnd(
						({ elements }) => elements.length > 0,
						({ rest }) => rest.length >= 0,
						flow(
							Struct.get('elements')<AST.TupleType>,
							ReadonlyArray.reduce(data, (hashMap, { isOptional, type }, idx) =>
								pipe(
									HashMap.set(hashMap, `${name}[${idx}]`, {
										required: !isOptional,
									}),
									updateConstraint(type, `${name}[${idx}]`),
								),
							),
						),
					),

					Match.orElse(() => data),
				),
			),

			Match.when(
				AST.isUnion,
				flow(
					Struct.get('types')<AST.Union>,
					ReadonlyArray.reduce(data, (hashMap, member) => {
						// edge case to handle `Schema.Array(Schema.Literal('a', 'b', 'c'))` which should return a constraint of type:
						// `{ required: true, pattern: 'a|b|c' }`
						// if union of string literals ( eq to enums of strings e.g. Schema.Literal('a', 'b', 'c') )
						// it is contained by an array
						// meaning the ts type would equal to `Array<'a' | 'b' | 'c'>`
						// then we need to add the correct constraint to the hashmap:
						// a pattern constraint with the correct regex: e.g. /a|b|c/ .

						return pipe(hashMap, updateConstraint(member, name));
					}),
				),
			),

			Match.when(AST.isRefinement, (refinement) => {
				const refinementConstraint = Option.reduceCompact<
					Constraint,
					Constraint
				>(
					[
						stringRefinement(refinement),
						numberRefinement(refinement),
						bigintRefinement(refinement),
						dateRefinement(refinement),
					],
					{},
					(constraints, constraint) => ({ ...constraints, ...constraint }),
				);

				return pipe(
					HashMap.modifyAt(data, name, (maybeConstraint) =>
						Option.some({
							...Option.getOrElse(maybeConstraint, Record.empty),
							...refinementConstraint,
						}),
					),
					updateConstraint(refinement.from, name),
				);
			}),

			Match.when(AST.isTransformation, (transformation) =>
				pipe(data, updateConstraint(transformation.to, name)),
			),

			// Unsupported AST types for Constraint extraction
			Match.when(AST.isSuspend, (_) => {
				throw new Error(
					`TODO: add support for this AST Node type: "${_._tag}"`,
				);
			}),

			Match.exhaustive,
		);

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
	if (false && !AST.isTypeLiteral(schema.ast)) {
		throw new Error(
			'root schema must be a TypeLiteral AST node, e.g. Schema.Struct, instead got: ' +
				schema.ast._tag,
		);
	}

	return pipe(
		HashMap.empty<string, Constraint>(),
		updateConstraint(schema.ast),
		Record.fromEntries,
	);
}
