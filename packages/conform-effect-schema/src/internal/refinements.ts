import type { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';
import * as Struct from 'effect/Struct';

export const stringRefinement = <From extends AST.AST>(
	ast: AST.Refinement<From>,
): Option.Option<Constraint> =>
	pipe(
		AST.getSchemaIdAnnotation(ast),
		Option.flatMap((schemaIdAnnotation) =>
			Match.value(schemaIdAnnotation).pipe(
				Match.withReturnType<Option.Option<Constraint>>(),

				Match.when(
					// handle StringSchemaId e.g. Schema.String.pipe(Schema.minLength(5))
					Schema.MinLengthSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('minLength')),
							Option.filter(
								Predicate.struct({ minLength: Predicate.isNumber }),
							),
							Option.map(Struct.pick('minLength')),
						),
				),

				Match.when(
					// handle MaxLengthSchemaId e.g. Schema.String.pipe(Schema.maxLength(10))
					Schema.MaxLengthSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('maxLength')),
							Option.filter(
								Predicate.struct({ maxLength: Predicate.isNumber }),
							),
							Option.map(Struct.pick('maxLength')),
						),
				),

				Match.when(
					// handle LengthSchemaId refinement (length) e.g. Schema.String.pipe(Schema.length(100))
					Schema.LengthSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
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
							Option.map(Struct.pick('minLength', 'maxLength')),
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
							Option.filter(Predicate.struct({ regex: Predicate.isRegExp })),
							Option.map(({ regex }) => ({ pattern: regex.source })),
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
							Option.map(({ startsWith }) => ({
								pattern: new RegExp(`^${startsWith}`).source,
							})),
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
							Option.filter(Predicate.struct({ endsWith: Predicate.isString })),
							Option.map(({ endsWith }) => ({
								pattern: new RegExp(`^.*${endsWith}$`).source,
							})),
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
							Option.filter(Predicate.struct({ includes: Predicate.isString })),
							Option.map(({ includes }) => ({
								pattern: new RegExp(`.*${includes}.*`).source,
							})),
						),
				),

				Match.when(
					// handle TrimmedSchemaId e.g. Schema.String.pipe(Schema.trimmed())
					Schema.TrimmedSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('pattern')),
							Option.filter(Predicate.struct({ pattern: Predicate.isString })),
							Option.map(Struct.pick('pattern')),
						),
				),

				Match.when(
					// handle LowercasedSchemaId e.g. Schema.String.pipe(Schema.lowercased())
					Schema.LowercasedSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('pattern')),
							Option.filter(Predicate.struct({ pattern: Predicate.isString })),
							Option.map(Struct.pick('pattern')),
						),
				),

				Match.when(
					// handle UppercasedSchemaId e.g. Schema.String.pipe(Schema.uppercased())
					Schema.UppercasedSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('pattern')),
							Option.filter(Predicate.struct({ pattern: Predicate.isString })),
							Option.map(Struct.pick('pattern')),
						),
				),

				Match.when(
					// handle CapitalizedSchemaId e.g. Schema.String.pipe(Schema.capitalized())
					Schema.CapitalizedSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('pattern')),
							Option.filter(Predicate.struct({ pattern: Predicate.isString })),
							Option.map(Struct.pick('pattern')),
						),
				),

				Match.when(
					// handle UncapitalizedSchemaId e.g. Schema.String.pipe(Schema.uncapitalized())
					Schema.UncapitalizedSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('pattern')),
							Option.filter(Predicate.struct({ pattern: Predicate.isString })),
							Option.map(Struct.pick('pattern')),
						),
				),

				Match.orElse(() => Option.none()),
			),
		),
	);

export const numberRefinement = <From extends AST.AST>(
	ast: AST.Refinement<From>,
): Option.Option<Constraint> =>
	pipe(
		AST.getSchemaIdAnnotation(ast),
		Option.flatMap((schemaIdAnnotation) =>
			Match.value(schemaIdAnnotation).pipe(
				Match.withReturnType<Option.Option<Constraint>>(),
				Match.when(
					// handle GreaterThanSchemaId e.g. Schema.Number.pipe(Schema.greaterThan(10))
					Schema.GreaterThanSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('exclusiveMinimum')),
							Option.filter(
								Predicate.struct({
									exclusiveMinimum: Predicate.isNumber,
								}),
							),
							Option.map(({ exclusiveMinimum }) => ({ min: exclusiveMinimum })),
						),
				),

				Match.when(
					// handle GreaterThanOrEqualToSchemaId e.g. Schema.Number.pipe(Schema.greaterThanOrEqualTo(10))
					Schema.GreaterThanOrEqualToSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('minimum')),
							Option.filter(
								Predicate.struct({
									minimum: Predicate.isNumber,
								}),
							),
							Option.map(({ minimum }) => ({ min: minimum })),
						),
				),

				Match.when(
					// handle LessThanSchemaId e.g. Schema.Number.pipe(Schema.lessThan(10))
					Schema.LessThanSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('exclusiveMaximum')),
							Option.filter(
								Predicate.struct({
									exclusiveMaximum: Predicate.isNumber,
								}),
							),
							Option.map(({ exclusiveMaximum }) => ({ max: exclusiveMaximum })),
						),
				),

				Match.when(
					// handle LessThanOrEqualToSchemaId e.g. Schema.Number.pipe(Schema.lessThanOrEqualTo(10))
					Schema.LessThanOrEqualToSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('maximum')),
							Option.filter(Predicate.struct({ maximum: Predicate.isNumber })),
							Option.map(({ maximum }) => ({ max: maximum })),
						),
				),

				Match.when(
					// handle BetweenSchemaId e.g. Schema.Number.pipe(Schema.between(10, 20))
					Schema.BetweenSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
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

							Option.map(({ maximum, minimum }) => ({
								max: maximum,
								min: minimum,
							})),
						),
				),

				Match.when(
					// handle MultipleOfSchemaId e.g. Schema.Number.pipe(Schema.multipleOf(5))
					Schema.MultipleOfSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(Predicate.hasProperty('multipleOf')),
							Option.filter(
								Predicate.struct({ multipleOf: Predicate.isNumber }),
							),

							Option.map(({ multipleOf }) => ({ step: multipleOf })),
						),
				),

				Match.orElse(() => Option.none()),
			),
		),
	);

export const bigintRefinement = <From extends AST.AST>(
	ast: AST.Refinement<From>,
): Option.Option<Constraint> =>
	pipe(
		AST.getSchemaIdAnnotation(ast),
		Option.flatMap((schemaIdAnnotation) =>
			Match.value(schemaIdAnnotation).pipe(
				Match.withReturnType<Option.Option<Constraint>>(),

				Match.when(
					// handle GreaterThanBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.greaterThanBigInt(10n))
					Schema.GreaterThanBigIntSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								min: bigint;
							}>(ast, Schema.GreaterThanBigIntSchemaId),

							Option.filter(Predicate.hasProperty('min')),
							Option.filter(Predicate.struct({ min: Predicate.isBigInt })),
							Option.map(({ min }) => ({
								min: min as unknown as number,
							})),
						),
				),

				Match.when(
					// handle GreaterThanOrEqualToBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.greaterThanOrEqualToBigInt(10n))
					Schema.GreaterThanOrEqualToBigIntSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								min: bigint;
							}>(ast, Schema.GreaterThanOrEqualToBigIntSchemaId),

							Option.filter(Predicate.hasProperty('min')),
							Option.filter(Predicate.struct({ min: Predicate.isBigInt })),
							Option.map(({ min }) => ({
								min: min as unknown as number,
							})),
						),
				),

				Match.when(
					// handle LessThanBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.lessThanBigInt(10n))
					Schema.LessThanBigIntSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								max: bigint;
							}>(ast, Schema.LessThanBigIntSchemaId),

							Option.filter(Predicate.hasProperty('max')),
							Option.filter(Predicate.struct({ max: Predicate.isBigInt })),
							Option.map(({ max }) => ({
								max: max as unknown as number,
							})),
						),
				),

				Match.when(
					// handle LessThanOrEqualToBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.lessThanOrEqualToBigInt(42n))
					Schema.LessThanOrEqualToBigIntSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								max: bigint;
							}>(ast, Schema.LessThanOrEqualToBigIntSchemaId),

							Option.filter(Predicate.hasProperty('max')),
							Option.filter(Predicate.struct({ max: Predicate.isBigInt })),
							Option.map(({ max }) => ({
								max: max as unknown as number,
							})),
						),
				),

				Match.when(
					// handle BetweenBigIntSchemaId e.g. Schema.BigInt.pipe(Schema.betweenBigInt(-2n, 2n))
					Schema.BetweenBigIntSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								max: bigint;
								min: bigint;
							}>(ast, Schema.BetweenBigIntSchemaId),

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
							Option.map(({ max, min }) => ({
								max: max as unknown as number, // cast bigint type to number as the Constraint type does not support bigint
								min: min as unknown as number, // cast bigint type to number as the Constraint type does not support bigint
							})),
						),
				),

				Match.orElse(() => Option.none()),
			),
		),
	);

export const dateRefinement = <From extends AST.AST>(
	ast: AST.Refinement<From>,
): Option.Option<Constraint> =>
	pipe(
		AST.getSchemaIdAnnotation(ast),
		Option.flatMap((schemaIdAnnotation) =>
			Match.value(schemaIdAnnotation).pipe(
				Match.withReturnType<Option.Option<Constraint>>(),

				Match.when(
					// handle GreaterThanDateSchemaId e.g. Schema.Date.pipe(Schema.greaterThanDate(new Date(1)))
					Schema.GreaterThanDateSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								min: Date;
							}>(ast, Schema.GreaterThanDateSchemaId),

							Option.filter(Predicate.hasProperty('min')),
							Option.filter(Predicate.struct({ min: Predicate.isDate })),
							Option.map(({ min }) => ({
								min: min.toISOString().split('T')[0]!,
							})),
						),
				),
				Match.when(
					// handle GreaterThanOrEqualToDateSchemaId e.g. Schema.Date.pipe(Schema.greaterThanOrEqualToDate(new Date(1)))
					Schema.GreaterThanOrEqualToDateSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								min: Date;
							}>(ast, Schema.GreaterThanOrEqualToDateSchemaId),
							Option.filter(Predicate.hasProperty('min')),
							Option.filter(Predicate.struct({ min: Predicate.isDate })),
							Option.map(({ min }) => ({
								min: min.toISOString().split('T')[0]!,
							})),
						),
				),

				Match.orElse(() => Option.none()),
			),
		),
	);
