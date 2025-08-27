import type * as AST from 'effect/SchemaAST';
import type * as Either from 'effect/Either';

import type { Errors } from './errors';
import type { Ctx } from './ctx';
import type { Constraints } from './constraints';
import type { Endo } from './constraints-endo';

export type ResultConstraints = Either.Either<Constraints.Constraints, Errors>;

export type VisitState<
	CTX extends Ctx.Ctx = Ctx.Ctx,
	Ast extends AST.AST = AST.AST,
> = (
	ctx: CTX,
	node: Readonly<Ast>,
	acc: Constraints.Constraints,
) => ResultConstraints;

export type MakeVisitorState<CTX extends Ctx.Ctx, Ast extends AST.AST> = (
	rec: VisitState<CTX>,
) => VisitState<CTX, Ast>;

export type VisitEndo<
	CTX extends Ctx.Ctx = Ctx.Ctx,
	Ast extends AST.AST = AST.AST,
> = (ctx: CTX, node: Readonly<Ast>) => Endo.Prog;

export type MakeVisitorEndo<CTX extends Ctx.Ctx, Ast extends AST.AST> = (
	rec: VisitEndo<CTX>,
) => VisitEndo<CTX, Ast>;

export type { Errors } from './errors';
