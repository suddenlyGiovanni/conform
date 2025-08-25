import type * as AST from 'effect/SchemaAST';

interface Tag<T extends string> {
	readonly _tag: T;
}

interface Path<P extends string> {
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
		P extends string = string,
		ParentAst extends AST.AST = AST.AST,
	> = _Node<P, ParentAst>;

	/**
	 * Immutable traversal context threaded through the AST visitor.
	 *
	 * Purpose:
	 * - Carry the current logical path at which constraints should be written.
	 * - Keep traversal metadata separate from the AST node (the node is passed as a separate parameter).
	 */
	type Ctx<P extends string = string, Ast extends AST.AST = AST.AST> =
		| Root
		| Node<P, Ast>;
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
class _Node<const P extends string, const ParentAst extends AST.AST>
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
	static Root = (): Ctx.Root => new _Root();

	static Node = <const P extends string, const ParentAst extends AST.AST>(
		path: P,
		parentNode: Readonly<ParentAst>,
	): Ctx.Node<P, ParentAst> => new _Node({ path, parentNode });

	static isRoot = <const P extends string, const ParentAst extends AST.AST>(
		ctx: Readonly<Ctx.Ctx<P, ParentAst>>,
	): ctx is Ctx.Root => ctx._tag === 'Root';

	static isNode = <const P extends string, const ParentAst extends AST.AST>(
		ctx: Readonly<Ctx.Ctx<P, ParentAst>>,
	): ctx is Ctx.Node<P, ParentAst> => ctx._tag === 'Node';
}
