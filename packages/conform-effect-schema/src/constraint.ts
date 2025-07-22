import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
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

/**
 * Processes the Schema abstract syntax tree (AST) and generates a function that operates on a collection of constraints.
 * This operation takes an optional name and applies transformations to the provided data based on the AST.
 *
 * @param ast - The abstract syntax tree used for processing logic.
 * @param name - An optional identifier for the operation or processing context.
 * @returns A function that takes a HashMap of constraints as input and returns a transformed HashMap of constraints.
 * @internal
 */
const updateConstraint: {
	(
		ast: AST.AST,
		name?: string,
	): (
		data: HashMap.HashMap<string, Constraint>,
	) => HashMap.HashMap<string, Constraint>;
} =
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
				AST.isTypeLiteral, // Schema.Struct
				(typeLiteral) =>
					pipe(
						typeLiteral,
						Struct.get('propertySignatures'),
						ReadonlyArray.reduce(
							data,
							(hashMap, { isOptional, name: _name, type }) => {
								const key = Match.value(name).pipe(
									Match.withReturnType<`${string}.${string}` | string>(),
									Match.when(
										Match.nonEmptyString,
										(parentPath) => `${parentPath}.${_name.toString()}`,
									),
									Match.orElse(() => _name.toString()),
								);

								return pipe(
									HashMap.modifyAt(hashMap, key, (constraint) =>
										Option.some({
											...Option.getOrElse(constraint, Record.empty),
											required: !isOptional,
										}),
									),
									updateConstraint(type, key),
								);
							},
						),
					),
			),

			Match.when(AST.isTupleType, (tupleType) => {
				// Schema.Array is represented as special case of Schema.Tuple where it is defined as [...rest: Schema.Any]
				// we need to distinguish between Schema.Array and Schema.Tuple
				// Schema.Array is a special case of Schema.Tuple where ast.elements is empty and ast.rest contains the element type
				// need to set the filed name e.g. {'list[]': { required: true }}

				// let requiredTypes: Array<AST.Type> = ast.elements.filter(
				// 	(e) => !e.isOptional,
				// );
				// if (ast.rest.length > 0) {
				// 	requiredTypes = requiredTypes.concat(ast.rest.slice(1));
				// }

				if (tupleType.elements.length === 0 && tupleType.rest.length > 0) {
					// its an array such as [...elements: string[]]
					const key = `${name}[]` as const;

					return pipe(
						tupleType,
						Struct.get('rest'),
						ReadonlyArray.reduce(
							HashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...Option.getOrElse(constraint, Record.empty),
									multiple: true,
								}),
							),
							(hashMap, type) =>
								pipe(
									HashMap.set(hashMap, key, { required: true }),
									updateConstraint(type.type, key),
								),
						),
					);
				}

				if (tupleType.elements.length > 0 && tupleType.rest.length >= 0) {
					// it is a tuple with possibly rest elements, such as [head: string, ...tail: number[]]

					return pipe(
						tupleType,
						Struct.get('elements'),
						ReadonlyArray.reduce(data, (hashMap, { isOptional, type }, idx) =>
							pipe(
								HashMap.set(hashMap, `${name}[${idx}]`, {
									required: !isOptional,
								}),
								updateConstraint(type, `${name}[${idx}]`),
							),
						),
					);
				}

				return data;
			}),

			Match.when(AST.isUnion, (union) =>
				pipe(
					union,
					Struct.get('types'),
					ReadonlyArray.reduce(data, (hashMap, member) =>
						updateConstraint(member, name)(hashMap),
					),
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

			// Unsupported AST types for Constraint extraction
			Match.whenOr(AST.isTransformation, AST.isSuspend, (_) => {
				throw new Error(
					`TODO: add support for this AST Node type: "${_._tag}"`,
				);
			}),

			Match.exhaustive,
		);

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
		updateConstraint(schema.ast),
		Record.fromEntries,
	);
}
