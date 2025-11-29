import remarkPresetLintRecommended from 'remark-preset-lint-recommended';
import remarkLintNoUndefinedReferences from 'remark-lint-no-undefined-references';

const remarkConfig = {
  plugins: [
    remarkPresetLintRecommended,
    // Allow text inside [brackets] without treating as broken references
    [remarkLintNoUndefinedReferences, { allow: ['VERIFIED', 'INFERRED', 'CLAIMED', 'EVIDENCE NEEDED', 'x', ' '] }],
  ],
};

export default remarkConfig;
