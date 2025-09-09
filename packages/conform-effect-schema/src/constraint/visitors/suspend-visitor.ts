import type * as AST from "effect/SchemaAST";
import type { Ctx } from "../types";
import { Endo } from "../types";

/**
 * Factory for a Suspend node visitor.
 * @param visit recursive dispatcher (Ctx.Any)
 * @param shouldExpand function deciding whether to expand the resolved target AST.
 */
export const makeSuspendVisitor =
	(
		visit: Endo.Visit<Ctx.Any>,
		shouldExpand: (target: AST.AST) => boolean,
	): Endo.Visit<Ctx.Any, AST.Suspend> =>
	(ctx, node) => {
		const target = node.f()
	
		return shouldExpand(target)
			? visit(ctx, target) 
			: Endo.of(Endo.id);
	};
