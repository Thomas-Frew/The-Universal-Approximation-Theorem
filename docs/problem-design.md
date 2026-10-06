# Problem Design Principles

## Rules

i. Inputs must be determistic to outputs, 1:1 without any external factors.
ii. A problem's title must hint at its solution, and be the only thing to do so.
iii. Sample inputs must be given such that the problem can be solved with no queries or wrong answers.
iv. Time or space complexity must never be an issue.
v. The first 10 elements of the input space must not give the same output.
vi. Problems must not repeat concepts or classes of concepts.
vii. Problems must test a single concept or idea only, no composition of ideas.
viii. Problems must be solveable in every language and not use language-specific features, like BigInt.
ix. Problem solutions must be explainable in a single sentence.

## Ideals

i. Problems should use as few inputs as possible.
ii. Problems should use as few outputs as possible.
iii. Problems should be solveable by the average 2nd year computer science student.
iv. Problems should have a minimal input space, so that the relationship can be easily reasoned about, but not hacked.
v. The kth element of the input space should differ from the previous k-1 elements as soon as possible.
vi. Problems should not be added or removed in the future, without very good reason.
vii. Problems should increase roughly linearly with difficulty.