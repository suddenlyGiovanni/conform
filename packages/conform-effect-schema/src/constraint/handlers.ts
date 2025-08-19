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
import type { Ctx, NodeHandler } from './types';

/**
 * Visits a TypeLiteral node and updates constraints for each property signature.
 *
 * - Sets required based on optionality of each property.
 * - Recurses into property types using the provided Rec function.
 *
 * @param rec - The recursive visitor used to process child property types.
 * @param node - The TypeLiteral node to process.
 * @param ctx - The current traversal context (includes the parent path).
 * @returns An EndoHash that applies updates for this node.
 * @see NodeHandler
 * @see Rec
 * @private
 */
export const visitTypeLiteral: NodeHandler<AST.TypeLiteral> =
	(rec) => (node, ctx) => (data) =>
		pipe(
			node,
			Struct.get('propertySignatures'),
			ReadonlyArray.reduce(
				data,
				(hashMap, { isOptional, name: propName, type }) => {
					const key = pipe(
						Match.value(ctx.path),
						Match.withReturnType<`${string}.${string}` | string>(),
						Match.when(
							Match.nonEmptyString,
							(parentPath) => `${parentPath}.${propName.toString()}`,
						),
						Match.orElse(() => propName.toString()),
					);

					const nextCtx: Ctx = { path: key };

					return pipe(
						HashMap.modifyAt(hashMap, key, (constraint) =>
							Option.some({
								...Option.getOrElse(constraint, Record.empty),
								required: !isOptional,
							}),
						),
						rec(type, nextCtx),
					);
				},
			),
		);

/**
 * Visits a TupleType node and updates constraints for tuple elements and/or array-like rest elements.
 *
 * - Distinguishes tuple vs. array-like (empty elements + rest).
 * - For array-like, marks the base field as multiple and emits constraints for "path[]".
 * - For tuple, annotates each element path "path[i]" and recurses.
 *
 * @param rec - The recursive visitor used to process element types.
 * @param node - The TupleType node to process.
 * @param ctx - The current traversal context (includes the base path).
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitTupleType: NodeHandler<AST.TupleType> =
	(rec) => (node, ctx) => (data) =>
		pipe(
			node,
			Match.value,
			Match.whenAnd(
				({ elements }) => elements.length === 0,
				({ rest }) => rest.length > 0,
				(tupleType) =>
					pipe(
						tupleType,
						Struct.get('rest'),
						ReadonlyArray.reduce(
							HashMap.modifyAt(data, ctx.path, (constraint) =>
								Option.some({
									...Option.getOrElse(constraint, Record.empty),
									multiple: true,
								}),
							),
							(hashMap, type) => {
								const itemPath = `${ctx.path}[]`;
								const nextCtx: Ctx = { path: itemPath };

								return pipe(
									HashMap.set(hashMap, itemPath, { required: true }),
									rec(type.type, nextCtx),
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
						ReadonlyArray.reduce(data, (hashMap, { isOptional, type }, idx) => {
							const elemPath = `${ctx.path}[${idx}]`;
							const nextCtx: Ctx = { path: elemPath };

							return pipe(
								HashMap.set(hashMap, elemPath, {
									required: !isOptional,
								}),
								rec(type, nextCtx),
							);
						}),
					),
			),

			Match.orElse(() => data),
		);

/**
 * Visits a Union node and merges constraints derived from each union member into the same path.
 *
 * - Recurses into each member type at the same path.
 * - Useful for literal unions producing pattern constraints, among others.
 *
 * @param rec - The recursive visitor used to process union members.
 * @param node - The Union node to process.
 * @param ctx - The current traversal context (the path remains unchanged for members).
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitUnion: NodeHandler<AST.Union> =
	(rec) => (node, ctx) => (data) =>
		pipe(
			node,
			Struct.get('types'),
			ReadonlyArray.reduce(data, (hashMap, member) => {
				// edge case to handle `Schema.Array(Schema.Literal('a', 'b', 'c'))` which should return a constraint of type:
				// `{ required: true, pattern: 'a|b|c' }`
				// if union of string literals ( eq to enums of strings e.g. Schema.Literal('a', 'b', 'c') )
				// it is contained by an array
				// meaning the ts type would equal to `Array<'a' | 'b' | 'c'>`
				// then we need to add the correct constraint to the hashmap:
				// a pattern constraint with the correct regex: e.g. /a|b|c/ .

				return pipe(hashMap, rec(member, ctx));
			}),
		);

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * - Aggregates string/number/bigint/date refinement rules into a single constraint patch.
 * - Recurses into the underlying "from" type to continue traversal.
 *
 * @param rec - The recursive visitor used to process the base ("from") type.
 * @param node - The Refinement node to process.
 * @param ctx - The current traversal context (path where the patch is applied).
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitRefinement: NodeHandler<AST.Refinement> =
	(rec) => (node, ctx) => {
		const refinementConstraint = Option.reduceCompact<Constraint, Constraint>(
			[
				stringRefinement(node),
				numberRefinement(node),
				bigintRefinement(node),
				dateRefinement(node),
			],
			{},
			(constraints, constraint) => ({ ...constraints, ...constraint }),
		);
		return flow(
			HashMap.modifyAt(ctx.path, (maybeConstraint) =>
				Option.some({
					...Option.getOrElse(maybeConstraint, Record.empty),
					...refinementConstraint,
				}),
			),
			rec(node.from, ctx),
		);
	};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * - Some transformations affect constraints indirectly (e.g., string trimming),
 *   so this handler can be extended or combined with refinement logic.
 *
 * @param rec - The recursive visitor used to process the "to" type.
 * @param node - The Transformation node to process.
 * @param ctx - The current traversal context (path remains the same).
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitTransformation: NodeHandler<AST.Transformation> =
	(rec) => (node, ctx) =>
		rec(node.to, ctx);

/**
 * Placeholder handler for unsupported suspended nodes.
 *
 * @param _rec - Unused.
 * @param node - The Suspend node encountered.
 * @param _ctx - Unused.
 * @throws Error describing the unsupported node type.
 * @private
 */
export const visitSuspend: NodeHandler<AST.Suspend> =
	(rec) => (node, ctx) => (data) => {
		throw new Error(`TODO: add support for this AST Node type: "${node._tag}"`);
	};
