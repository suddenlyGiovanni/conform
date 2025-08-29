/* eslint-disable import/export,@typescript-eslint/no-namespace */
import type * as AST from 'effect/SchemaAST';
import type { Constraint } from '@conform-to/dom';
import * as Either from 'effect/Either';
import { identity, pipe } from 'effect/Function';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import * as ReadonlyArray from 'effect/Array';
import * as Option from 'effect/Option';
import * as Data from 'effect/Data';

import type { Errors } from './errors';

export type ConstraintRecord = Record.ReadonlyRecord<string, Constraint>;

type Endomorphism<A> = (a: A) => A;

export declare namespace Constraints {
	type Path = string;
	type Map = HashMap.HashMap<Path, Constraint>;
}

export class Constraints {
	/**
	 * Construct an empty constraints collection.
	 * @private
	 */
	static empty = (): Constraints.Map =>
		HashMap.empty<Constraints.Path, Constraint>();

	static modify = (
		constraints: Constraints.Map,
		path: Constraints.Path,
		patch: Partial<Constraint>,
	): Constraints.Map =>
		HashMap.modifyAt(constraints, path, (maybeConstraint) =>
			Option.some({
				...Option.getOrElse(maybeConstraint, Record.empty),
				...patch,
			}),
		);

	static set = (
		constraints: Constraints.Map,
		path: Constraints.Path,
		patch: Partial<Constraint>,
	): Constraints.Map => HashMap.set(constraints, path, patch);

	/**
	 * Materialize a constraints collection to a plain record.
	 * @private
	 */
	static toRecord = (constraints: Constraints.Map): ConstraintRecord =>
		Record.fromEntries(constraints);
}

export declare namespace Endo {
	type Endo = Endomorphism<Constraints.Map>;
	type Prog = Either.Either<Endo, Errors>;

	type Visit<CTX extends Ctx.Any, Ast extends AST.AST = AST.AST> = (
		ctx: CTX,
		node: Readonly<Ast>,
	) => Prog;

	type MakeVisitor<CTX extends Ctx.Any, Ast extends AST.AST> = (
		rec: Visit<CTX>,
	) => Visit<CTX, Ast>;
}
export class Endo {
	/**
	 * Identity operation over the constraints map.
	 */
	static readonly id: Endo.Endo = identity;

	/**
	 * Left-to-right composition. compose(a, b, c)(s) === c(b(a(s))).
	 */
	static readonly compose =
		<Endos extends readonly Endo.Endo[]>(...endos: Endos): Endo.Endo =>
		(constraintsMap) =>
			pipe(
				endos,
				ReadonlyArray.reduce(constraintsMap, (c, endo) => endo(c)),
			);

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

export const Ctx = Data.taggedEnum<Ctx.Any>();
export declare namespace Ctx {
	type Any = Data.TaggedEnum<{
		Node: {
			/**
			 * Path semantics:
			 * - Object properties: "user.email"
			 * - Tuple item: "items[0]"
			 * - Array item (rest): "items[]"
			 */
			readonly path: string;
			readonly parent: AST.AST;
		};
		Root: {};
	}>;

	type Root = Data.TaggedEnum.Value<Any, 'Root'>;

	type Node = Data.TaggedEnum.Value<Any, 'Node'>;
}

export type { Errors } from './errors';

export type { Constraint } from '@conform-to/dom';
