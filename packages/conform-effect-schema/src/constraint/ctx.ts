import type * as AST from 'effect/SchemaAST';

interface Tag<T extends string> {
	readonly _tag: T;
}

interface Path<P extends string> {
	/**
	 * Semantics of `path`:
	 * - `''` (empty string) denotes the root context (no parent path).
	 * - Nested object properties use dot-notation: e.g. `user.email`.
	 * - Array-like items use bracket or rest syntax:
	 *   - Tuple element: `items[0]`
	 *   - Array element (rest): `items[]`
	 *
	 * Invariants:
	 * - `path` is always defined (use `''` for root).
	 * - Handlers must not mutate `ctx`; create a new `Ctx` when descending:
	 *   - Example: `{ path: ctx.path ? ctx.path + '.' + key : key }`
	 *   - Example (array item): `{ path: ctx.path + '[]' }`
	 * @example
	 * // Root
	 * const root: Ctx.Type = { path: '' }
	 *
	 * // Entering a property "profile" from root
	 * const next: Ctx.Type = { path: 'profile' }
	 *
	 * // Entering nested property "email"
	 * const nested: Ctx.Type = { path: 'profile.email' }
	 *
	 * // Entering an array item of "tags"
	 * const arrItem: Ctx.Type = { path: 'tags[]' }
	 */
	readonly path: P;
}

interface Parent<Ast extends AST.AST> {
	readonly parentNode: Readonly<Ast>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Ctx {
	/**
	 * Immutable traversal context threaded through the AST visitor.
	 *
	 * Purpose:
	 * - Carry the current logical path at which constraints should be written.
	 * - Keep traversal metadata separate from the AST node (the node is passed as a separate parameter).
	 */
	type Type<P extends string = string, Ast extends AST.AST = AST.AST> =
		| Root
		| Node<P, Ast>;
}
class Root implements Tag<'Root'> {
	readonly _tag = 'Root';
}

class Node<const P extends string, const Ast extends AST.AST>
	implements Tag<'Node'>, Path<P>, Parent<Ast>
{
	readonly _tag = 'Node';
	readonly parentNode: Readonly<Ast>;
	readonly path: P;

	constructor(arg: { path: P; parentNode: Readonly<Ast> }) {
		this.path = arg.path;
		this.parentNode = arg.parentNode;
	}
}

export class Ctx {
	static root = (): Root => new Root();

	static node = <const P extends string, const Ast extends AST.AST>(
		path: P,
		parentNode: Readonly<Ast>,
	): Node<P, Ast> => new Node({ path, parentNode });

	static isRoot = <const P extends string, const Ast extends AST.AST>(
		ctx: Readonly<Ctx.Type<P, Ast>>,
	): ctx is Root => ctx._tag === 'Root';

	static isNode = <const P extends string, const Ast extends AST.AST>(
		ctx: Readonly<Ctx.Type<P, Ast>>,
	): ctx is Node<P, Ast> => ctx._tag === 'Node';
}
