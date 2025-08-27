import type * as AST    from 'effect/SchemaAST'
import type * as Either from 'effect/Either'

import type { Errors }      from './errors'
import type { Ctx }         from './ctx'
import type { Constraints } from './constraints'

export type ResultConstraints = Either.Either<Constraints.Constraints, Errors>;

export type Visit<
		CTX extends Ctx.Ctx = Ctx.Ctx,
		Ast extends AST.AST = AST.AST,
> = (
		ctx: CTX,
		node: Readonly<Ast>,
		acc: Constraints.Constraints,
) => ResultConstraints;

export type MakeVisitor<CTX extends Ctx.Ctx, Ast extends AST.AST> = (
		rec: Visit<CTX>,
) => (
		ctx: CTX,
		node: Readonly<Ast>,
		acc: Constraints.Constraints,
) => ResultConstraints;

export type { Errors } from './errors'
