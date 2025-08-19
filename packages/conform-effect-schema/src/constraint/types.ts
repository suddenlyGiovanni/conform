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
 * Recursive visitor for Effect Schema AST (ctx-first, data-last).
 *
 * Reader-style: given the current immutable traversal context, returns a function
 * that interprets an AST node (optionally a specific subtype) and produces an {@link EndoHash}.
 *
 * @typeParam Ast - The specific AST subtype this visitor accepts (defaults to AST.AST).
 * @private
 */
export type Rec<Ast extends AST.AST = AST.AST> = (
	ctx: Readonly<Ctx.Ctx>,
) => (node: Readonly<Ast>) => EndoHash;

/**
 * A node-specific visitor transformer.
 *
 * Given the general recursive visitor `Rec`, returns a specialized visitor `Rec<Ast>`
 * that handles a specific AST subtype.
 *
 * @typeParam Ast - The AST subtype handled by this visitor.
 * @private
 */
export type AstNodeVisitor<Ast extends AST.AST> = (rec: Rec) => Rec<Ast>;
