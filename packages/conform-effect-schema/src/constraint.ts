import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';
import * as Option from 'effect/Option';

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

	// handle the minLength refinement
	pipe(
		maybeSchemaIdAnnotation,
		Option.filter(
			(schemaIdAnnotation) => schemaIdAnnotation === Schema.MinLengthSchemaId,
		),
		Option.andThen(
			AST.getJSONSchemaAnnotation(refinement) as Option.Option<
				Record.ReadonlyRecord<string, unknown>
			>,
		),
		Option.flatMap(Record.get('minLength')),
		Option.filter((minLength) => typeof minLength === 'number'),
		Option.match({
			onNone: () => Option.none(),
			onSome: (minLength) => {
				mutableConstraint.minLength = minLength;
				return Option.void;
			},
		}),
	);
}
