import { Constraint } from '@conform-to/dom';
import * as Match from 'effect/Match';
import * as MutableHashMap from 'effect/MutableHashMap';
import * as Option from 'effect/Option';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import {
	bigintRefinement,
	dateRefinement,
	numberRefinement,
	stringRefinement,
} from './internal/refinements';

export function getEffectSchemaConstraint<Fields extends Schema.Struct.Fields>(
	schema: Schema.Struct<Fields>,
): Record<string, Constraint> {
	if (!AST.isTypeLiteral(schema.ast)) {
		throw new Error(
			'root schema must be a TypeLiteral AST node, e.g. Schema.Struct, instead got: ' +
				schema.ast._tag,
		);
	}

	function updateConstraint(
		ast: AST.AST,
		data: MutableHashMap.MutableHashMap<string, Constraint>,
		name: string = '',
	): void {
		Match.value(ast).pipe(
			Match.whenOr(
				AST.isStringKeyword, // Schema.String
				AST.isNumberKeyword, // Schema.Number
				AST.isBigIntKeyword, // Schema.BigIntFromSelf
				AST.isBooleanKeyword, // Schema.Boolean
				AST.isUndefinedKeyword, // Schema.Undefined
				() => {
					// for these AST nodes we do not need to process them further
				},
			),

			Match.whenOr(
				AST.isAnyKeyword, // Schema.Any
				AST.isNeverKeyword, // Schema.Never
				AST.isObjectKeyword, // Schema.Object
				AST.isSymbolKeyword, // Schema.SymbolFromSelf
				AST.isVoidKeyword, // Schema.Void
				AST.isUnknownKeyword, // Schema.Unknown,
				AST.isUniqueSymbol,
				(_) => {
					// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
					throw new Error(
						'Unsupported AST type for Constraint extraction AST: ' + _._tag,
					);
				},
			),

			Match.whenOr(
				AST.isLiteral, // string | number | boolean | null | bigint
				AST.isDeclaration,
				AST.isTemplateLiteral,
				AST.isEnums,
				() => {
					// for these AST nodes we do not need to process them further
				},
			),

			Match.when(
				AST.isTypeLiteral, // Schema.Struct
				({ propertySignatures }) => {
					propertySignatures.forEach(({ isOptional, name: _name, type }) => {
						const keyStruct = Match.value(name).pipe(
							Match.withReturnType<`${string}.${string}` | string>(),
							Match.when(
								Match.nonEmptyString,
								(parentPath) => `${parentPath}.${_name.toString()}`,
							),
							Match.orElse(() => _name.toString()),
						);

						const structData = MutableHashMap.modifyAt(
							data,
							keyStruct,
							(constraint) =>
								Option.some({
									...Option.getOrElse(constraint, Record.empty),
									required: !isOptional,
								}),
						);

						updateConstraint(type, structData, keyStruct);
					});
				},
			),

			Match.when(AST.isTupleType, ({ elements, rest }) => {
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

				if (elements.length === 0 && rest.length > 0) {
					// its an array such as [...elements: string[]]
					const keyNestedArray = `${name}[]` as const;

					const arrayData = MutableHashMap.modifyAt(data, name, (constraint) =>
						Option.some({
							...Option.getOrElse(constraint, Record.empty),
							multiple: true,
						}),
					);

					return rest.forEach((type) => {
						updateConstraint(
							type.type,
							MutableHashMap.set(arrayData, keyNestedArray, { required: true }),
							keyNestedArray,
						);
					});
				} else if (elements.length > 0 && rest.length >= 0) {
					// it is a tuple with possibly rest elements, such as [head: string, ...tail: number[]]

					return elements.forEach(({ isOptional, type }, idx) => {
						const tupleNestedKey = `${name}[${idx}]` as const;

						const tupleData = MutableHashMap.set(data, tupleNestedKey, {
							required: !isOptional,
						});

						updateConstraint(type, tupleData, tupleNestedKey);
					});
				}
			}),

			Match.when(AST.isUnion, ({ types }) => {
				types.forEach((member) => {
					updateConstraint(member, data, name);
				});
			}),

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

				const refinementData = MutableHashMap.modifyAt(
					data,
					name,
					(maybeConstraint) =>
						Option.some({
							...Option.getOrElse(maybeConstraint, Record.empty),
							...refinementConstraint,
						}),
				);

				updateConstraint(refinement.from, refinementData, name);
			}),

			// Unsupported AST types for Constraint extraction
			Match.whenOr(AST.isTransformation, AST.isSuspend, (_) => {
				throw new Error(`Unsupported AST type: ${_._tag}`);
			}),

			Match.exhaustive,
		);
	}

	const result = MutableHashMap.empty<string, Constraint>();
	updateConstraint(schema.ast, result);

	return Record.fromEntries(result);
}
