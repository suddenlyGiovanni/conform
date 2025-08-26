import type * as AST from 'effect/SchemaAST';
import type * as Either from 'effect/Either';

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

export type ReturnConstraints = Either.Either<Constraints.Constraints, Errors>;

export type ConstraintsEndo = (
	constraints: Constraints.Constraints,
) => ReturnConstraints;

export type NodeVisitor<
	CTX extends Ctx.Ctx = Ctx.Ctx,
	Ast extends AST.AST = AST.AST,
> = (ctx: CTX) => (node: Readonly<Ast>) => ConstraintsEndo;

export type MakeNodeVisitor<CTX extends Ctx.Ctx, Ast extends AST.AST> = (
	rec: NodeVisitor<CTX>,
) => NodeVisitor<CTX, Ast>;
