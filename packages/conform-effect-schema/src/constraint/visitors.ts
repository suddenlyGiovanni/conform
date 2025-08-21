import type { Constraint } from '@conform-to/dom';
import { pipe, flow } from 'effect/Function';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as HashMap from 'effect/HashMap';
import * as Option from 'effect/Option';
import * as Record from 'effect/Record';
import * as Struct from 'effect/Struct';
import * as AST from 'effect/SchemaAST';

import {
	bigintRefinement,
	dateRefinement,
	numberRefinement,
	stringRefinement,
} from './refinements';
import { type Constraints, type MakeNodeVisitor } from './types';

import * as Ctx from './ctx';

/**
 * Visits a TypeLiteral node and updates constraints for each property signature.
 *
 * @private
 */
export const makeTypeLiteralVisitor: MakeNodeVisitor<AST.TypeLiteral> =
	(rec) => (ctx) => (node) => (constraints) =>
		pipe(
			node,
			Struct.get('propertySignatures'),
			ReadonlyArray.reduce(
				constraints,
				(_constraints, { isOptional, name, type }) => {
					const key = pipe(
						Match.value(ctx.path),
						Match.withReturnType<`${string}.${string}` | string>(),
						Match.when(
							Match.nonEmptyString,
							(parentPath) => `${parentPath}.${name.toString()}`,
						),
						Match.orElse(() => name.toString()),
					);

					return pipe(
						HashMap.modifyAt(_constraints, key, (maybeConstraint) =>
							Option.some({
								...Option.getOrElse(maybeConstraint, Record.empty),
								required: !isOptional,
							}),
						),
						rec(Ctx.node(key, node))(type),
					);
				},
			),
		);

/**
 * Visits a TupleType node and updates constraints for tuple elements and/or array-like rest elements.
 *
 * @private
 */
export const makeTupleTypeVisitor: MakeNodeVisitor<AST.TupleType> =
	(rec) => (ctx) => (node) => (constraints) =>
		pipe(
			node,
			Match.value,
			Match.withReturnType<Constraints.Constraints>(),

			Match.whenAnd(
				({ elements }) => elements.length === 0,
				({ rest }) => rest.length > 0,
				(tupleType) =>
					pipe(
						tupleType,
						Struct.get('rest'),
						ReadonlyArray.reduce(
							HashMap.modifyAt(constraints, ctx.path, (maybeConstraint) =>
								Option.some({
									...Option.getOrElse(maybeConstraint, Record.empty),
									multiple: true,
								}),
							),
							(_constraints, type) => {
								const itemPath = `${ctx.path}[]`;

								return pipe(
									HashMap.set(_constraints, itemPath, { required: true }),
									rec(Ctx.node(itemPath, tupleType))(type.type),
								);
							},
						),
					),
			),

			Match.whenAnd(
				({ elements }) => elements.length > 0,
				({ rest }) => rest.length >= 0,
				(tupleType) =>
					pipe(
						tupleType,
						Struct.get('elements'),
						ReadonlyArray.reduce(
							constraints,
							(_constraints, { isOptional, type }, idx) => {
								const elemPath = `${ctx.path}[${idx}]`;

								return pipe(
									HashMap.set(_constraints, elemPath, {
										required: !isOptional,
									}),
									rec(Ctx.node(elemPath, tupleType))(type),
								);
							},
						),
					),
			),

			Match.orElse(() => constraints),
		);

/**
 * Visits a Union node and merges constraints derived from each union member into the same path.
 *
 * @private
 */
export const makeUnionVisitor: MakeNodeVisitor<AST.Union> =
	(rec) => (ctx) => (node) => (constraints) =>
		pipe(
			node,
			Struct.get('types'),
			ReadonlyArray.reduce(constraints, (_constraints, member) => {
				// edge case to handle `Schema.Array(Schema.Literal('a', 'b', 'c'))` which should return a constraint of type:
				// `{ required: true, pattern: 'a|b|c' }`
				// if union of string literals ( eq to enums of strings e.g. Schema.Literal('a', 'b', 'c') )
				// it is contained by an array
				// meaning the ts type would equal to `Array<'a' | 'b' | 'c'>`
				// then we need to add the correct constraint to the hashmap:
				// a pattern constraint with the correct regex: e.g. /a|b|c/ .

				return pipe(_constraints, rec(Ctx.node(ctx.path, node))(member));
			}),
		);

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * @private
 */
export const makeRefinementVisitor: MakeNodeVisitor<AST.Refinement> =
	(rec) => (ctx) => (node) => {
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
		return flow(
			HashMap.modifyAt(ctx.path, (maybeConstraint) =>
				Option.some({
					...Option.getOrElse(maybeConstraint, Record.empty),
					...refinementConstraint,
				}),
			),
			rec(Ctx.node(ctx.path, node))(node.from),
		);
	};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * @private
 */
export const makeTransformationVisitor: MakeNodeVisitor<AST.Transformation> =
	(rec) => (ctx) => (node) =>
		rec(Ctx.node(ctx.path, node))(node.to);

/**
 * Placeholder handler for unsupported suspended nodes.
 *
 * @private
 */

export const makeSuspendVisitor: MakeNodeVisitor<AST.Suspend> =
	(_rec) => (_ctx) => (node) => (_constraints) => {
		throw new Error(`TODO: add support for this AST Node type: "${node._tag}"`);
	};
