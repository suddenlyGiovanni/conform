import type { Constraint } from '@conform-to/dom';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as HashMap from 'effect/HashMap';
import * as Option from 'effect/Option';
import * as Record from 'effect/Record';
import * as AST from 'effect/SchemaAST';

import type * as Constraints from './constraints';
import {
	bigintRefinement,
	dateRefinement,
	numberRefinement,
	stringRefinement,
} from './refinements';
import type { MakeNodeVisitor } from './types';
import * as Ctx from './ctx';

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

				return rec(Ctx.node(path, node))(propertySignature.type)(
					HashMap.set(_constraints, path, {
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
export const makeTupleTypeVisitor: MakeNodeVisitor<AST.TupleType> =
	(rec) => (ctx) => (node) => (constraints) => {
		if (!Ctx.isNode(ctx)) {
			throw new Error(
				'TupleType cannot be used as a root type (e.g. Schema.Tuple([Schema.String, Schema.Number]))',
			);
		}
		return Match.value(node).pipe(
			Match.withReturnType<Constraints.Constraints>(),

			Match.whenAnd(
				({ elements }) => elements.length === 0,
				({ rest }) => rest.length > 0,
				(tupleType) => {
					return ReadonlyArray.reduce(
						tupleType.rest,
						HashMap.modifyAt(constraints, ctx.path, (maybeConstraint) =>
							Option.some({
								...Option.getOrElse(maybeConstraint, Record.empty),
								multiple: true,
							}),
						),
						(_constraints, type) => {
							const itemPath = `${ctx.path}[]`;

							return rec(Ctx.node(itemPath, tupleType))(type.type)(
								HashMap.set(_constraints, itemPath, { required: true }),
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

							return rec(Ctx.node(elemPath, tupleType))(optionalType.type)(
								HashMap.set(_constraints, elemPath, {
									required: !optionalType.isOptional,
								}),
							);
						},
					),
			),

			Match.orElse(() => constraints),
		);
	};

/**
 * Visits a Union node and merges constraints derived from each union member into the same path.
 *
 * @private
 */
export const makeUnionVisitor: MakeNodeVisitor<AST.Union> =
	(rec) => (ctx) => (node) => (constraints) =>
		ReadonlyArray.reduce(node.types, constraints, (_constraints, member) => {
			if (!Ctx.isNode(ctx)) {
				throw new Error(
					'Union cannot be used as a root type (e.g. Schema.Union([Schema.String, Schema.Number]))',
				);
			}
			// edge case to handle `Schema.Array(Schema.Literal('a', 'b', 'c'))` which should return a constraint of type:
			// `{ required: true, pattern: 'a|b|c' }`
			// if union of string literals ( eq to enums of strings e.g. Schema.Literal('a', 'b', 'c') )
			// it is contained by an array
			// meaning the ts type would equal to `Array<'a' | 'b' | 'c'>`
			// then we need to add the correct constraint to the hashmap:
			// a pattern constraint with the correct regex: e.g. /a|b|c/ .

			return rec(Ctx.node(ctx.path, node))(member)(_constraints);
		});

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * @private
 */
export const makeRefinementVisitor: MakeNodeVisitor<AST.Refinement> =
	(rec) => (ctx) => (node) => (constraints) => {
		if (!Ctx.isNode(ctx)) {
			throw new Error(
				'Refinement cannot be used as a root type (e.g. Schema.Refinement(Schema.String, (s) => s.length > 0))',
			);
		}

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

		return rec(Ctx.node(ctx.path, node))(node.from)(
			HashMap.modifyAt(constraints, ctx.path, (maybeConstraint) =>
				Option.some({
					...Option.getOrElse(maybeConstraint, Record.empty),
					...refinementConstraint,
				}),
			),
		);
	};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * @private
 */
export const makeTransformationVisitor: MakeNodeVisitor<AST.Transformation> =
	(rec) => (ctx) => (node) => (constraints) => {
		if (!Ctx.isNode(ctx)) {
			throw new Error(
				'Transformation cannot be used as a root type (e.g. Schema.Transformation(Schema.String, (s) => s.toUpperCase()))',
			);
		}
		return rec(Ctx.node(ctx.path, node))(node.to)(constraints);
	};

/**
 * Placeholder handler for unsupported suspended nodes.
 *
 * @private
 */

export const makeSuspendVisitor: MakeNodeVisitor<AST.Suspend> =
	(_rec) => (_ctx) => (node) => (_constraints) => {
		throw new Error(`TODO: add support for this AST Node type: "${node._tag}"`);
	};
