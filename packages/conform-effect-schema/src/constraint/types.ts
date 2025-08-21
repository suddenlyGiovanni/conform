/* eslint-disable @typescript-eslint/no-namespace */

import type { Constraint } from '@conform-to/dom';
import * as HashMap from 'effect/HashMap';
import * as Record from 'effect/Record';
import type * as AST from 'effect/SchemaAST';

export declare namespace Constraints {
	type Constraints = HashMap.HashMap<string, Constraint>;
}

export class Constraints {
	/**
	 * Construct an empty constraints collection.
	 * @private
	 */

	static empty = (): Constraints.Constraints =>
		HashMap.empty<string, Constraint>();

	/**
	 * Materialize a constraints collection to a plain record.
	 * @private
	 */
	static toRecord = (
		constraints: Constraints.Constraints,
	): Record.ReadonlyRecord<string, Constraint> =>
		Record.fromEntries(constraints);
}

/**
 * A pure endomorphism over the constraints collection.
 *
 * Represents a transformation that takes an existing {@link Constraints} value
 * and returns a new one with edits applied. This shape makes composition and
 * reduction straightforward and testable.
 *
 * @see NodeVisitor
 * @private
 */
export type ConstraintsEndo = (
	constraints: Constraints.Constraints,
) => Constraints.Constraints;

/**
 * Immutable traversal context threaded through the AST visitor.
 *
 * Purpose:
 * - Carry the current logical path at which constraints should be written.
 * - Keep traversal metadata separate from the AST node (the node is passed as a separate parameter).
 */
export declare namespace Ctx {
	interface Ctx {
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

	static make(arg: Partial<Ctx.Ctx>): Readonly<Ctx.Ctx> {
		return new Ctx({
			path: arg?.path ?? '',
		});
	}

	static root(): Readonly<Ctx.Ctx> {
		return Ctx.make({});
	}
}

/**
 * Recursive visitor for Effect Schema AST (ctx-first, data-last).
 *
 * Reader-style: given the current immutable traversal context, returns a function
 * that interprets an AST node (optionally a specific subtype) and produces an {@link ConstraintsEndo}.
 *
 * @typeParam Ast - The specific AST subtype this visitor accepts (defaults to AST.AST).
 * @private
 */
export type NodeVisitor<Ast extends AST.AST> = (
	ctx: Readonly<Ctx.Ctx>,
) => (node: Readonly<Ast>) => ConstraintsEndo;

/**
 * A node-specific visitor transformer.
 *
 * Given the general recursive visitor, returns a specialized visitor `NodeVisitor<Ast>`
 * that handles a specific AST subtype.
 *
 * @typeParam Ast - The AST subtype handled by this visitor.
 * @private
 */
export type MakeNodeVisitor<Ast extends AST.AST> = (
	rec: NodeVisitor<AST.AST>,
) => NodeVisitor<Ast>;
