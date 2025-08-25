import type * as AST from 'effect/SchemaAST';

import type { Ctx } from './ctx';
import type { Constraints } from './constraints';

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
 * @typeParam Ast - The specific AST subtype this visitor accepts (defaults to AST.AST).
 * @private
 */
export type NodeVisitor<
	Ast extends AST.AST = AST.AST,
	CTX extends Ctx.Type = Ctx.Type,
> = (ctx: CTX) => (node: Readonly<Ast>) => ConstraintsEndo;

/**
 * A node-specific visitor transformer.
 *
 * Given the general recursive visitor, returns a specialized visitor `NodeVisitor<Ast>`
 * that handles a specific AST subtype.
 *
 * @typeParam Ast - The AST subtype handled by this visitor.
 * @private
 */
export type MakeNodeVisitor<
	Ast extends AST.AST,
	CTX extends Ctx.Type = Ctx.Type,
> = (rec: NodeVisitor) => NodeVisitor<Ast, CTX>;
