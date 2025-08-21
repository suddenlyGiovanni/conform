import type * as AST from 'effect/SchemaAST';

interface Path<S extends string> {
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
	 * const root: Ctx = { path: '' }
	 *
	 * // Entering a property "profile" from root
	 * const next: Ctx = { path: 'profile' }
	 *
	 * // Entering nested property "email"
	 * const nested: Ctx = { path: 'profile.email' }
	 *
	 * // Entering an array item of "tags"
	 * const arrItem: Ctx = { path: 'tags[]' }
	 */
	readonly path: S;
}

interface Parent<Ast extends AST.AST> {
	readonly parent: Readonly<Ast>;
}

/**
 * Immutable traversal context threaded through the AST visitor.
 *
 * Purpose:
 * - Carry the current logical path at which constraints should be written.
 * - Keep traversal metadata separate from the AST node (the node is passed as a separate parameter).
 */
export type Ctx<S extends string = string, Ast extends AST.AST = AST.AST> =
	| RootCtx
	| NodeCtx<S, Ast>;

class RootCtx implements Path<''> {
	readonly _tag = 'RootCtx';
	readonly path = '';
}

class NodeCtx<S extends string, Ast extends AST.AST>
	implements Path<S>, Parent<Ast>
{
	readonly _tag = 'NodeCtx';
	readonly parent: Readonly<Ast>;
	readonly path: S;

	constructor(arg: { path: S; parent: Readonly<Ast> }) {
		this.path = arg.path;
		this.parent = arg.parent;
	}
}

export const root = () => new RootCtx();

export const node = <S extends string, Ast extends AST.AST>(arg: {
	path: S;
	parent: Readonly<Ast>;
}) =>
	new NodeCtx({
		path: arg.path,
		parent: arg.parent,
	});

export const isRoot = (ctx: Readonly<Ctx>): ctx is RootCtx =>
	ctx._tag === 'RootCtx';

export const isNode = <S extends string, Ast extends AST.AST>(
	ctx: Readonly<Ctx<S, Ast>>,
): ctx is NodeCtx<S, Ast> => ctx._tag === 'NodeCtx';
