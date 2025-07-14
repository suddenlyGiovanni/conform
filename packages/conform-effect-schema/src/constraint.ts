import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Equal from 'effect/Equal';
import {
	BetweenDateSchemaId,
	GreaterThanOrEqualToDateSchemaId,
	LessThanOrEqualToDateSchemaId,
} from 'effect/src/Schema';

export function getEffectSchemaConstraint<Fields extends Schema.Struct.Fields>(
	schema: Schema.Struct<Fields>,
): Record<string, Constraint> {
	const isStruct = Schema.is(
		Schema.Struct<Fields>({} as any), // cast here because we only want to check that the input schema is a Struct,
	);

	const result: Record<string, Constraint> = {};

	// add a runtime check to ensure the schema is a Struct and we are not fooling the type system
	if (!isStruct(schema)) throw new Error('Expected a Struct schema');

	for (const [fieldName, fieldSchema] of Object.entries(
		schema.fields,
	) as unknown as [string, Schema.Struct.Field][]) {
		result[fieldName] = extractConstraints(fieldSchema);
	}

	return result;
}

function extractConstraints(fieldSchema: Schema.Struct.Field): Constraint {
	const constraints: Constraint = {};

	processAST(fieldSchema.ast, constraints);

	return constraints;
}

function processAST(
	ast: Schema.Struct.Field['ast'],
	mutableConstraint: Constraint,
): void {
	// should I provide defaults for mutableConstraint?
	if (ast._tag === 'PropertySignatureDeclaration') {
		// handle PropertySignatureDeclaration
		mutableConstraint.required = !ast.isOptional;
	} else if (ast._tag === 'PropertySignatureTransformation') {
		// handle PropertySignatureTransformation
	} else if (AST.isStringKeyword(ast)) {
		// it's a Schema.String with no transformations
		mutableConstraint.required = true;
	} else if (AST.isNumberKeyword(ast)) {
		// it's a Schema.Number with no transformations
		mutableConstraint.required = true;
	} else if (AST.isBigIntKeyword(ast)) {
		// it's a Schema.BigInt with no transformations
		mutableConstraint.required = true;
	} else if (AST.isBooleanKeyword(ast)) {
		// it's a Schema.Boolean with no transformations
	} else if (AST.isDeclaration(ast)) {
		// it's a declaration
		// match the declaration type e.g Schema.DateFromSelf
		AST.getSchemaIdAnnotation(ast).pipe(
			Option.match({
				onNone: () => {},
				onSome: (schemaId) => {
					switch (schemaId) {
						case Schema.DateFromSelfSchemaId:
							mutableConstraint.required = true;
							break;
						default:
							// do nothing for other schema IDs
							break;
					}
				},
			}),
		);
	} else if (AST.isRefinement(ast)) {
		// handle refinements
		extractRefinementConstraints(ast, mutableConstraint);
		// continue to process the `from` AST part
		processAST(ast.from, mutableConstraint);
	}
}

function extractRefinementConstraints(
	refinement: AST.Refinement,
	mutableConstraint: Constraint,
): void {
	const maybeSchemaIdAnnotation = AST.getSchemaIdAnnotation(refinement);
	const maybeJsonSchemaAnnotation = AST.getJSONSchemaAnnotation(refinement);

	// handle MinLengthSchemaId refinement (minLength) e.g. Schema.String.pipe(Schema.minLength(5))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.MinLengthSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('minLength')),
		Option.filter(Predicate.struct({ minLength: Predicate.isNumber })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ minLength }) => {
				mutableConstraint.minLength = minLength;
				return Option.void;
			},
		}),
	);

	// handle MaxLengthSchemaId refinement (maxLength) e.g. Schema.String.pipe(Schema.maxLength(42))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.MaxLengthSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('maxLength')),
		Option.filter(Predicate.struct({ maxLength: Predicate.isNumber })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ maxLength }) => {
				mutableConstraint.maxLength = maxLength;
				return Option.void;
			},
		}),
	);

	// handle LengthSchemaId refinement (length) e.g. Schema.String.pipe(Schema.length(100))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.LengthSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
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
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ maxLength, minLength }) => {
				mutableConstraint.maxLength = maxLength;
				mutableConstraint.minLength = minLength;
				return Option.void;
			},
		}),
	);

	// handle PatternSchemaId e.g. Schema.String.pipe(Schema.pattern(/regex/))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.PatternSchemaId)),
		Option.andThen(AST.getAnnotation(refinement, Schema.PatternSchemaId)),
		Option.filter(Predicate.hasProperty('regex')),
		Option.filter(Predicate.struct({ regex: Predicate.isRegExp })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ regex }) => {
				mutableConstraint.pattern = regex.source;
				return Option.void;
			},
		}),
	);

	// handle StartsWithSchemaId e.g. Schema.String.pipe(Schema.startsWith('prefix'))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.StartsWithSchemaId)),
		Option.andThen(AST.getAnnotation(refinement, Schema.StartsWithSchemaId)),
		Option.filter(Predicate.hasProperty('startsWith')),
		Option.filter(Predicate.struct({ startsWith: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ startsWith }) => {
				mutableConstraint.pattern = new RegExp(`^${startsWith}`).source;
				return Option.void;
			},
		}),
	);

	// handle EndsWithSchemaId e.g. Schema.String.pipe(Schema.endsWith('suffix'))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.EndsWithSchemaId)),
		Option.andThen(AST.getAnnotation(refinement, Schema.EndsWithSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('pattern')),
		Option.filter(Predicate.struct({ pattern: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ pattern }) => {
				mutableConstraint.pattern = pattern;
				return Option.void;
			},
		}),
	);

	// handle IncludesSchemaId e.g. Schema.String.pipe(Schema.includes('substring'))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.IncludesSchemaId)),
		Option.andThen(AST.getAnnotation(refinement, Schema.IncludesSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('pattern')),
		Option.filter(Predicate.struct({ pattern: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ pattern }) => {
				mutableConstraint.pattern = pattern;
				return Option.void;
			},
		}),
	);

	// handle TrimmedSchemaId e.g. Schema.String.pipe(Schema.trimmed())
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.TrimmedSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('pattern')),
		Option.filter(Predicate.struct({ pattern: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ pattern }) => {
				mutableConstraint.pattern = pattern;
				return Option.void;
			},
		}),
	);

	// handle LowercasedSchemaId e.g. Schema.String.pipe(Schema.lowercased())
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.LowercasedSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('pattern')),
		Option.filter(Predicate.struct({ pattern: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ pattern }) => {
				mutableConstraint.pattern = pattern;
				return Option.void;
			},
		}),
	);

	// handle UppercasedSchemaId e.g. Schema.String.pipe(Schema.uppercased())
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.UppercasedSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('pattern')),
		Option.filter(Predicate.struct({ pattern: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ pattern }) => {
				mutableConstraint.pattern = pattern;
				return Option.void;
			},
		}),
	);

	// handle CapitalizedSchemaId e.g. Schema.String.pipe(Schema.capitalized())
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.CapitalizedSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('pattern')),
		Option.filter(Predicate.struct({ pattern: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ pattern }) => {
				mutableConstraint.pattern = pattern;
				return Option.void;
			},
		}),
	);

	// handle UncapitalizedSchemaId e.g. Schema.String.pipe(Schema.uncapitalized())
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.UncapitalizedSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('pattern')),
		Option.filter(Predicate.struct({ pattern: Predicate.isString })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ pattern }) => {
				mutableConstraint.pattern = pattern;
				return Option.void;
			},
		}),
	);

	// handle GreaterThanSchemaId e.g. Schema.Number.pipe(Schema.greaterThan(10))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.GreaterThanSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('exclusiveMinimum')),
		Option.filter(Predicate.struct({ exclusiveMinimum: Predicate.isNumber })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ exclusiveMinimum }) => {
				mutableConstraint.min = exclusiveMinimum;
				return Option.void;
			},
		}),
	);

	// handle GreaterThanOrEqualToSchemaId e.g. Schema.Number.pipe(Schema.greaterThanOrEqualTo(10))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.GreaterThanOrEqualToSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('minimum')),
		Option.filter(Predicate.struct({ minimum: Predicate.isNumber })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ minimum }) => {
				mutableConstraint.min = minimum;
				return Option.void;
			},
		}),
	);

	// handle LessThanSchemaId e.g. Schema.Number.pipe(Schema.lessThan(10))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.LessThanSchemaId)),
		Option.andThen(maybeJsonSchemaAnnotation),
		Option.filter(Predicate.hasProperty('exclusiveMaximum')),
		Option.filter(Predicate.struct({ exclusiveMaximum: Predicate.isNumber })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ exclusiveMaximum }) => {
				mutableConstraint.max = exclusiveMaximum;
				return Option.void;
			},
		}),
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
				mutableConstraint.max = maximum;
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
				mutableConstraint.min = minimum;
				mutableConstraint.max = maximum;
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
				mutableConstraint.step = multipleOf;
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
			}>(refinement, Schema.GreaterThanBigIntSchemaId),
		),
		Option.filter(Predicate.hasProperty('min')),
		Option.filter(Predicate.struct({ min: Predicate.isBigInt })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ min }) => {
				mutableConstraint.min = min as unknown as number; // cast bigint type to number as the Constraint type does not support bigint
				return Option.void;
			},
		}),
	);

	// handle GreaterThanOrEqualToBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.greaterThanOrEqualToBigInt(10n))
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(Equal.equals(Schema.GreaterThanOrEqualToBigIntSchemaId)),
		Option.andThen(() =>
			AST.getAnnotation<{
				min: bigint;
			}>(refinement, Schema.GreaterThanOrEqualToBigIntSchemaId),
		),
		Option.filter(Predicate.hasProperty('min')),
		Option.filter(Predicate.struct({ min: Predicate.isBigInt })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ min }) => {
				mutableConstraint.min = min as unknown as number; // cast bigint type to number as the Constraint type does not support bigint
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
			}>(refinement, Schema.LessThanBigIntSchemaId),
		),
		Option.filter(Predicate.hasProperty('max')),
		Option.filter(Predicate.struct({ max: Predicate.isBigInt })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ max }) => {
				mutableConstraint.max = max as unknown as number; // cast bigint type to number as the Constraint type does not support bigint
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
			}>(refinement, Schema.LessThanOrEqualToBigIntSchemaId),
		),
		Option.filter(Predicate.hasProperty('max')),
		Option.filter(Predicate.struct({ max: Predicate.isBigInt })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ max }) => {
				mutableConstraint.max = max as unknown as number; // cast bigint type to number as the Constraint type does not support bigint
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
			}>(refinement, Schema.BetweenBigIntSchemaId),
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
				mutableConstraint.max = max as unknown as number; // cast bigint type to number as the Constraint type does not support bigint
				mutableConstraint.min = min as unknown as number; // cast bigint type to number as the Constraint type does not support bigint
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
			}>(refinement, Schema.GreaterThanDateSchemaId),
		),
		Option.filter(Predicate.hasProperty('min')),
		Option.filter(Predicate.struct({ min: Predicate.isDate })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ min }) => {
				mutableConstraint.min = min.toISOString().split('T')[0];
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
			}>(refinement, Schema.GreaterThanOrEqualToDateSchemaId),
		),
		Option.filter(Predicate.hasProperty('min')),
		Option.filter(Predicate.struct({ min: Predicate.isDate })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ min }) => {
				mutableConstraint.min = min.toISOString().split('T')[0];
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
			}>(refinement, Schema.LessThanDateSchemaId),
		),
		Option.filter(Predicate.hasProperty('max')),
		Option.filter(Predicate.struct({ max: Predicate.isDate })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ max }) => {
				mutableConstraint.max = max.toISOString().split('T')[0];
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
			}>(refinement, Schema.LessThanOrEqualToDateSchemaId),
		),
		Option.filter(Predicate.hasProperty('max')),
		Option.filter(Predicate.struct({ max: Predicate.isDate })),
		Option.match({
			onNone: () => Option.none(),
			onSome: ({ max }) => {
				mutableConstraint.max = max.toISOString().split('T')[0];
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
			}>(refinement, Schema.BetweenDateSchemaId),
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
				mutableConstraint.min = min.toISOString().split('T')[0];
				mutableConstraint.max = max.toISOString().split('T')[0];
				return Option.void;
			},
		}),
	);
}
