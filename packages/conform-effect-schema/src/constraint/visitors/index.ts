import { makeRefinementVisitor } from './refinement-visitor';
import { makeTransformationVisitor } from './transformation-visitor';
import { makeTupleTypeVisitor } from './tuple-type-visitor';
import { makeTypeLiteralVisitor } from './type-literal-visitor';
import { makeUnionVisitor } from './union-visitor';

export const Visitors = {
	makeRefinementVisitor,
	makeTransformationVisitor,
	makeTupleTypeVisitor,
	makeTypeLiteralVisitor,
	makeUnionVisitor,
};
