import { Constraint } from '@conform-to/dom';
import { Match } from 'effect';
import { pipe } from 'effect/Function';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';
import * as AST from 'effect/SchemaAST';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Equal from 'effect/Equal';
import * as MutableHashMap from 'effect/MutableHashMap';

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
				// handle refinements
				const maybeSchemaIdAnnotation = AST.getSchemaIdAnnotation(ast);
				const maybeJsonSchemaAnnotation = AST.getJSONSchemaAnnotation(ast);

				const constraintOption: Option.Option<Constraint> = pipe(
					maybeSchemaIdAnnotation,
					Option.flatMap((schemaIdAnnotation) =>
						Match.value(schemaIdAnnotation).pipe(
							Match.when(Schema.MinLengthSchemaId, () =>
								pipe(
									maybeJsonSchemaAnnotation,
									Option.filter(Predicate.hasProperty('minLength')),
									Option.filter(
										Predicate.struct({ minLength: Predicate.isNumber }),
									),
									Option.map(({ minLength }): Constraint => ({ minLength })),
								),
							),

							Match.when(Schema.MaxLengthSchemaId, () =>
								pipe(
									maybeJsonSchemaAnnotation,
									Option.filter(Predicate.hasProperty('maxLength')),
									Option.filter(
										Predicate.struct({ maxLength: Predicate.isNumber }),
									),
									Option.map(({ maxLength }): Constraint => ({ maxLength })),
								),
							),

							Match.when(
								// handle LengthSchemaId refinement (length) e.g. Schema.String.pipe(Schema.length(100))
								Schema.LengthSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(
											pipe(
												Predicate.hasProperty('minLength'),
												Predicate.and(Predicate.hasProperty('maxLength')),
											),
										),
										Option.filter(
											Predicate.struct({
												minLength: Predicate.isNumber,
												maxLength: Predicate.isNumber,
											}),
										),
										Option.map(
											({ maxLength, minLength }): Constraint => ({
												maxLength,
												minLength,
											}),
										),
									),
							),

							Match.when(
								// handle PatternSchemaId e.g. Schema.String.pipe(Schema.pattern(/regex/))
								Schema.PatternSchemaId,
								() =>
									pipe(
										AST.getAnnotation<{
											regex: RegExp;
										}>(ast, Schema.PatternSchemaId),
										Option.filter(Predicate.hasProperty('regex')),
										Option.filter(
											Predicate.struct({ regex: Predicate.isRegExp }),
										),
										Option.map(
											({ regex }): Constraint => ({ pattern: regex.source }),
										),
									),
							),

							Match.when(
								// handle StartsWithSchemaId e.g. Schema.String.pipe(Schema.startsWith('prefix'))
								Schema.StartsWithSchemaId,
								() =>
									pipe(
										AST.getAnnotation<{
											startsWith: string;
										}>(ast, Schema.StartsWithSchemaId),
										Option.filter(Predicate.hasProperty('startsWith')),
										Option.filter(
											Predicate.struct({ startsWith: Predicate.isString }),
										),
										Option.map(
											({ startsWith }): Constraint => ({
												pattern: new RegExp(`^${startsWith}`).source,
											}),
										),
									),
							),

							Match.when(
								// handle EndsWithSchemaId e.g. Schema.String.pipe(Schema.endsWith('suffix'))
								Schema.EndsWithSchemaId,
								() =>
									pipe(
										AST.getAnnotation<{
											endsWith: string;
										}>(ast, Schema.EndsWithSchemaId),
										Option.filter(Predicate.hasProperty('endsWith')),
										Option.filter(
											Predicate.struct({ endsWith: Predicate.isString }),
										),
										Option.map(
											({ endsWith }): Constraint => ({
												pattern: new RegExp(`^.*${endsWith}$`).source,
											}),
										),
									),
							),

							Match.when(
								// handle IncludesSchemaId e.g. Schema.String.pipe(Schema.includes('substring'))
								Schema.IncludesSchemaId,
								() =>
									pipe(
										AST.getAnnotation<{
											includes: string;
										}>(ast, Schema.IncludesSchemaId),
										Option.filter(Predicate.hasProperty('includes')),
										Option.filter(
											Predicate.struct({ includes: Predicate.isString }),
										),
										Option.map(
											({ includes }): Constraint => ({
												pattern: new RegExp(`.*${includes}.*`).source,
											}),
										),
									),
							),

							Match.when(
								// handle TrimmedSchemaId e.g. Schema.String.pipe(Schema.trimmed())
								Schema.TrimmedSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('pattern')),
										Option.filter(
											Predicate.struct({ pattern: Predicate.isString }),
										),
										Option.map(Struct.pick('pattern')),
									),
							),

							Match.when(
								// handle LowercasedSchemaId e.g. Schema.String.pipe(Schema.lowercased())
								Schema.LowercasedSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('pattern')),
										Option.filter(
											Predicate.struct({ pattern: Predicate.isString }),
										),
										Option.map(Struct.pick('pattern')),
									),
							),

							Match.when(
								// handle UppercasedSchemaId e.g. Schema.String.pipe(Schema.uppercased())
								Schema.UppercasedSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('pattern')),
										Option.filter(
											Predicate.struct({ pattern: Predicate.isString }),
										),
										Option.map(Struct.pick('pattern')),
									),
							),

							Match.when(
								// handle CapitalizedSchemaId e.g. Schema.String.pipe(Schema.capitalized())
								Schema.CapitalizedSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('pattern')),
										Option.filter(
											Predicate.struct({ pattern: Predicate.isString }),
										),
										Option.map(Struct.pick('pattern')),
									),
							),

							Match.when(
								// handle UncapitalizedSchemaId e.g. Schema.String.pipe(Schema.uncapitalized())
								Schema.UncapitalizedSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('pattern')),
										Option.filter(
											Predicate.struct({ pattern: Predicate.isString }),
										),
										Option.map(Struct.pick('pattern')),
									),
							),

							Match.when(
								// handle GreaterThanSchemaId e.g. Schema.Number.pipe(Schema.greaterThan(10))
								Schema.GreaterThanSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('exclusiveMinimum')),
										Option.filter(
											Predicate.struct({
												exclusiveMinimum: Predicate.isNumber,
											}),
										),
										Option.map(
											({ exclusiveMinimum }): Constraint => ({
												min: exclusiveMinimum,
											}),
										),
									),
							),

							Match.when(
								// handle GreaterThanOrEqualToSchemaId e.g. Schema.Number.pipe(Schema.greaterThanOrEqualTo(10))
								Schema.GreaterThanOrEqualToSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('minimum')),
										Option.filter(
											Predicate.struct({
												minimum: Predicate.isNumber,
											}),
										),
										Option.map(
											({ minimum }): Constraint => ({
												min: minimum,
											}),
										),
									),
							),

							Match.when(
								// handle LessThanSchemaId e.g. Schema.Number.pipe(Schema.lessThan(10))
								Schema.LessThanSchemaId,
								() =>
									pipe(
										maybeJsonSchemaAnnotation,
										Option.filter(Predicate.hasProperty('exclusiveMaximum')),
										Option.filter(
											Predicate.struct({
												exclusiveMaximum: Predicate.isNumber,
											}),
										),
										Option.map(
											({ exclusiveMaximum }): Constraint => ({
												max: exclusiveMaximum,
											}),
										),
									),
							),

							Match.orElse(() => Option.none()),
						),
					),
				);

				// handle LessThanOrEqualToSchemaId e.g. Schema.Number.pipe(Schema.lessThanOrEqualTo(10))
				pipe(
					maybeSchemaIdAnnotation,
					Option.filter(Equal.equals(Schema.LessThanOrEqualToSchemaId)),
					Option.andThen(maybeJsonSchemaAnnotation),
					Option.filter(Predicate.hasProperty('maximum')),
					Option.filter(Predicate.struct({ maximum: Predicate.isNumber })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ maximum }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									max: maximum,
								}),
							);
							return Option.void;
						},
					}),
				);

				// handle BetweenSchemaId e.g. Schema.Number.pipe(Schema.between(10, 20))
				pipe(
					maybeSchemaIdAnnotation,
					Option.filter(Equal.equals(Schema.BetweenSchemaId)),
					Option.andThen(maybeJsonSchemaAnnotation),
					Option.filter(
						pipe(
							Predicate.hasProperty('minimum'),
							Predicate.and(Predicate.hasProperty('maximum')),
						),
					),
					Option.filter(
						Predicate.struct({
							minimum: Predicate.isNumber,
							maximum: Predicate.isNumber,
						}),
					),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ maximum, minimum }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									max: maximum,
									min: minimum,
								}),
							);
							return Option.void;
						},
					}),
				);

				// handle MultipleOfSchemaId e.g. Schema.Number.pipe(Schema.multipleOf(5))
				pipe(
					maybeSchemaIdAnnotation,
					Option.filter(Equal.equals(Schema.MultipleOfSchemaId)),
					Option.andThen(maybeJsonSchemaAnnotation),
					Option.filter(Predicate.hasProperty('multipleOf')),
					Option.filter(Predicate.struct({ multipleOf: Predicate.isNumber })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ multipleOf }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									step: multipleOf,
								}),
							);

							return Option.void;
						},
					}),
				);

				// handle GreaterThanBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.greaterThanBigInt(10n))
				pipe(
					maybeSchemaIdAnnotation,
					Option.filter(Equal.equals(Schema.GreaterThanBigIntSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							min: bigint;
						}>(ast, Schema.GreaterThanBigIntSchemaId),
					),
					Option.filter(Predicate.hasProperty('min')),
					Option.filter(Predicate.struct({ min: Predicate.isBigInt })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ min }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									min: min as unknown as number, // cast bigint type to number as the Constraint type does not support bigint
								}),
							);

							return Option.void;
						},
					}),
				);

				// handle GreaterThanOrEqualToBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.greaterThanOrEqualToBigInt(10n))
				pipe(
					maybeSchemaIdAnnotation,
					Option.filter(
						Equal.equals(Schema.GreaterThanOrEqualToBigIntSchemaId),
					),
					Option.andThen(() =>
						AST.getAnnotation<{
							min: bigint;
						}>(ast, Schema.GreaterThanOrEqualToBigIntSchemaId),
					),
					Option.filter(Predicate.hasProperty('min')),
					Option.filter(Predicate.struct({ min: Predicate.isBigInt })),
					Option.match({
						onNone: () => Option.none(),
						onSome: ({ min }) => {
							MutableHashMap.modifyAt(data, name, (constraint) =>
								Option.some({
									...constraint.pipe(Option.getOrElse(() => ({}))),
									min: min as unknown as number, // cast bigint type to number as the Constraint type does not support bigint
								}),
							);
							return Option.void;
						},
					}),
				);

				// handle LessThanBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.lessThanBigInt(10n))
				pipe(
					maybeSchemaIdAnnotation,
					Option.filter(Equal.equals(Schema.LessThanBigIntSchemaId)),
					Option.andThen(() =>
						AST.getAnnotation<{
							max: bigint;
						}>(ast, Schema.LessThanBigIntSchemaId),
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

				// handle LessThanOrEqualToBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.lessThanOrEqualToBigInt(42n))
				pipe(
					maybeSchemaIdAnnotation,
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
					maybeSchemaIdAnnotation,
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
					maybeSchemaIdAnnotation,
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
					maybeSchemaIdAnnotation,
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
					maybeSchemaIdAnnotation,
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
					maybeSchemaIdAnnotation,
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
					maybeSchemaIdAnnotation,
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
					pipe(
						constraintOption,
						Option.match({
							onNone: () => data,
							onSome: (refinementConstraint) =>
								MutableHashMap.modifyAt(data, name, (constraint) =>
									Option.some({
										...constraint.pipe(Option.getOrElse(() => ({}))),
										...refinementConstraint,
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
