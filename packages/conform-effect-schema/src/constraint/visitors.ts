import type { Constraint } from '@conform-to/dom';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as Option from 'effect/Option';
import * as AST from 'effect/SchemaAST';
import * as Predicate from 'effect/Predicate';
import * as Struct from 'effect/Struct';

import { Constraints } from './constraints';
import {
	bigintRefinement,
	dateRefinement,
	numberRefinement,
	stringRefinement,
} from './refinements';
import type { MakeNodeVisitor } from './types';
import { Ctx } from './ctx';

/**
 * Visits a TypeLiteral node and updates constraints for each property signature.
 *
 * @private
 */
export const makeTypeLiteralVisitor: MakeNodeVisitor<AST.TypeLiteral> =
	(rec) => (ctx) => (node) => (constraints) =>
		ReadonlyArray.reduce(
			node.propertySignatures,
			constraints,
			(_constraints, propertySignature) => {
				const path = Ctx.isRoot(ctx)
					? propertySignature.name.toString()
					: `${ctx.path}.${propertySignature.name.toString()}`;

				return rec(Ctx.Node(path, node))(propertySignature.type)(
					Constraints.set(_constraints, path, {
						required: !propertySignature.isOptional,
					}),
				);
			},
		);

/**
 * Visits a TupleType node and updates constraints for tuple elements and/or array-like rest elements.
 *
 * @private
 */
export const makeTupleTypeVisitor: MakeNodeVisitor<AST.TupleType, Ctx.Node> =
	(rec) => (ctx) => (node) => (constraints) =>
		Match.value(node).pipe(
			Match.withReturnType<Constraints.Constraints>(),

			Match.whenAnd(
				({ elements }) => elements.length === 0,
				({ rest }) => rest.length > 0,
				(tupleType) => {
					return ReadonlyArray.reduce(
						tupleType.rest,
						Constraints.modify(constraints, ctx.path, { multiple: true }),
						(_constraints, type) => {
							const itemPath = `${ctx.path}[]`;

							return rec(Ctx.Node(itemPath, tupleType))(type.type)(
								Constraints.set(_constraints, itemPath, { required: true }),
							);
						},
					);
				},
			),

			Match.whenAnd(
				({ elements }) => elements.length > 0,
				({ rest }) => rest.length >= 0,
				(tupleType) =>
					ReadonlyArray.reduce(
						tupleType.elements,
						constraints,
						(_constraints, optionalType, idx) => {
							const elemPath = `${ctx.path}[${idx}]`;

							return rec(Ctx.Node(elemPath, tupleType))(optionalType.type)(
								Constraints.set(_constraints, elemPath, {
									required: !optionalType.isOptional,
								}),
							);
						},
					),
			),

			Match.orElse(() => constraints),
		);

/**
 * Visits a Union node and merges constraints derived from each union member into the same path.
 *
 * @private
 */
export const makeUnionVisitor: MakeNodeVisitor<AST.Union, Ctx.Node> =
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
			baseConstraints,
			(_constraints, member) =>
				rec(Ctx.Node(ctx.path, node))(member)(_constraints),
		);
	};

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * @private
 */
export const makeRefinementVisitor: MakeNodeVisitor<AST.Refinement, Ctx.Node> =
	(rec) => (ctx) => (node) => (constraints) => {
		const refinementConstraint: Constraint = Option.reduceCompact(
			[
				stringRefinement(node),
				numberRefinement(node),
				bigintRefinement(node),
				dateRefinement(node),
			],
			{} satisfies Constraint,
			(b, a): Constraint => ({ ...b, ...a }),
		);

		return rec(Ctx.Node(ctx.path, node))(node.from)(
			Constraints.modify(constraints, ctx.path, refinementConstraint),
		);
	};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * @private
 */
export const makeTransformationVisitor: MakeNodeVisitor<
	AST.Transformation,
	Ctx.Type
> = (rec) => (ctx) => (node) => (constraints) =>
	Ctx.isRoot(ctx)
		? rec(ctx)(node.to)(constraints)
		: rec(Ctx.Node(ctx.path, node))(node.to)(constraints);

/**
 * Placeholder handler for unsupported suspended nodes.
 *
 * @private
 */

export const makeSuspendVisitor: MakeNodeVisitor<AST.Suspend> =
	(_rec) => (_ctx) => (node) => (_constraints) => {
		throw new Error(`TODO: add support for this AST Node type: "${node._tag}"`);
	};
