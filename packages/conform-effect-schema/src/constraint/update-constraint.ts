import { identity, pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as AST from 'effect/SchemaAST';

import {
	visitRefinement,
	visitTransformation,
	visitTypeLiteral,
	visitTupleType,
	visitUnion,
	visitSuspend,
} from './handlers';
import type { EndoHash, Rec } from './types';

const endoHashIdentity: EndoHash = identity;

/**
 * Builds a recursive visitor for Effect Schema AST that updates a constraints map.
 *
 * The returned function (Rec) is a Reader-style builder: for a given node and context,
 * it returns an {@link EndoHash}. The dispatcher and handlers consistently return EndoHash,
 * using the identity endomorphism for no-op branches and delegating to handlers for
 * AST nodes that produce edits. Application to the actual HashMap remains data-last
 * at call sites.
 *
 * @returns A Rec function that can traverse AST nodes and produce constraint edits (as EndoHash).
 * @see Rec
 * @private
 */
export function makeConstraintVisitor(): Rec {
	const rec: Rec = (ast, ctx) =>
		Match.value(ast).pipe(
			Match.withReturnType<EndoHash>(),

			// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
			Match.whenOr(
				AST.isAnyKeyword, // Schema.Any
				AST.isNeverKeyword, // Schema.Never
				AST.isObjectKeyword, // Schema.Object
				AST.isSymbolKeyword, // Schema.SymbolFromSelf
				AST.isVoidKeyword, // Schema.Void
				AST.isUnknownKeyword, // Schema.Unknown,
				AST.isUniqueSymbol,
				(_) => {
					throw new Error(
						'Unsupported AST type for Constraint extraction AST: ' + _._tag,
					);
				},
			),

			// for these AST nodes we do not need to process them further
			Match.whenOr(
				AST.isStringKeyword, // Schema.String
				AST.isNumberKeyword, // Schema.Number
				AST.isBigIntKeyword, // Schema.BigIntFromSelf
				AST.isBooleanKeyword, // Schema.Boolean
				AST.isUndefinedKeyword, // Schema.Undefined
				() => endoHashIdentity,
			),

			// for these AST nodes we do not need to process them further
			Match.whenOr(
				AST.isLiteral, // string | number | boolean | null | bigint
				AST.isDeclaration,
				AST.isTemplateLiteral,
				AST.isEnums,
				() => endoHashIdentity,
			),

			Match.when(AST.isTypeLiteral, pipe(ctx, visitTypeLiteral(rec))),
			Match.when(AST.isTupleType, pipe(ctx, visitTupleType(rec))),
			Match.when(AST.isUnion, pipe(ctx, visitUnion(rec))),
			Match.when(AST.isRefinement, pipe(ctx, visitRefinement(rec))),
			Match.when(AST.isTransformation, pipe(ctx, visitTransformation(rec))),
			Match.when(AST.isSuspend, pipe(ctx, visitSuspend(rec))),

			Match.exhaustive,
		);

	return rec;
}
