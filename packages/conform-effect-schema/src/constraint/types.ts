/* eslint-disable import/export,@typescript-eslint/no-namespace */
import type * as AST from 'effect/SchemaAST';
import type { Constraint } from '@conform-to/dom';
import * as Either from 'effect/Either';
import { identity } from 'effect/Function';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import * as Option from 'effect/Option';

import type { Errors } from './errors';

export type ConstraintDictionary = Record.ReadonlyRecord<string, Constraint>;

interface Tag<T extends string> {
	readonly _tag: T;
}

type Endomorphism<A> = (a: A) => A;

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
	): ConstraintDictionary => Record.fromEntries(constraints);
}

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

interface Path<P extends Constraints.Path> {
	/**
	 * Semantics of `path`:
	 * - Nested object properties use dot-notation: e.g. `user.email`.
	 * - Array-like items use bracket or rest syntax:
	 *   - Tuple element: `items[0]`
	 *   - Array element (rest): `items[]`
	 */
	readonly path: P;
}

interface Parent<ParentAst extends AST.AST> {
	readonly parentNode: Readonly<ParentAst>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Ctx {
	type Root = _Root;

	type Node<
		P extends Constraints.Path = string,
		ParentAst extends AST.AST = AST.AST,
	> = _Node<P, ParentAst>;

	/**
	 * Immutable traversal context threaded through the AST visitor.
	 *
	 * Purpose:
	 * - Carry the current logical path at which constraints should be written.
	 * - Keep traversal metadata separate from the AST node (the node is passed as a separate parameter).
	 */
	type Ctx<
		P extends Constraints.Path = string,
		Ast extends AST.AST = AST.AST,
	> = Root | Node<P, Ast>;
}

/**
 * @internal
 */
class _Root implements Tag<'Root'> {
	readonly _tag = 'Root';
}

/**
 * @internal
 */
class _Node<const P extends Constraints.Path, const ParentAst extends AST.AST>
	implements Tag<'Node'>, Path<P>, Parent<ParentAst>
{
	readonly _tag = 'Node';
	readonly parentNode: Readonly<ParentAst>;
	readonly path: P;

	constructor(arg: { path: P; parentNode: Readonly<ParentAst> }) {
		this.path = arg.path;
		this.parentNode = arg.parentNode;
	}
}

export class Ctx {
	static Node = <
		const P extends Constraints.Path,
		const ParentAst extends AST.AST,
	>(
		path: P,
		parentNode: Readonly<ParentAst>,
	): Ctx.Node<P, ParentAst> => new _Node({ path, parentNode });

	static Root = (): Ctx.Root => new _Root();

	static isNode = <
		const P extends Constraints.Path,
		const ParentAst extends AST.AST,
	>(
		ctx: Readonly<Ctx.Ctx<P, ParentAst>>,
	): ctx is Ctx.Node<P, ParentAst> => ctx._tag === 'Node';

	static isRoot = <
		const P extends Constraints.Path,
		const ParentAst extends AST.AST,
	>(
		ctx: Readonly<Ctx.Ctx<P, ParentAst>>,
	): ctx is Ctx.Root => ctx._tag === 'Root';
}

export type { Constraint } from '@conform-to/dom';
