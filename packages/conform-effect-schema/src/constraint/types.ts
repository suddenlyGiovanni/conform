/* eslint-disable import/export,@typescript-eslint/no-namespace */
import type * as AST from 'effect/SchemaAST';
import type { Constraint } from '@conform-to/dom';
import * as Either from 'effect/Either';
import { identity } from 'effect/Function';

import type { Ctx } from './ctx';
import { Constraints } from './constraints';
import type { Errors } from './errors';

type Endomorphism<A> = (a: A) => A;

export type VisitEndo<
	CTX extends Ctx.Ctx = Ctx.Ctx,
	Ast extends AST.AST = AST.AST,
> = (ctx: CTX, node: Readonly<Ast>) => Endo.Prog;

export type MakeVisitorEndo<CTX extends Ctx.Ctx, Ast extends AST.AST> = (
	rec: VisitEndo<CTX>,
) => VisitEndo<CTX, Ast>;

export declare namespace Endo {
	type Endo = Endomorphism<Constraints.Constraints>;
	type Prog = Either.Either<Endo, Errors>;
}

export class Endo {
	static readonly id: Endo.Endo = identity;

	static readonly compose =
		(...fns: ReadonlyArray<Endo.Endo>): Endo.Endo =>
		(c) =>
			fns.reduce((s, f) => f(s), c);

	static readonly fail = (error: Errors): Endo.Prog => Either.left(error);

	static readonly flatMap = (
		p: Endo.Prog,
		f: (e: Endo.Endo) => Endo.Prog,
	): Endo.Prog => Either.flatMap(p, f);

	static readonly map = (
		p: Endo.Prog,
		f: (e: Endo.Endo) => Endo.Endo,
	): Endo.Prog => Either.map(p, f);

	static readonly of = (endo: Endo.Endo): Endo.Prog => Either.right(endo);

	static readonly patch =
		(
			path: Constraints.Path,
			constraintFragment: Partial<Constraint>,
		): Endo.Endo =>
		(constraints) =>
			Constraints.modify(constraints, path, constraintFragment);
}

export type { Errors } from './errors';
