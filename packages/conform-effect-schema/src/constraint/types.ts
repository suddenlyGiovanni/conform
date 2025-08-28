/* eslint-disable import/export,@typescript-eslint/no-namespace */
import type * as AST from 'effect/SchemaAST';
import type { Constraint } from '@conform-to/dom';
import * as Either from 'effect/Either';
import { identity } from 'effect/Function';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import * as Option from 'effect/Option';

import type { Ctx } from './ctx';
import type { Errors } from './errors';

export declare namespace Constraints {
	type Path = string;
	type Constraints = HashMap.HashMap<Path, Constraint>;
}

export class Constraints {
	/**
	 * Construct an empty constraints collection.
	 * @private
	 */
	static empty = (): Constraints.Constraints =>
		HashMap.empty<Constraints.Path, Constraint>();

	static modify = (
		constraints: Constraints.Constraints,
		path: Constraints.Path,
		patch: Partial<Constraint>,
	): Constraints.Constraints =>
		HashMap.modifyAt(constraints, path, (maybeConstraint) =>
			Option.some({
				...Option.getOrElse(maybeConstraint, Record.empty),
				...patch,
			}),
		);

	static set = (
		constraints: Constraints.Constraints,
		path: Constraints.Path,
		patch: Partial<Constraint>,
	): Constraints.Constraints => HashMap.set(constraints, path, patch);

	/**
	 * Materialize a constraints collection to a plain record.
	 * @private
	 */
	static toRecord = (
		constraints: Constraints.Constraints,
	): Record.ReadonlyRecord<string, Constraint> =>
		Record.fromEntries(constraints);
}

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
