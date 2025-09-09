import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import type * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import * as Errors from './errors';
import { type ConstraintRecord, Constraints, Ctx, Endo } from './types';
import * as Visitors from './visitors';

/** Options controlling constraint extraction behavior. */
export interface ConstraintOptions {
	/**
	 * Maximum number of times a single suspended AST target (the result of `Suspend.f()`) may be expanded.
	 * Prevents infinite recursion for self / mutually recursive schemas while still surfacing a useful
	 * prefix of nested constraints for e.g. form builders.
	 *
	 * Counting is per distinct underlying AST node (WeakMap keyed) across the whole traversal.
	 * A value of `0` means suspended targets are never expanded (effectively ignored). Defaults to `2`.
	 */
	readonly MAX_SUSPEND_EXPANSIONS?: number;
}

const DEFAULT_OPTIONS: Required<ConstraintOptions> = {
	MAX_SUSPEND_EXPANSIONS: 2,
};

export const getEffectSchemaConstraint = <A, I>(
	schema: Schema.Schema<A, I>,
	options?: ConstraintOptions,
): ConstraintRecord => {
	const { MAX_SUSPEND_EXPANSIONS } = { ...DEFAULT_OPTIONS, ...options };

	// Track how many times we've expanded a given suspended target AST.
	const suspendExpansionCounts = new WeakMap<AST.AST, number>();

	const shouldExpandSuspend = (target: AST.AST): boolean => {
		const current = suspendExpansionCounts.get(target) ?? 0;
		if (current >= MAX_SUSPEND_EXPANSIONS) return false;
		suspendExpansionCounts.set(target, current + 1);
		return true;
	};
	const visitNode: Endo.Visit<Ctx.Node> = (ctx, ast) =>
		Match.value(ast).pipe(
			Match.withReturnType<Endo.Prog>(),

			// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
			Match.whenOr(
				AST.isAnyKeyword, // Schema.Any
				AST.isNeverKeyword, // Schema.Never
				AST.isObjectKeyword, // Schema.Object
				AST.isSymbolKeyword, // Schema.SymbolFromSelf
				AST.isVoidKeyword, // Schema.Void
				AST.isUnknownKeyword, // Schema.Unknown
				AST.isUniqueSymbol,
				(node) =>
					Endo.fail(
						new Errors.UnsupportedNodeError({
							nodeTag: node._tag,
							path: ctx.path,
						}),
					),
			),

			// no-op leaves
			Match.whenOr(
				AST.isStringKeyword, // Schema.String
				AST.isNumberKeyword, // Schema.Number
				AST.isBigIntKeyword, // Schema.BigIntFromSelf
				AST.isBooleanKeyword, // Schema.Boolean
				AST.isUndefinedKeyword, // Schema.Undefined
				() => Endo.of(Endo.id),
			),

			Match.whenOr(
				AST.isLiteral, // string | number | boolean | null | bigint
				AST.isDeclaration,
				AST.isTemplateLiteral,
				AST.isEnums,
				() => Endo.of(Endo.id),
			),

			Match.when(AST.isTypeLiteral, (node) => typeLiteralVisitor(ctx, node)),
			Match.when(AST.isTupleType, (node) => tupleTypeVisitor(ctx, node)),
			Match.when(AST.isUnion, (node) => unionVisitor(ctx, node)),
			Match.when(AST.isRefinement, (node) => refinementVisitor(ctx, node)),
			Match.when(AST.isTransformation, (node) =>
				transformationVisitor(ctx, node),
			),
			Match.when(AST.isSuspend, (node) => {
				// Resolve underlying AST with depth limiting.
				let target: AST.AST;
				try {
					target = node.f();
				} catch {
					// If thunk throws just skip.
					return Endo.of(Endo.id);
				}
				return shouldExpandSuspend(target)
					? visit(ctx, target)
					: Endo.of(Endo.id);
			}),

			Match.exhaustive,
		);

	const visitRoot: Endo.Visit<Ctx.Root> = (ctx, ast) =>
		Match.value(ast).pipe(
			Match.withReturnType<Endo.Prog>(),

			Match.when(AST.isTypeLiteral, (node) => typeLiteralVisitor(ctx, node)),
			Match.when(AST.isTransformation, (node) =>
				transformationVisitor(ctx, node),
			),
			Match.when(AST.isUnion, (node) => unionVisitor(ctx, node)),
			Match.when(AST.isSuspend, (node) => {
				let target: AST.AST;
				try {
					target = node.f();
				} catch {
					return Endo.of(Endo.id);
				}
				return shouldExpandSuspend(target)
					? visit(ctx, target)
					: Endo.of(Endo.id);
			}),

			Match.orElse((node) =>
				Endo.fail(
					new Errors.IllegalRootNode({
						expectedNode: 'TypeLiteral',
						actualNode: node._tag,
					}),
				),
			),
		);

	const visit: Endo.Visit<Ctx.Any> = (ctx, node) =>
		Ctx.$match(ctx, {
			Root: (ctxRoot) => visitRoot(ctxRoot, node),
			Node: (ctxNode) => visitNode(ctxNode, node),
		});

	const typeLiteralVisitor = Visitors.makeTypeLiteralVisitor(visit);
	const tupleTypeVisitor = Visitors.makeTupleTypeVisitor(visitNode);
	const unionVisitor = Visitors.makeUnionVisitor(visit);
	const refinementVisitor = Visitors.makeRefinementVisitor(visitNode);
	const transformationVisitor = Visitors.makeTransformationVisitor(visit);

	return pipe(
		visit,
		(visit) => visit(Ctx.Root(), schema.ast),
		Either.map((endo) => endo(Constraints.empty())),
		Either.getOrThrowWith((error) => {
			throw error;
		}),
		Constraints.toRecord,
	);
};
