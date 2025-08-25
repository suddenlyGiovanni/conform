import type * as AST from 'effect/SchemaAST';
// import type { Errors } from './errors';

import type {
	IllegalRootNode,
	MissingNodeImplementationError,
	UnsupportedNodeError,
} from './errors';
import type { Ctx } from './ctx';
import type { Constraints } from './constraints';

export type Errors =
	| UnsupportedNodeError
	| MissingNodeImplementationError
	| IllegalRootNode;

/**
 * A pure endomorphism over the constraints collection.
 *
 * Represents a transformation that takes an existing {@link Constraints} value
 * and returns a new one with edits applied. This shape makes composition and
 * reduction straightforward and testable.
 *
 * @see NodeVisitor
 * @private
 */
export type ConstraintsEndo = (
	constraints: Constraints.Constraints,
) => Constraints.Constraints;

/**
 * Recursive visitor for Effect Schema AST (ctx-first, data-last).
 *
 * Reader-style: given the current immutable traversal context, returns a function
 * that interprets an AST node (optionally a specific subtype) and produces an {@link ConstraintsEndo}.
 *
 * @typeParam CTX - The context type this visitor accepts (defaults to Ctx.Type).
 * @typeParam Ast - The specific AST subtype this visitor accepts (defaults to AST.AST).
 * @private
 */
export type NodeVisitor<
	CTX extends Ctx.Ctx = Ctx.Ctx,
	Ast extends AST.AST = AST.AST,
> = (ctx: CTX) => (node: Readonly<Ast>) => ConstraintsEndo;

/**
 * A higher-order function type that creates specialized AST node visitors.
 *
 * Takes a general recursive visitor and transforms it into a visitor specialized for a
 * specific AST node type, while keeping the context type fixed.
 *
 * @typeParam CTX - The context type used during AST traversal (defaults to Ctx.Type).
 * @typeParam Ast - The specific AST node type this visitor will handle (defaults to AST.AST).
 * @param rec - The general recursive visitor that handles any AST node for the same context type.
 * @returns A specialized visitor function that processes only nodes of type Ast for the same CTX.
 * @private
 */

export type MakeNodeVisitor<CTX extends Ctx.Ctx, Ast extends AST.AST> = (
	rec: NodeVisitor<CTX>,
) => NodeVisitor<CTX, Ast>;
