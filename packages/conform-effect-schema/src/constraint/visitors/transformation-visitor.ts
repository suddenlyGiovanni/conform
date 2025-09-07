import * as AST from 'effect/SchemaAST';

import { Ctx, Endo } from '../types';

export const makeTransformationVisitor: Endo.MakeVisitor<
	Ctx.Any,
	AST.Transformation
> = (visit) => (ctx, node) =>
	Ctx.$match(ctx, {
		Root: (rootCtx) => visit(rootCtx, node.to),
		Node: (nodeCtx) =>
			visit(Ctx.Node({ path: nodeCtx.path, parent: node }), node.to),
	});
