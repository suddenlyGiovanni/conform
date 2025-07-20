import { Constraint } from '@conform-to/dom';
import * as Equal from 'effect/Equal';
import { pipe } from 'effect/Function';
import * as MutableHashMap from 'effect/MutableHashMap';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import {
	bigintRefinement,
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
					const propertyKey = propertySignature.name as string;

					updateConstraint(
						propertySignature.type,
						MutableHashMap.modifyAt(data, propertyKey, (constraint) =>
							Option.some({
								...constraint.pipe(Option.getOrElse(() => ({}))),
								required: !propertySignature.isOptional,
							}),
						),
						name ? `${name}.${propertyKey}` : propertyKey,
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
					const arrayNestedKey = `${name}[]`;
					ast.rest.forEach((type) =>
						updateConstraint(
							type.type,
							pipe(
								data,
								MutableHashMap.modifyAt(name, (constraint) =>
									Option.some({
										...constraint.pipe(Option.getOrElse(() => ({}))),
										multiple: true,
									}),
								),
								(_) =>
									MutableHashMap.set(_, arrayNestedKey, { required: true }),
							),
							arrayNestedKey,
						),
					);
				} else if (ast.elements.length > 0 && ast.rest.length >= 0) {
					// it is a tuple with possibly rest elements, such as [head: string, ...tail: number[]]

					ast.elements.forEach((optionalType, idx) => {
						const tupleNestedKey = `${name}[${idx}]`;
						const required = !optionalType.isOptional;

						updateConstraint(
							optionalType.type,
							MutableHashMap.set(data, tupleNestedKey, { required }),
							tupleNestedKey,
						);
					});
				}

				break;
			}

			case 'Union':
				break;

			case 'Refinement': {
				// handle LessThanOrEqualToBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.lessThanOrEqualToBigInt(42n))
				pipe(
					AST.getSchemaIdAnnotation(ast),
					Option.filter(Equal.equals(Schema.LessThanOrEqualToBigIntSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							max: bigint;
						}>(ast, Schema.LessThanOrEqualToBigIntSchemaId),
					),
					Option.filter(Predicate.hasProperty('max')),
					Option.filter(Predicate.struct({ max: Predicate.isBigInt })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ max }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									max: max as unknown as number, // cast bigint type to number as the Constraint type does not support bigint
								}),
							);
							return Option.void;
						},
					}),
				);

				// handle BetweenBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.betweenBigInt(-2n, 2n))
				pipe(
					AST.getSchemaIdAnnotation(ast),
					Option.filter(Equal.equals(Schema.BetweenBigIntSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							max: bigint;
							min: bigint;
						}>(ast, Schema.BetweenBigIntSchemaId),
					),
					Option.filter(
						pipe(
							Predicate.hasProperty('max'),
							Predicate.and(Predicate.hasProperty('max')),
						),
					),
					Option.filter(
						Predicate.struct({
							max: Predicate.isBigInt,
							min: Predicate.isBigInt,
						}),
					),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ max, min }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									max: max as unknown as number, // cast bigint type to number as the Constraint type does not support bigint
									min: min as unknown as number, // cast bigint type to number as the Constraint type does not support bigint
								}),
							);
							return Option.void;
						},
					}),
				);

				// handle GreaterThanDateSchemaId e.g. Schema.Date.pipe(Schema.greaterThanDate(new Date(1)))
				pipe(
					AST.getSchemaIdAnnotation(ast),
					Option.filter(Equal.equals(Schema.GreaterThanDateSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							min: Date;
						}>(ast, Schema.GreaterThanDateSchemaId),
					),
					Option.filter(Predicate.hasProperty('min')),
					Option.filter(Predicate.struct({ min: Predicate.isDate })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ min }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									min: min.toISOString().split('T')[0],
								}),
							);
							return Option.void;
						},
					}),
				);

				// handle GreaterThanDateSchemaId e.g. Schema.Date.pipe(Schema.greaterThanDate(new Date(1)))
				pipe(
					AST.getSchemaIdAnnotation(ast),
					Option.filter(Equal.equals(Schema.GreaterThanOrEqualToDateSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							min: Date;
						}>(ast, Schema.GreaterThanOrEqualToDateSchemaId),
					),
					Option.filter(Predicate.hasProperty('min')),
					Option.filter(Predicate.struct({ min: Predicate.isDate })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ min }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									min: min.toISOString().split('T')[0],
								}),
							);
							return Option.void;
						},
					}),
				);

				// handle LessThanDateSchemaId e.g. Schema.DateFromSelf.pipe(Schema.lessThanDate(new Date(1)))
				pipe(
					AST.getSchemaIdAnnotation(ast),
					Option.filter(Equal.equals(Schema.LessThanDateSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							max: Date;
						}>(ast, Schema.LessThanDateSchemaId),
					),
					Option.filter(Predicate.hasProperty('max')),
					Option.filter(Predicate.struct({ max: Predicate.isDate })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ max }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									max: max.toISOString().split('T')[0],
								}),
							);

							return Option.void;
						},
					}),
				);

				// handle LessThanOrEqualToDateSchemaId e.g. Schema.DateFromSelf.pipe(Schema.lessThanOrEqualToDate(new Date(1)))
				pipe(
					AST.getSchemaIdAnnotation(ast),
					Option.filter(Equal.equals(Schema.LessThanOrEqualToDateSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							max: Date;
						}>(ast, Schema.LessThanOrEqualToDateSchemaId),
					),
					Option.filter(Predicate.hasProperty('max')),
					Option.filter(Predicate.struct({ max: Predicate.isDate })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ max }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									max: max.toISOString().split('T')[0],
								}),
							);

							return Option.void;
						},
					}),
				);

				// handle BetweenDateSchemaId e.g. Schema.DateFromSelf.pipe(Schema.betweenDate(new Date(1), new Date(2)))
				pipe(
					AST.getSchemaIdAnnotation(ast),
					Option.filter(Equal.equals(Schema.BetweenDateSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							max: Date;
							min: Date;
						}>(ast, Schema.BetweenDateSchemaId),
					),
					Option.filter(
						pipe(
							Predicate.hasProperty('min'),
							Predicate.and(Predicate.hasProperty('max')),
						),
					),
					Option.filter(
						Predicate.struct({
							min: Predicate.isDate,
							max: Predicate.isDate,
						}),
					),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ max, min }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									max: max.toISOString().split('T')[0],
									min: min.toISOString().split('T')[0],
								}),
							);
							return Option.void;
						},
					}),
				);

				// done refining the ast, now recursively continue to process the `from` AST part
				updateConstraint(
					ast.from,
					MutableHashMap.modifyAt(data, name, (maybeConstraint) =>
						Option.some({
							...maybeConstraint.pipe(Option.getOrElse(() => ({}))),
							...Option.reduceCompact(
								[
									stringRefinement(ast),
									numberRefinement(ast),
									bigintRefinement(ast),
								],
								{} as Constraint,
								(constraints, constraint) => ({
									...constraints,
									...constraint,
								}),
							),
						}),
					),
					name,
				);
				break;
			}

			default:
				throw new Error(`Unsupported AST type: ${ast._tag}`);
		}
	}

	const result = MutableHashMap.empty<string, Constraint>();
	updateConstraint(schema.ast, result);

	return result.pipe((hm) => Record.fromEntries(hm));
}
