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
import { Ctx, type Constraints, type MakeNodeVisitor } from './types';

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

					return pipe(
						HashMap.modifyAt(hashMap, key, (constraint) =>
							Option.some({
								...Option.getOrElse(constraint, Record.empty),
								required: !isOptional,
							}),
						),
						rec(Ctx.node({ path: key, parent: node }))(type),
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
							HashMap.modifyAt(constraints, ctx.path, (constraint) =>
								Option.some({
									...Option.getOrElse(constraint, Record.empty),
									multiple: true,
								}),
							),
							(hashMap, type) => {
								const itemPath = `${ctx.path}[]`;

								return pipe(
									HashMap.set(hashMap, itemPath, { required: true }),
									rec(Ctx.node({ path: itemPath, parent: tupleType }))(
										type.type,
									),
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
							(hashMap, { isOptional, type }, idx) => {
								const elemPath = `${ctx.path}[${idx}]`;

								return pipe(
									HashMap.set(hashMap, elemPath, {
										required: !isOptional,
									}),
									rec(Ctx.node({ path: elemPath, parent: tupleType }))(type),
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
			ReadonlyArray.reduce(constraints, (hashMap, member) => {
				// edge case to handle `Schema.Array(Schema.Literal('a', 'b', 'c'))` which should return a constraint of type:
				// `{ required: true, pattern: 'a|b|c' }`
				// if union of string literals ( eq to enums of strings e.g. Schema.Literal('a', 'b', 'c') )
				// it is contained by an array
				// meaning the ts type would equal to `Array<'a' | 'b' | 'c'>`
				// then we need to add the correct constraint to the hashmap:
				// a pattern constraint with the correct regex: e.g. /a|b|c/ .

				return pipe(
					hashMap,
					rec(Ctx.node({ path: ctx.path, parent: node }))(member),
				);
			}),
		);

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * @private
 */
export const makeRefinementVisitor: MakeNodeVisitor<AST.Refinement> =
	(rec) => (ctx) => (node) => {
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
			rec(Ctx.node({ path: ctx.path, parent: node }))(node.from),
		);
	};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * @private
 */
export const makeTransformationVisitor: MakeNodeVisitor<AST.Transformation> =
	(rec) => (ctx) => (node) =>
		rec(Ctx.node({ path: ctx.path, parent: node }))(node.to);

/**
 * Placeholder handler for unsupported suspended nodes.
 *
 * @private
 */

export const makeSuspendVisitor: MakeNodeVisitor<AST.Suspend> =
	(_rec) => (_ctx) => (node) => (_constraints) => {
		throw new Error(`TODO: add support for this AST Node type: "${node._tag}"`);
	};
