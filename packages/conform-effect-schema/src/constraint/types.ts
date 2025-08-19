import type { Constraint } from '@conform-to/dom';
import type * as HashMap from 'effect/HashMap';
import type * as AST from 'effect/SchemaAST';

/**
 * A pure endomorphism over the constraints map.
 *
 * Represents a transformation that takes an existing HashMap of field constraints
 * and returns a new HashMap with edits applied. This shape makes composition and
 * reduction straightforward and testable.
 *
 * @typeParam K - The key type of the map (defaults to string).
 * @typeParam V - The value type of the map (defaults to Constraint).
 * @see Rec
 * @private
 */
export type EndoHash = (
	data: HashMap.HashMap<string, Constraint>,
) => HashMap.HashMap<string, Constraint>;

// eslint-disable-next-line @typescript-eslint/no-namespace -- this is a type alias
export declare namespace Ctx {
	/**
	 * Immutable traversal context threaded through the AST visitor.
	 *
	 * Purpose:
	 * - Carry the current logical path at which constraints should be written.
	 * - Keep traversal metadata separate from the AST node (the node is passed as a separate parameter).
	 *
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
	 *
	 * Extensibility:
	 * - Start minimal with `path`. If you later need more context (e.g., parent, ancestors,
	 *   discriminant keys, tuple indices), add fields here without changing the public API shape.
	 *
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
	interface Ctx {
		readonly path: string;
	}
}

export class Ctx implements Ctx.Ctx {
	readonly #path: string;

	private constructor(args: Ctx.Ctx) {
		this.#path = args.path;
	}

	get path(): string {
		return this.#path;
	}

	static make(arg: Partial<Ctx.Ctx>): Ctx {
		return new Ctx({
			path: arg?.path ?? '',
		});
	}

	static root(): Ctx {
		return Ctx.make({});
	}
}

/**
 * The recursive visitor function used to traverse an Effect Schema AST, producing
 * a pure transformation over the constraints map.
 *
 * Callers pass the current AST node and the current logical path (field name)
 * and receive an endomorphism that applies edits for that node and its children.
 *
 * @param ast - The current AST node to visit.
 * @param ctx - The current traversal context (at minimum, the path).
 * @returns A pure endomorphism that applies this node's constraints and recurses into children.
 * @see EndoHash
 * @private
 */
export type Rec = (ast: Readonly<AST.AST>, ctx: Readonly<Ctx.Ctx>) => EndoHash;

/**
 * A higher-order node handler that implements the logic for a specific AST node type.
 *
 * Handlers are parameterized by the recursive function (Rec) so they can recurse
 * into child nodes without relying on module-level imports (avoids cycles and
 * improves testability).
 *
 * @typeParam A - The concrete AST node type this handler processes.
 * @param rec - The recursive function used to process child nodes.
 * @returns A function that, given a node of type A and the current context, returns an EndoHash.
 * @see Rec
 * @see EndoHash
 * @private
 */
export type NodeHandler<A extends AST.AST> = (
	rec: Rec,
) => (node: Readonly<A>, ctx: Readonly<Ctx.Ctx>) => EndoHash;
