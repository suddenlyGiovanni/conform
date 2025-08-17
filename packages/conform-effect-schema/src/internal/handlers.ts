import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as HashMap from 'effect/HashMap';
import * as Option from 'effect/Option';
import * as Record from 'effect/Record';
import * as Struct from 'effect/Struct';
import * as AST from 'effect/SchemaAST';

import type { NodeHandler } from './types';

/**
 * Visits a TypeLiteral node and updates constraints for each property signature.
 *
 * - Sets required based on optionality of each property.
 * - Recurses into property types using the provided Rec function.
 *
 * @param rec - The recursive visitor used to process child property types.
 * @param node - The TypeLiteral node to process.
 * @param name - The current path of the parent object.
 * @returns An EndoHash that applies updates for this node.
 * @see NodeHandler
 * @see Rec
 * @private
 */
export const visitTypeLiteral: NodeHandler<AST.TypeLiteral> =
	(rec) => (node, name) => (data) =>
		pipe(
			node,
			Struct.get('propertySignatures'),
			ReadonlyArray.reduce(
				data,
				(hashMap, { isOptional, name: propName, type }) => {
					const key = pipe(
						Match.value(name),
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
						rec(type, key),
					);
				},
			),
		);

/**
 * Visits a TupleType node and updates constraints for tuple elements and/or array-like rest elements.
 *
 * - Distinguishes tuple vs. array-like (empty elements + rest).
 * - For array-like, marks the base field as multiple and emits constraints for "name[]".
 * - For tuple, annotates each element path "name[i]" and recurses.
 *
 * @param rec - The recursive visitor used to process element types.
 * @param node - The TupleType node to process.
 * @param name - The current path of the tuple/array field.
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitTupleType: NodeHandler<AST.TupleType> =
	(rec) => (node, name) => (data) => {
		// implementation…
		return data;
	};

/**
 * Visits a Union node and merges constraints derived from each union member into the same path.
 *
 * - Recurses into each member type at the same path.
 * - Useful for literal unions producing pattern constraints, among others.
 *
 * @param rec - The recursive visitor used to process union members.
 * @param node - The Union node to process.
 * @param name - The current path for the union field.
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitUnion: NodeHandler<AST.Union> =
	(rec) => (node, name) => (data) => {
		// implementation…
		return data;
	};

/**
 * Visits a Refinement node and merges refinement-derived constraints into the current path.
 *
 * - Aggregates string/number/bigint/date refinement rules into a single constraint patch.
 * - Recurses into the underlying "from" type to continue traversal.
 *
 * @param rec - The recursive visitor used to process the base ("from") type.
 * @param node - The Refinement node to process.
 * @param name - The current path for the refined field.
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitRefinement: NodeHandler<AST.Refinement> =
	(rec) => (node, name) => (data) => {
		// implementation…
		return data;
	};

/**
 * Visits a Transformation node and continues traversal to the "to" type.
 *
 * - Some transformations affect constraints indirectly (e.g., string trimming),
 *   so this handler can be extended or combined with refinement logic.
 *
 * @param rec - The recursive visitor used to process the "to" type.
 * @param node - The Transformation node to process.
 * @param name - The current path for the transformed field.
 * @returns An EndoHash that applies updates for this node.
 * @private
 */
export const visitTransformation: NodeHandler<AST.Transformation> =
	(rec) => (node, name) => (data) =>
		pipe(data, rec(node.to, name));
