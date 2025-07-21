import { Constraint } from '@conform-to/dom';
import * as Match from 'effect/Match';
import { pipe } from 'effect/Function';
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
		switch (ast._tag) {
			case 'StringKeyword': // Schema.String
			case 'NumberKeyword': // Schema.Number
			case 'BigIntKeyword': // Schema.BigIntFromSelf
			case 'BooleanKeyword': // Schema.Boolean
				break;
			case 'AnyKeyword': // Schema.Any
			case 'NeverKeyword': // Schema.Never
			case 'ObjectKeyword': // Schema.Object
			case 'SymbolKeyword': // Schema.SymbolFromSelf
			case 'VoidKeyword': // Schema.Void
			case 'UnknownKeyword': // Schema.Unknown
			case 'UndefinedKeyword': // Schema.Undefined
				throw new Error(
					'Unsupported AST type for Constraint extraction AST: ' + ast._tag,
				);
			case 'Literal': // string | number | boolean | null | bigint
			case 'Declaration':
			case 'TemplateLiteral':
			case 'Enums':
				break;
			case 'TypeLiteral': {
				// a Schema.Struct is a TypeLiteral AST node
				ast.propertySignatures.forEach((propertySignature) => {
					const keyStruct = Match.value(name).pipe(
						Match.withReturnType<`${string}.${string}` | string>(),
						Match.when(
							Match.nonEmptyString,
							(parentPath) =>
								`${parentPath}.${propertySignature.name.toString()}`,
						),
						Match.orElse(() => propertySignature.name.toString()),
					);

					const structData = MutableHashMap.modifyAt(
						data,
						keyStruct,
						(constraint) =>
							Option.some({
								...Option.getOrElse(constraint, Record.empty),
								required: !propertySignature.isOptional,
							}),
					);

					return updateConstraint(
						propertySignature.type,
						structData,
						keyStruct,
					);
				});
				break;
			}
			case 'TupleType': {
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

				if (ast.elements.length === 0 && ast.rest.length > 0) {
					// its an array such as [...elements: string[]]
					const keyNestedArray = `${name}[]` as const;

					const arrayData = MutableHashMap.modifyAt(data, name, (constraint) =>
						Option.some({
							...Option.getOrElse(constraint, Record.empty),
							multiple: true,
						}),
					);

					ast.rest.forEach((type) =>
						updateConstraint(
							type.type,
							MutableHashMap.set(arrayData, keyNestedArray, { required: true }),
							keyNestedArray,
						),
					);
				} else if (ast.elements.length > 0 && ast.rest.length >= 0) {
					// it is a tuple with possibly rest elements, such as [head: string, ...tail: number[]]

					ast.elements.forEach((optionalType, idx) => {
						const tupleNestedKey = `${name}[${idx}]` as const;

						const tupleData = MutableHashMap.set(data, tupleNestedKey, {
							required: !optionalType.isOptional,
						});

						return updateConstraint(
							optionalType.type,
							tupleData,
							tupleNestedKey,
						);
					});
				}

				break;
			}

			case 'Union':
				break;

			case 'Refinement': {
				const refinementConstraint = Option.reduceCompact<
					Constraint,
					Constraint
				>(
					[
						stringRefinement(ast),
						numberRefinement(ast),
						bigintRefinement(ast),
						dateRefinement(ast),
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

				return updateConstraint(ast.from, refinementData, name);
			}

			default:
				throw new Error(`Unsupported AST type: ${ast._tag}`);
		}
	}

	const result = MutableHashMap.empty<string, Constraint>();
	updateConstraint(schema.ast, result);

	return Record.fromEntries(result);
}
