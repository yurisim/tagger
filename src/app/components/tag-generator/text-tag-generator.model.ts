export interface TagResult {
  tag: string;
  score: number;
  frequency: number;
  type?: string;
}

export interface GeneratorOptions {
  maxTags?: number;
  minWordLength?: number;
  minFrequency?: number;
  includeNgrams?: boolean;
  ngramSizes?: number[];
  minNgramSize?: number;
  maxNgramSize?: number;
  caseSensitive?: boolean;
}
