import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';

export function getEffectSchemaConstraint<Fields extends Schema.Struct.Fields>(
	schema: Schema.Struct<Fields>,
): Record<string, Constraint> {
	const isStruct = Schema.is(
		Schema.Struct<Fields>(
			// cast here because we only want to check that the input schema is a Struct,
			{} as any,
		),
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
	} else if (AST.isBooleanKeyword(ast)) {
		// it's a Schema.Boolean with no transformations
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
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.MinLengthSchemaId,
		),
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
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.MaxLengthSchemaId,
		),
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
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.LengthSchemaId,
		),
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
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.PatternSchemaId,
		),
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
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.StartsWithSchemaId,
		),
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
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.EndsWithSchemaId,
		),
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
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.IncludesSchemaId,
		),
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
}
