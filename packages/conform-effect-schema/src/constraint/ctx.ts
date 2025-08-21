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

/**
 * Immutable traversal context threaded through the AST visitor.
 *
 * Purpose:
 * - Carry the current logical path at which constraints should be written.
 * - Keep traversal metadata separate from the AST node (the node is passed as a separate parameter).
 */
export type Type<P extends string = string, Ast extends AST.AST = AST.AST> =
	| Root
	| Node<P, Ast>;

class Root implements Tag<'Root'>, Path<''> {
	readonly _tag = 'Root';
	readonly path = '';
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

export const root = (): Root => new Root();

export const node = <const S extends string, const Ast extends AST.AST>(
	path: S,
	parentNode: Readonly<Ast>,
): Node<S, Ast> => new Node({ path, parentNode });

export const isRoot = <const P extends string, const Ast extends AST.AST>(
	ctx: Readonly<Type<P, Ast>>,
): ctx is Root => ctx._tag === 'Root';

export const isNode = <const P extends string, const Ast extends AST.AST>(
	ctx: Readonly<Type<P, Ast>>,
): ctx is Node<P, Ast> => ctx._tag === 'Node';

export const childProperty = <
	const ParentPath extends string,
	const ParentAst extends AST.AST,
	const Ast extends AST.AST,
	const K extends string,
>(
	parentCtx: Readonly<Node<ParentPath, ParentAst>>,
	parentNode: Readonly<Ast>,
	key: K,
) => node(`${parentCtx.path}.${key}`, parentNode);

export const childArrayItem = <
	const ParentPath extends string,
	const ParentAst extends AST.AST,
	const Ast extends AST.AST,
>(
	parentCtx: Readonly<Node<ParentPath, ParentAst>>,
	parentNode: Readonly<Ast>,
) => node(`${parentCtx.path}[]`, parentNode);

export const childTupleIndex = <
	const ParentPath extends string,
	const ParentAst extends AST.AST,
	const Ast extends AST.AST,
	const Idx extends number,
>(
	parentCtx: Readonly<Node<ParentPath, ParentAst>>,
	parentAst: Readonly<Ast>,
	index: Idx,
) => node(`${parentCtx.path}[${index}]`, parentAst);
