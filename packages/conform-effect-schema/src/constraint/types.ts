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

export interface Ctx {
	path: string;
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
export type Rec = (ast: AST.AST, ctx: Ctx) => EndoHash;

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
) => (node: A, ctx: Ctx) => EndoHash;
