import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
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

	const updateConstraint = (
		ast: AST.AST,
		data: MutableHashMap.MutableHashMap<string, Constraint>,
		name: string = '',
	): MutableHashMap.MutableHashMap<string, Constraint> =>
		Match.value(ast).pipe(
			Match.withReturnType<MutableHashMap.MutableHashMap<string, Constraint>>(),

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
				({ propertySignatures }) => {
					let _data = data;
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
							_data,
							keyStruct,
							(constraint) =>
								Option.some({
									...Option.getOrElse(constraint, Record.empty),
									required: !isOptional,
								}),
						);

						_data = updateConstraint(type, structData, keyStruct);
					});

					return _data;
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

					let _data = MutableHashMap.modifyAt(data, name, (constraint) =>
						Option.some({
							...Option.getOrElse(constraint, Record.empty),
							multiple: true,
						}),
					);

					rest.forEach((type) => {
						_data = updateConstraint(
							type.type,
							MutableHashMap.set(_data, keyNestedArray, { required: true }),
							keyNestedArray,
						);
					});
					return _data;
				} else if (elements.length > 0 && rest.length >= 0) {
					// it is a tuple with possibly rest elements, such as [head: string, ...tail: number[]]

					let _data = data;

					elements.forEach(({ isOptional, type }, idx) => {
						const tupleNestedKey = `${name}[${idx}]` as const;

						const tupleData = MutableHashMap.set(_data, tupleNestedKey, {
							required: !isOptional,
						});

						_data = updateConstraint(type, tupleData, tupleNestedKey);
					});
					return _data;
				}
				return data;
			}),

			Match.when(AST.isUnion, ({ types }) => {
				let _data = data;
				types.forEach((member) => {
					_data = updateConstraint(member, _data, name);
				});
				return _data;
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

				return updateConstraint(refinement.from, refinementData, name);
			}),

			// Unsupported AST types for Constraint extraction
			Match.whenOr(AST.isTransformation, AST.isSuspend, (_) => {
				throw new Error(
					`TODO: add support for this AST Node type: "${_._tag}"`,
				);
			}),

			Match.exhaustive,
		);

	return pipe(
		MutableHashMap.empty<string, Constraint>(),
		(data) => updateConstraint(schema.ast, data, ''),
		Record.fromEntries,
	);
}
