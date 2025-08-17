import type { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';
import * as Struct from 'effect/Struct';

const pickMinLength = Struct.pick('minLength');
const pickMaxLength = Struct.pick('maxLength');
const pickPattern = Struct.pick('pattern');

/**
 * A partial interpreter that derives a Constraint from a Refinement node, if applicable.
 *
 * Implementations inspect Effect.Schema annotations present on the given Refinement and
 * return a Constraint fragment relevant to HTML-like form validation (e.g., min/max,
 * minLength/maxLength, pattern). When the refinement does not map to a form constraint,
 * None is returned.
 *
 * Use multiple RefinementConstraintRule implementations together and merge their results
 * to obtain the final constraint patch for the current path.
 *
 * @typeParam From - The underlying AST node being refined.
 * @returns  A constraint fragment to be merged, or None if not applicable.
 */

type RefinementConstraintRule = <From extends AST.AST>(
	ast: AST.Refinement<From>,
) => Option.Option<Constraint>;

/**
 * Interprets string-related refinements into Constraint fragments.
 *
 * Recognized refinements include:
 * - minLength / maxLength / length
 * - pattern / startsWith / endsWith / includes
 * - trimmed / lowercased / uppercased / capitalized / uncapitalized
 *
 * Returns None when the refinement does not correspond to a form-level constraint.
 *
 * @param ast - A Refinement wrapping a string-like schema.
 * @returns An Option with minLength/maxLength/pattern fields as applicable.
 */
export const stringRefinement: RefinementConstraintRule = (ast) =>
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

							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('minLength'),
									Predicate.struct({ minLength: Predicate.isNumber }),
								),
							),
							Option.map(pickMinLength),
						),
				),

				Match.when(
					// handle MaxLengthSchemaId e.g. Schema.String.pipe(Schema.maxLength(10))
					Schema.MaxLengthSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('maxLength'),
									Predicate.struct({ maxLength: Predicate.isNumber }),
								),
							),
							Option.map(pickMaxLength),
						),
				),

				Match.when(
					// handle LengthSchemaId refinement (length) e.g. Schema.String.pipe(Schema.length(100))
					Schema.LengthSchemaId,
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(
								Predicate.compose(
									Predicate.and(
										Predicate.hasProperty('minLength'),
										Predicate.hasProperty('maxLength'),
									),
									Predicate.struct({
										minLength: Predicate.isNumber,
										maxLength: Predicate.isNumber,
									}),
								),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('regex'),
									Predicate.struct({ regex: Predicate.isRegExp }),
								),
							),
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

							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('startsWith'),
									Predicate.struct({ startsWith: Predicate.isString }),
								),
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

							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('endsWith'),
									Predicate.struct({ endsWith: Predicate.isString }),
								),
							),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('includes'),
									Predicate.struct({ includes: Predicate.isString }),
								),
							),
							Option.map(({ includes }) => ({
								pattern: new RegExp(`.*${includes}.*`).source,
							})),
						),
				),

				Match.whenOr(
					Schema.TrimmedSchemaId, // handle TrimmedSchemaId e.g. Schema.String.pipe(Schema.trimmed())
					Schema.LowercasedSchemaId, // handle LowercasedSchemaId e.g. Schema.String.pipe(Schema.lowercased())
					Schema.UppercasedSchemaId, // handle UppercasedSchemaId e.g. Schema.String.pipe(Schema.uppercased())
					Schema.CapitalizedSchemaId, // handle CapitalizedSchemaId e.g. Schema.String.pipe(Schema.capitalized())
					Schema.UncapitalizedSchemaId, // handle UncapitalizedSchemaId e.g. Schema.String.pipe(Schema.uncapitalized())
					() =>
						pipe(
							AST.getJSONSchemaAnnotation(ast),
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('pattern'),
									Predicate.struct({ pattern: Predicate.isString }),
								),
							),
							Option.map(pickPattern),
						),
				),

				Match.orElse(() => Option.none()),
			),
		),
	);

/**
 * Interprets number-related refinements into Constraint fragments.
 *
 * Recognized refinements include:
 * - greaterThan / greaterThanOrEqualTo → min
 * - lessThan / lessThanOrEqualTo → max
 * - between → min and max
 * - multipleOf → step
 *
 * Returns None when the refinement does not correspond to a form-level constraint.
 *
 * @param ast - A Refinement wrapping a number-like schema.
 * @returns An Option with min/max/step fields as applicable.
 */
export const numberRefinement: RefinementConstraintRule = (ast) =>
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('exclusiveMinimum'),
									Predicate.struct({ exclusiveMinimum: Predicate.isNumber }),
								),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('minimum'),
									Predicate.struct({ minimum: Predicate.isNumber }),
								),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('exclusiveMaximum'),
									Predicate.struct({ exclusiveMaximum: Predicate.isNumber }),
								),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('maximum'),
									Predicate.struct({ maximum: Predicate.isNumber }),
								),
							),
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
								Predicate.compose(
									Predicate.and(
										Predicate.hasProperty('minimum'),
										Predicate.hasProperty('maximum'),
									),
									Predicate.struct({
										minimum: Predicate.isNumber,
										maximum: Predicate.isNumber,
									}),
								),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('multipleOf'),
									Predicate.struct({ multipleOf: Predicate.isNumber }),
								),
							),
							Option.map(({ multipleOf }) => ({ step: multipleOf })),
						),
				),

				Match.orElse(() => Option.none()),
			),
		),
	);

/**
 * Interprets bigint-related refinements into Constraint fragments.
 *
 * Recognized refinements include:
 * - greaterThanBigInt / greaterThanOrEqualToBigInt → min
 * - lessThanBigInt / lessThanOrEqualToBigInt → max
 * - betweenBigInt → min and max
 *
 * Note: bigint values are cast to number to fit the Constraint shape.
 * Returns None when the refinement does not correspond to a form-level constraint.
 *
 * @param ast - A Refinement wrapping a bigint-like schema.
 * @returns An Option with min/max fields (cast to number) as applicable.
 */
export const bigintRefinement: RefinementConstraintRule = (ast) =>
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

							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('min'),
									Predicate.struct({ min: Predicate.isBigInt }),
								),
							),
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

							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('min'),
									Predicate.struct({ min: Predicate.isBigInt }),
								),
							),
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

							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('max'),
									Predicate.struct({ max: Predicate.isBigInt }),
								),
							),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('max'),
									Predicate.struct({ max: Predicate.isBigInt }),
								),
							),
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
								Predicate.compose(
									Predicate.and(
										Predicate.hasProperty('max'),
										Predicate.hasProperty('max'),
									),
									Predicate.struct({
										max: Predicate.isBigInt,
										min: Predicate.isBigInt,
									}),
								),
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

/**
 * Interprets date-related refinements into Constraint fragments.
 *
 * Recognized refinements include:
 * - greaterThanDate / greaterThanOrEqualToDate → min
 * - lessThanDate / lessThanOrEqualToDate → max
 * - betweenDate → min and max
 *
 * Date values are formatted as ISO date strings (YYYY-MM-DD) to match typical
 * input[type="date"] constraints. Returns None when not applicable.
 *
 * @param ast - A Refinement wrapping a date-like schema.
 * @returns An Option with min/max fields as ISO date strings, as applicable.
 */

export const dateRefinement: RefinementConstraintRule = (ast) =>
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

							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('min'),
									Predicate.struct({ min: Predicate.isDate }),
								),
							),
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
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('min'),
									Predicate.struct({ min: Predicate.isDate }),
								),
							),
							Option.map(({ min }) => ({
								min: min.toISOString().split('T')[0]!,
							})),
						),
				),

				Match.when(
					// handle LessThanDateSchemaId e.g. Schema.DateFromSelf.pipe(Schema.lessThanDate(new Date(1)))
					Schema.LessThanDateSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								max: Date;
							}>(ast, Schema.LessThanDateSchemaId),
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('max'),
									Predicate.struct({ max: Predicate.isDate }),
								),
							),
							Option.map(({ max }) => ({
								max: max.toISOString().split('T')[0]!,
							})),
						),
				),

				Match.when(
					// handle LessThanOrEqualToDateSchemaId e.g. Schema.DateFromSelf.pipe(Schema.lessThanOrEqualToDate(new Date(1)))
					Schema.LessThanOrEqualToDateSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								max: Date;
							}>(ast, Schema.LessThanOrEqualToDateSchemaId),
							Option.filter(
								Predicate.compose(
									Predicate.hasProperty('max'),
									Predicate.struct({ max: Predicate.isDate }),
								),
							),
							Option.map(({ max }) => ({
								max: max.toISOString().split('T')[0]!,
							})),
						),
				),

				Match.when(
					// handle BetweenDateSchemaId e.g. Schema.DateFromSelf.pipe(Schema.betweenDate(new Date(1), new Date(2)))
					Schema.BetweenDateSchemaId,
					() =>
						pipe(
							AST.getAnnotation<{
								max: Date;
								min: Date;
							}>(ast, Schema.BetweenDateSchemaId),
							Option.filter(
								Predicate.compose(
									Predicate.and(
										Predicate.hasProperty('min'),
										Predicate.hasProperty('max'),
									),
									Predicate.struct({
										min: Predicate.isDate,
										max: Predicate.isDate,
									}),
								),
							),
							Option.map(({ max, min }) => ({
								max: max.toISOString().split('T')[0]!,
								min: min.toISOString().split('T')[0]!,
							})),
						),
				),

				Match.orElse(() => Option.none()),
			),
		),
	);
