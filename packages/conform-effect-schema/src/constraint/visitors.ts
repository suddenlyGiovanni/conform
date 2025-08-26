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

/**
 * Visits a TypeLiteral node and updates constraints for each property signature.
 *
 * @private
 */
export const makeTypeLiteralVisitor: Types.MakeNodeVisitor<
	Ctx.Ctx,
	AST.TypeLiteral
> = (rec) => (ctx) => (node) => (constraints) =>
	ReadonlyArray.reduce(
		node.propertySignatures,
		Either.right(constraints) as Types.ReturnConstraints,
		(returnConstraints, propertySignature) =>
			Either.flatMap(returnConstraints, (_constraints) => {
				const path = Ctx.isRoot(ctx)
					? propertySignature.name.toString()
					: `${ctx.path}.${propertySignature.name.toString()}`;

				return rec(Ctx.Node(path, node))(propertySignature.type)(
					Constraints.set(_constraints, path, {
						required: !propertySignature.isOptional,
					}),
				);
			}),
	);

/**
 * Visits a TupleType node and updates constraints for tuple elements and/or array-like rest elements.
 *
 * @private
 */
export const makeTupleTypeVisitor: Types.MakeNodeVisitor<
	Ctx.Node,
	AST.TupleType
> = (rec) => (ctx) => (node) =>
	Match.value(node).pipe(
		Match.withReturnType<Types.ConstraintsEndo>(),

		Match.whenAnd(
			({ elements }) => elements.length === 0,
			({ rest }) => rest.length > 0,
			(tupleType) => (constraints) => {
				const base = Constraints.modify(constraints, ctx.path, {
					multiple: true,
				});

				return ReadonlyArray.reduce(
					tupleType.rest,
					Either.right(base) as Types.ReturnConstraints,
					(returnConstraints, type) =>
						Either.flatMap(returnConstraints, (_constraints) => {
							const itemPath = `${ctx.path}[]`;
							const withItem = Constraints.set(_constraints, itemPath, {
								required: true,
							});

							return rec(Ctx.Node(itemPath, tupleType))(type.type)(withItem);
						}),
				);
			},
		),

		Match.whenAnd(
			({ elements }) => elements.length > 0,
			({ rest }) => rest.length >= 0,
			(tupleType) => (constraints: Constraints.Constraints) =>
				ReadonlyArray.reduce(
					tupleType.elements,
					Either.right(constraints) as Types.ReturnConstraints,
					(returnConstraints, optionalType, idx) => {
						return Either.flatMap(returnConstraints, (_constraints) => {
							const elemPath = `${ctx.path}[${idx}]`;
							const withElem = Constraints.set(_constraints, elemPath, {
								required: !optionalType.isOptional,
							});

							return rec(Ctx.Node(elemPath, tupleType))(optionalType.type)(
								withElem,
							);
						}); // ensure sequencing
					},
				),
		),

		Match.orElse(
			() => (constraints: Constraints.Constraints) => Either.right(constraints),
		),
	);

/**
 * Visits a Union node and merges constraints derived from each union member into the same path.
 *
 * @private
 */
export const makeUnionVisitor: Types.MakeNodeVisitor<Ctx.Node, AST.Union> =
	(rec) => (ctx) => (node) => (constraints) => {
		const isStringLiteral = (
			t: AST.AST,
		): t is AST.Literal & { literal: string } =>
			AST.isLiteral(t) && Predicate.isString(t.literal);

		const regexEscape = (s: string) =>
			s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

		const patternFromLiterals = (values: readonly string[]): string =>
			values.map(regexEscape).join('|');

		// Collect string literals if this union is entirely string literal members
		const stringLiterals = node.types.every(isStringLiteral)
			? Option.some(node.types.map(Struct.get('literal')))
			: Option.none();

		// Only annotate pattern on array item context (ctx.path ends with "[]")
		const baseConstraints = Option.match(stringLiterals, {
			onNone: () => constraints,
			onSome: (literals) =>
				ctx.path.endsWith('[]')
					? Constraints.modify(constraints, ctx.path, {
							pattern: patternFromLiterals(literals),
						})
					: constraints,
		});

		return ReadonlyArray.reduce(
			node.types,
			Either.right(baseConstraints) as Types.ReturnConstraints,
			(returnConstraints, member) =>
				Either.flatMap(returnConstraints, (_constraints) =>
					rec(Ctx.Node(ctx.path, node))(member)(_constraints),
				),
		);
	};

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * @private
 */
export const makeRefinementVisitor: Types.MakeNodeVisitor<
	Ctx.Node,
	AST.Refinement
> = (rec) => (ctx) => (node) => (constraints) => {
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
	const next = Constraints.modify(constraints, ctx.path, refinementConstraint);

	return rec(Ctx.Node(ctx.path, node))(node.from)(next);
};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * @private
 */
export const makeTransformationVisitor: Types.MakeNodeVisitor<
	Ctx.Ctx,
	AST.Transformation
> = (rec) => (ctx) => (node) => (constraints) =>
	Match.valueTags(ctx, {
		Root: (rootCtx) => rec(rootCtx)(node.to)(constraints),
		Node: (nodeCtx) => rec(Ctx.Node(nodeCtx.path, node))(node.to)(constraints),
	});
