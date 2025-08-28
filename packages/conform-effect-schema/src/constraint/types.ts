import type * as AST from 'effect/SchemaAST';

import type { Ctx } from './ctx';

import type { Endo } from './constraints-endo';

export type VisitEndo<
	CTX extends Ctx.Ctx = Ctx.Ctx,
	Ast extends AST.AST = AST.AST,
> = (ctx: CTX, node: Readonly<Ast>) => Endo.Prog;

export type MakeVisitorEndo<CTX extends Ctx.Ctx, Ast extends AST.AST> = (
	rec: VisitEndo<CTX>,
) => VisitEndo<CTX, Ast>;

export type { Errors } from './errors';
