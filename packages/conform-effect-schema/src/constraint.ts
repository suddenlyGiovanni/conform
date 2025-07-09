import { Constraint } from '@conform-to/dom';
import { hole } from 'effect/Function';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

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
	}
}
