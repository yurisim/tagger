// Scoring weights for different factors
export const SCORING_WEIGHTS = {
  word: {
    termFrequency: 0.45,
    lengthBonus: 0.1,
    frequencySignificance: 0.45
  },
  phrase: {
    componentScore: 0.4,
    frequencyScore: 0.3,
    cohesionScore: 0.2,
    lengthPenalty: 0.1
  }
};

// Optimal relative frequency for scoring (3% of total words)
export const OPTIMAL_RELATIVE_FREQUENCY = 0.03;

// Frequency significance decay factor
export const FREQUENCY_DECAY_FACTOR = 50;

// Common English stop words
export const STOP_WORDS: Set<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'would', 'could', 'should', 'this',
  'these', 'they', 'them', 'their', 'there', 'then', 'than', 'when',
  'where', 'who', 'which', 'what', 'how', 'why', 'but', 'or', 'so',
  'if', 'can', 'have', 'had', 'been', 'being', 'do', 'does', 'did', 'through',
  'very', 'really', 'quite', 'just', 'only', 'also', 'even', 'still',
  // Additional pronouns
  'i', 'you', 'we', 'us', 'me', 'my', 'your', 'our', 'his', 'her', 'him','she','he',
  // Additional determiners
  'some', 'any', 'all', 'each', 'every', 'no', 'both', 'either', 'neither', 'such',
  // Additional prepositions
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond',
  'during', 'except', 'inside', 'into', 'near', 'over', 'since', 'under',
  'until', 'upon', 'within', 'without',
  // Common low-semantic verbs
  'get', 'got', 'make', 'made', 'take', 'took', 'come', 'came', 'go', 'went',
  'see', 'saw', 'know', 'knew', 'think', 'thought', 'say', 'said', 'give', 'gave',
  // Modal verbs
  'may', 'might', 'must', 'shall', 'ought',
  // Quantifiers and intensifiers
  'much', 'many', 'more', 'most', 'less', 'few', 'little', 'enough', 'too',
  'rather', 'pretty', 'fairly',
  // Negation
  'not', 'none', 'nothing', 'nobody', 'nowhere'
]);
