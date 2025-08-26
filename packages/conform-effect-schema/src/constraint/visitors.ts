import type { Constraint } from '@conform-to/dom';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as Option from 'effect/Option';
import * as AST from 'effect/SchemaAST';
import * as Predicate from 'effect/Predicate';
import * as Struct from 'effect/Struct';
import * as Either from 'effect/Either';

import { Constraints } from './constraints';
import * as Refinements from './refinements';
import type * as Types from './types';
import { Ctx } from './ctx';
import { pipe } from 'effect/Function';

/**
 * Visits a TypeLiteral node and updates constraints for each property signature.
 *
 * @private
 */
export const makeTypeLiteralVisitor: Types.MakeVisitor<
	Ctx.Ctx,
	AST.TypeLiteral
> = (rec) => (ctx, node, acc) =>
	ReadonlyArray.reduce(
		node.propertySignatures,
		Either.right(acc) as Types.ReturnConstraints,
		(returnConstraints, propertySignature) =>
			pipe(
				returnConstraints,
				Either.flatMap((constraints) => {
					const path = Match.valueTags(ctx, {
						Root: () => propertySignature.name.toString(),
						Node: (nodeCtx) =>
							`${nodeCtx.path}.${propertySignature.name.toString()}`,
					});

					return rec(
						Ctx.Node(path, node),
						propertySignature.type,
						Constraints.set(constraints, path, {
							required: !propertySignature.isOptional,
						}),
					);
				}),
			),
	);

/**
 * Visits a TupleType node and updates constraints for tuple elements and/or array-like rest elements.
 *
 * @private
 */
export const makeTupleTypeVisitor: Types.MakeVisitor<Ctx.Node, AST.TupleType> =
	(rec) => (ctx, node, acc) =>
		Match.value(node).pipe(
			Match.withReturnType<Types.ReturnConstraints>(),

			// Only rest -> array-like
			Match.whenAnd(
				({ elements }) => elements.length === 0,
				({ rest }) => rest.length > 0,
				(tupleType) =>
					ReadonlyArray.reduce(
						tupleType.rest,
						Either.right(
							Constraints.modify(acc, ctx.path, {
								multiple: true,
							}),
						) as Types.ReturnConstraints,
						(returnConstraints, type) =>
							pipe(
								returnConstraints,
								Either.flatMap((constraints) =>
									rec(
										Ctx.Node(`${ctx.path}[]`, tupleType),
										type.type,
										Constraints.set(constraints, `${ctx.path}[]`, {
											required: true,
										}),
									),
								),
							),
					),
			),

			// Fixed elements (with optional rest)
			Match.whenAnd(
				({ elements }) => elements.length > 0,
				({ rest }) => rest.length >= 0,
				(tupleType) =>
					ReadonlyArray.reduce(
						tupleType.elements,
						Either.right(acc) as Types.ReturnConstraints,
						(returnConstraints, optionalType, idx) =>
							pipe(
								returnConstraints,
								Either.flatMap((constraints) =>
									rec(
										Ctx.Node(`${ctx.path}[${idx}]`, tupleType),
										optionalType.type,
										Constraints.set(constraints, `${ctx.path}[${idx}]`, {
											required: !optionalType.isOptional,
										}),
									),
								),
							),
					),
			),

			// Default case
			Match.orElse(() => Either.right(acc)),
		);

/**
 * Visits a Union node and merges constraints derived from each union member into the same path.
 *
 * @private
 */
export const makeUnionVisitor: Types.MakeVisitor<Ctx.Node, AST.Union> =
	(rec) => (ctx, node, acc) => {
		const isStringLiteral = (
			t: AST.AST,
		): t is AST.Literal & { literal: string } =>
			AST.isLiteral(t) && Predicate.isString(t.literal);

		const regexEscape = (s: string) =>
			s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

		const patternFromLiterals = (values: readonly string[]): string =>
			values.map(regexEscape).join('|');

		// Collect string literals if this union is entirely string literal members
		const maybeStringLiterals = node.types.every(isStringLiteral)
			? Option.some(node.types.map(Struct.get('literal')))
			: Option.none();

		// Only annotate pattern on array item context (ctx.path ends with "[]")
		const baseConstraints = Option.match(maybeStringLiterals, {
			onNone: () => acc,
			onSome: (literals) =>
				ctx.path.endsWith('[]')
					? Constraints.modify(acc, ctx.path, {
							pattern: patternFromLiterals(literals),
						})
					: acc,
		});

		return ReadonlyArray.reduce(
			node.types,
			Either.right(baseConstraints) as Types.ReturnConstraints,
			(returnConstraints, member) =>
				pipe(
					returnConstraints,
					Either.flatMap((constraints) =>
						rec(Ctx.Node(ctx.path, node), member, constraints),
					),
				),
		);
	};

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * @private
 */
export const makeRefinementVisitor: Types.MakeVisitor<
	Ctx.Node,
	AST.Refinement
> = (rec) => (ctx, node, acc) => {
	const refinementConstraint: Constraint = Option.reduceCompact(
		[
			Refinements.stringRefinement(node),
			Refinements.numberRefinement(node),
			Refinements.bigintRefinement(node),
			Refinements.dateRefinement(node),
		],
		{} satisfies Constraint,
		(b, a): Constraint => ({ ...b, ...a }),
	);

	return rec(
		Ctx.Node(ctx.path, node),
		node.from,
		Constraints.modify(acc, ctx.path, refinementConstraint),
	);
};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * @private
 */
export const makeTransformationVisitor: Types.MakeVisitor<
	Ctx.Ctx,
	AST.Transformation
> = (rec) => (ctx, node, acc) =>
	pipe(
		ctx,
		Match.valueTags({
			Root: (rootCtx) => rec(rootCtx, node.to, acc),
			Node: (nodeCtx) => rec(Ctx.Node(nodeCtx.path, node), node.to, acc),
		}),
	);
