import { Injectable } from '@angular/core';

// ===========================
// INTERFACES AND TYPES
// ===========================

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

// ===========================
// SERVICE IMPLEMENTATION
// ===========================

@Injectable({
  providedIn: 'root'
})
export class TextTagGeneratorService {
  // ===========================
  // CONSTANTS
  // ===========================
  
  // Scoring weights for different factors
  private readonly SCORING_WEIGHTS = {
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
  private readonly OPTIMAL_RELATIVE_FREQUENCY = 0.03;
  
  // Frequency significance decay factor
  private readonly FREQUENCY_DECAY_FACTOR = 50;
  
  // Common English stop words
  private readonly stopWords: Set<string>;
  
  // ===========================
  // CONSTRUCTOR
  // ===========================
  
  constructor() {
    this.stopWords = new Set([
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
    ])
    
  }

  // ===========================
  // PUBLIC API
  // ===========================

  /**
   * Generate tags from paragraph text using statistical analysis
   * Returns N words and N phrases (total of 2N tags) when a user asks for N tags
   * 
   * @param text - The input text to analyze
   * @param options - Configuration options for tag generation
   * @returns Array of TagResult objects sorted by relevance score
   */
  public generateTags(text: string, options: GeneratorOptions = {}): TagResult[] {
    const {
      maxTags = 10,
      minWordLength = 3,
      minFrequency = 1,
      includeNgrams = true,
      ngramSizes = [2],
      minNgramSize,
      maxNgramSize,
      caseSensitive = false
    } = options;

    // Step 1: Preprocess and tokenize text
    const words = this.preprocessText(text, caseSensitive);
    
    // Step 2: Generate word tags
    const wordResults = this.generateWordTags(words, minWordLength, minFrequency, maxTags);
    
    // Step 3: Generate phrase tags if requested
    let phraseResults: TagResult[] = [];
    if (includeNgrams) {
      phraseResults = this.generatePhraseTags(
        words, 
        ngramSizes, 
        minNgramSize, 
        maxNgramSize, 
        minFrequency, 
        maxTags
      );
    }
    
    // Step 4: Combine and filter results
    const allTags = [...wordResults, ...phraseResults];
    const sortedTags = allTags.sort((a, b) => b.score - a.score);
    
    return this.filterComponentWords(sortedTags);
  }

  // ===========================
  // TEXT PREPROCESSING
  // ===========================

  /**
   * Preprocess text: tokenize, clean, and normalize
   * 
   * @param text - Raw input text
   * @param caseSensitive - Whether to preserve case
   * @returns Array of cleaned word tokens
   */
  private preprocessText(text: string, caseSensitive: boolean): string[] {
    let processedText = caseSensitive ? text : text.toLowerCase();

    // Remove possessive forms comprehensively
    processedText = processedText.replace(/(['']s|s[''])\b/g, '');
    
    // Replace non-alphanumeric characters with spaces
    processedText = processedText.replace(/[^\w\s]/g, ' ');
    
    // Normalize whitespace
    processedText = processedText.replace(/\s+/g, ' ').trim();

    // Split and filter
    return processedText
      .split(/\s+/)
      .filter(word => 
        word.length > 1 &&
        !this.stopWords.has(word) &&
        !/^[''"`\-_]+$/.test(word)
      );
  }

  // ===========================
  // WORD TAG GENERATION
  // ===========================

  /**
   * Generate word-based tags with scoring
   * 
   * @param words - Preprocessed word tokens
   * @param minWordLength - Minimum word length to consider
   * @param minFrequency - Minimum frequency threshold
   * @param maxTags - Maximum number of tags to return
   * @returns Array of word tag results
   */
  private generateWordTags(
    words: string[], 
    minWordLength: number, 
    minFrequency: number,
    maxTags: number
  ): TagResult[] {
    // Calculate frequencies
    const wordFreq = this.calculateWordFrequency(words);
    
    // Filter by criteria
    const filteredWords = this.filterWords(wordFreq, minWordLength, minFrequency);
    
    // Calculate scores
    const wordScores = this.calculateWordScores(filteredWords, words.length);
    
    // Create results
    const wordResults: TagResult[] = [];
    for (const [word, score] of wordScores) {
      wordResults.push({
        tag: word,
        score: score,
        frequency: wordFreq.get(word) || 0,
        type: 'word'
      });
    }
    
    // Return top N
    return wordResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTags);
  }

  /**
   * Calculate frequency of each word
   * 
   * @param words - Array of word tokens
   * @returns Map of word to frequency count
   */
  private calculateWordFrequency(words: string[]): Map<string, number> {
    const frequency = new Map<string, number>();
    
    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
    
    return frequency;
  }

  /**
   * Filter words based on length and frequency criteria
   * 
   * @param wordFreq - Word frequency map
   * @param minLength - Minimum word length
   * @param minFrequency - Minimum frequency
   * @returns Filtered word frequency map
   */
  private filterWords(
    wordFreq: Map<string, number>, 
    minLength: number, 
    minFrequency: number
  ): Map<string, number> {
    const filtered = new Map<string, number>();
    
    for (const [word, freq] of wordFreq) {
      if (word.length >= minLength && freq >= minFrequency) {
        filtered.set(word, freq);
      }
    }
    
    return filtered;
  }

  /**
   * Calculate importance scores using statistical measures
   * 
   * @param wordFreq - Filtered word frequencies
   * @param totalWords - Total number of words in document
   * @returns Map of word to calculated score
   */
  private calculateWordScores(
    wordFreq: Map<string, number>, 
    totalWords: number
  ): Map<string, number> {
    const scores = new Map<string, number>();
    const maxFreq = Math.max(...wordFreq.values());
    
    for (const [word, freq] of wordFreq) {
      // 1. Normalized frequency (TF)
      const tf = freq / maxFreq;
      
      // 2. Word length bonus (longer words often more meaningful)
      const lengthBonus = Math.log(word.length) / Math.log(10);
      
      // 3. Frequency significance (not too rare, not too common)
      const freqSignificance = this.calculateFrequencySignificance(freq, totalWords);
      
      // Combine scores with weights
      const finalScore = 
        (tf * this.SCORING_WEIGHTS.word.termFrequency) + 
        (lengthBonus * this.SCORING_WEIGHTS.word.lengthBonus) + 
        (freqSignificance * this.SCORING_WEIGHTS.word.frequencySignificance);
      
      scores.set(word, finalScore);
    }
    
    return scores;
  }

  /**
   * Calculate how significant a frequency is (not too common, not too rare)
   * Uses a bell curve-like function where moderate frequencies score higher
   * 
   * @param frequency - Word frequency
   * @param totalWords - Total words in document
   * @returns Significance score between 0 and 1
   */
  private calculateFrequencySignificance(frequency: number, totalWords: number): number {
    const relativeFreq = frequency / totalWords;
    const distance = Math.abs(relativeFreq - this.OPTIMAL_RELATIVE_FREQUENCY);
    
    return Math.exp(-distance * this.FREQUENCY_DECAY_FACTOR);
  }

  // ===========================
  // PHRASE TAG GENERATION
  // ===========================

  /**
   * Generate phrase-based tags (n-grams) with scoring
   * 
   * @param words - Preprocessed word tokens
   * @param ngramSizes - Explicit n-gram sizes to generate
   * @param minNgramSize - Minimum n-gram size (for range-based generation)
   * @param maxNgramSize - Maximum n-gram size (for range-based generation)
   * @param minFrequency - Minimum frequency threshold
   * @param maxTags - Maximum number of tags to return
   * @returns Array of phrase tag results
   */
  private generatePhraseTags(
    words: string[],
    ngramSizes: number[],
    minNgramSize: number | undefined,
    maxNgramSize: number | undefined,
    minFrequency: number,
    maxTags: number
  ): TagResult[] {
    const ngramScores = this.generateNgrams(
      words, 
      ngramSizes, 
      minNgramSize, 
      maxNgramSize, 
      minFrequency
    );
    
    // Create phrase tag results
    const phraseResults: TagResult[] = [];
    for (const [ngram, { score, frequency }] of ngramScores) {
      phraseResults.push({
        tag: ngram,
        score: score,
        frequency: frequency,
        type: 'phrase'
      });
    }
    
    // Return top N
    return phraseResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTags);
  }

  /**
   * Generate n-grams and score them
   * 
   * @param words - Word tokens
   * @param ngramSizes - Explicit sizes to generate
   * @param minNgramSize - Minimum size for range-based generation
   * @param maxNgramSize - Maximum size for range-based generation
   * @param minFrequency - Minimum frequency threshold
   * @returns Map of n-gram to score and frequency
   */
  private generateNgrams(
    words: string[], 
    ngramSizes: number[] = [2], 
    minNgramSize?: number, 
    maxNgramSize?: number, 
    minFrequency = 1
  ): Map<string, { score: number; frequency: number }> {
    // Get word scores for phrase scoring
    const wordFrequencies = this.calculateWordFrequency(words);
    const wordScores = this.calculateWordScores(wordFrequencies, words.length);
    
    // Determine sizes to generate
    const sizesToGenerate = this.determinNgramSizes(
      ngramSizes, 
      minNgramSize, 
      maxNgramSize
    );
    
    // Generate n-grams
    const ngrams = this.extractNgrams(words, sizesToGenerate);
    
    // Score n-grams
    return this.scoreNgrams(
      ngrams, 
      wordScores, 
      wordFrequencies, 
      words.length, 
      minFrequency
    );
  }

  /**
   * Determine which n-gram sizes to generate
   * 
   * @param ngramSizes - Explicit sizes
   * @param minNgramSize - Minimum size for range
   * @param maxNgramSize - Maximum size for range
   * @returns Array of sizes to generate
   */
  private determinNgramSizes(
    ngramSizes: number[],
    minNgramSize?: number,
    maxNgramSize?: number
  ): number[] {
    if (minNgramSize !== undefined && maxNgramSize !== undefined) {
      // Use range-based generation
      const sizes: number[] = [];
      for (let size = minNgramSize; size <= maxNgramSize; size++) {
        sizes.push(size);
      }
      return sizes;
    }
    
    // Use explicit sizes array
    return ngramSizes;
  }

  /**
   * Extract n-grams from word array
   * 
   * @param words - Word tokens
   * @param sizes - N-gram sizes to extract
   * @returns Map of n-gram to frequency
   */
  private extractNgrams(words: string[], sizes: number[]): Map<string, number> {
    const ngrams = new Map<string, number>();
    
    for (const size of sizes) {
      for (let i = 0; i <= words.length - size; i++) {
        const ngram = words.slice(i, i + size).join(' ');
        ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
      }
    }
    
    return ngrams;
  }

  /**
   * Score n-grams based on multiple factors
   * 
   * @param ngrams - N-gram frequency map
   * @param wordScores - Individual word scores
   * @param wordFrequencies - Individual word frequencies
   * @param totalWords - Total words in document
   * @param minFrequency - Minimum frequency threshold
   * @returns Map of n-gram to score and frequency
   */
  private scoreNgrams(
    ngrams: Map<string, number>,
    wordScores: Map<string, number>,
    wordFrequencies: Map<string, number>,
    totalWords: number,
    minFrequency: number
  ): Map<string, { score: number; frequency: number }> {
    const scoredNgrams = new Map<string, { score: number; frequency: number }>();
    const maxNgramFreq = Math.max(...ngrams.values());
    
    for (const [ngram, freq] of ngrams) {
      if (freq >= minFrequency) {
        const score = this.calculatePhraseScore(
          ngram,
          freq,
          maxNgramFreq,
          wordScores,
          wordFrequencies,
          totalWords
        );
        
        scoredNgrams.set(ngram, { score, frequency: freq });
      }
    }
    
    return scoredNgrams;
  }

  /**
   * Calculate comprehensive score for a phrase
   * 
   * @param phrase - The phrase to score
   * @param phraseFreq - Frequency of the phrase
   * @param maxPhraseFreq - Maximum phrase frequency in corpus
   * @param wordScores - Individual word scores
   * @param wordFrequencies - Individual word frequencies
   * @param totalWords - Total words in document
   * @returns Calculated phrase score
   */
  private calculatePhraseScore(
    phrase: string,
    phraseFreq: number,
    maxPhraseFreq: number,
    wordScores: Map<string, number>,
    wordFrequencies: Map<string, number>,
    totalWords: number
  ): number {
    const phraseWords = phrase.split(' ');
    
    // 1. Average score of component words
    const avgComponentScore = this.calculateAverageComponentScore(phraseWords, wordScores);
    
    // 2. Phrase frequency score (logarithmic scaling)
    const logFreq = Math.log(phraseFreq + 1);
    const maxLogFreq = Math.log(maxPhraseFreq + 1);
    const phraseFreqScore = logFreq / maxLogFreq;
    
    // 3. Phrase cohesion bonus
    const cohesionScore = this.calculateCohesionScore(
      phraseWords, 
      phraseFreq, 
      wordFrequencies, 
      totalWords
    );
    
    // 4. Length penalty
    const lengthPenalty = 1 / Math.sqrt(phraseWords.length);
    
    // Combine scores with weights
    return (avgComponentScore * this.SCORING_WEIGHTS.phrase.componentScore) + 
           (phraseFreqScore * this.SCORING_WEIGHTS.phrase.frequencyScore) + 
           (cohesionScore * this.SCORING_WEIGHTS.phrase.cohesionScore) + 
           (lengthPenalty * this.SCORING_WEIGHTS.phrase.lengthPenalty);
  }

  /**
   * Calculate average score of component words in a phrase
   * 
   * @param phraseWords - Words in the phrase
   * @param wordScores - Individual word scores
   * @returns Average component score
   */
  private calculateAverageComponentScore(
    phraseWords: string[], 
    wordScores: Map<string, number>
  ): number {
    let componentScore = 0;
    let validComponents = 0;
    
    for (const word of phraseWords) {
      if (wordScores.has(word)) {
        componentScore += wordScores.get(word) || 0;
        validComponents++;
      }
    }
    
    return validComponents > 0 ? componentScore / validComponents : 0;
  }

  /**
   * Calculate cohesion score for a phrase
   * Measures how often words appear together vs independently
   * 
   * @param phraseWords - Words in the phrase
   * @param phraseFreq - Frequency of the phrase
   * @param wordFrequencies - Individual word frequencies
   * @param totalWords - Total words in document
   * @returns Cohesion score between 0 and 1
   */
  private calculateCohesionScore(
    phraseWords: string[],
    phraseFreq: number,
    wordFrequencies: Map<string, number>,
    totalWords: number
  ): number {
    // Calculate expected frequency if words were independent
    let expectedFreq = totalWords;
    for (const word of phraseWords) {
      const wordFreq = wordFrequencies.get(word) || 0;
      expectedFreq = Math.min(expectedFreq, wordFreq);
    }
    
    // Cohesion is high when actual frequency approaches or exceeds expected
    return expectedFreq > 0 ? Math.min(phraseFreq / expectedFreq, 1) : 0;
  }

  // ===========================
  // POST-PROCESSING
  // ===========================

  /**
   * Filter out individual words that are components of higher-scoring phrases,
   * longer phrases that contain shorter, higher-scoring phrases,
   * and consolidate singular/plural forms of the same concept
   * 
   * @param tags - All generated tags sorted by score
   * @returns Filtered tags without redundant components
   */
  private filterComponentWords(tags: TagResult[]): TagResult[] {
    const filteredTags: TagResult[] = [];
    const componentWordsToRemove = new Set<string>();
    const phrasesToRemove = new Set<string>();
    const singularPluralSets = new Map<string, TagResult[]>();
    
    // Sort tags by score (highest first)
    const sortedTags = [...tags].sort((a, b) => b.score - a.score);
    
    // Process phrases first to identify components and overlaps
    this.identifyRedundantTags(sortedTags, componentWordsToRemove, phrasesToRemove);
    
    // Group singular/plural variants
    this.groupSingularPluralForms(sortedTags, singularPluralSets, phrasesToRemove);
    
    // Filter final results
    for (const tag of sortedTags) {
      if (tag.type === 'phrase' && !phrasesToRemove.has(tag.tag)) {
        filteredTags.push(tag);
      } else if (tag.type === 'word' && !componentWordsToRemove.has(tag.tag)) {
        filteredTags.push(tag);
      }
    }
    
    return filteredTags;
  }

  /**
   * Identify redundant tags (component words and overlapping phrases)
   * 
   * @param sortedTags - Tags sorted by score
   * @param componentWordsToRemove - Set to populate with component words
   * @param phrasesToRemove - Set to populate with redundant phrases
   */
  private identifyRedundantTags(
    sortedTags: TagResult[],
    componentWordsToRemove: Set<string>,
    phrasesToRemove: Set<string>
  ): void {
    for (const tag of sortedTags) {
      if (tag.type === 'phrase' && !phrasesToRemove.has(tag.tag)) {
        // Mark component words for removal
        const words = tag.tag.split(' ');
        words.forEach(word => componentWordsToRemove.add(word));
        
        // Check for overlapping phrases
        this.checkPhraseOverlaps(tag, sortedTags, phrasesToRemove);
      }
    }
  }

  /**
   * Check if a phrase overlaps with other lower-scoring phrases
   * 
   * @param phrase - The phrase to check
   * @param allTags - All tags to check against
   * @param phrasesToRemove - Set to populate with overlapping phrases
   */
  private checkPhraseOverlaps(
    phrase: TagResult,
    allTags: TagResult[],
    phrasesToRemove: Set<string>
  ): void {
    const phraseWords = phrase.tag.split(' ');
    
    for (const otherTag of allTags) {
      if (otherTag.type === 'phrase' && 
          otherTag.tag !== phrase.tag && 
          otherTag.score < phrase.score) {
        
        const otherWords = otherTag.tag.split(' ');
        
        // Check if phrase appears as a subsequence in other phrase
        if (this.isSubsequence(phraseWords, otherWords)) {
          phrasesToRemove.add(otherTag.tag);
        }
      }
    }
  }

  /**
   * Check if one word array is a subsequence of another
   * 
   * @param needle - Array to search for
   * @param haystack - Array to search in
   * @returns True if needle is found as subsequence in haystack
   */
  private isSubsequence(needle: string[], haystack: string[]): boolean {
    for (let i = 0; i <= haystack.length - needle.length; i++) {
      let matches = true;
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Group and handle singular/plural forms of the same concept
   * Keeps the higher scoring version and marks others for removal
   * 
   * @param sortedTags - Tags sorted by score (highest first)
   * @param singularPluralSets - Map to store related forms
   * @param phrasesToRemove - Set to populate with forms to remove
   */
  private groupSingularPluralForms(
    sortedTags: TagResult[],
    singularPluralSets: Map<string, TagResult[]>,
    phrasesToRemove: Set<string>
  ): void {
    // Direct comparison first - catch exact singular/plural pairs
    this.identifyDirectSingularPluralPairs(sortedTags, phrasesToRemove);
    
    // Then do the more general approach
    // First pass: group potential singular/plural variants
    for (const tag of sortedTags) {
      if (phrasesToRemove.has(tag.tag)) continue;
      
      const base = this.getSingularForm(tag.tag);
      
      // Skip if this is a single-character difference or very short term
      if (Math.abs(tag.tag.length - base.length) <= 1 || tag.tag.length < 4) continue;
      
      // Skip if base is the same as original
      if (base === tag.tag) continue;
      
      // Group by singular form
      if (!singularPluralSets.has(base)) {
        singularPluralSets.set(base, []);
      }
      
      singularPluralSets.get(base)?.push(tag);
    }
    
    // Second pass: For each group, keep only the highest scoring variant
    for (const [, variants] of singularPluralSets.entries()) {
      if (variants.length <= 1) continue;
      
      // Sort variants by score (highest first)
      variants.sort((a, b) => b.score - a.score);
      
      // Keep the highest scoring variant, mark others for removal
      for (let i = 1; i < variants.length; i++) {
        phrasesToRemove.add(variants[i].tag);
      }
    }
  }
  
  /**
   * Identify direct singular/plural pairs in phrases
   * Specifically targeting cases like "native american" vs "native americans"
   * 
   * @param sortedTags - Tags sorted by score
   * @param phrasesToRemove - Set to populate with forms to remove
   */
  private identifyDirectSingularPluralPairs(
    sortedTags: TagResult[],
    phrasesToRemove: Set<string>
  ): void {
    // Create temporary map for easy lookup
    const tagMap = new Map<string, TagResult>();
    for (const tag of sortedTags) {
      tagMap.set(tag.tag, tag);
    }
    
    // Process each tag looking for singular/plural pairs
    for (const tag of sortedTags) {
      // Skip if already marked for removal
      if (phrasesToRemove.has(tag.tag)) continue;
      
      const words = tag.tag.split(' ');
      
      // Only process phrases (multi-word tags)
      if (words.length <= 1) continue;
      
      // Check if this might be plural form (ends with 's')
      if (words[words.length - 1].endsWith('s')) {
        // Try removing 's' from the last word
        const lastWord = words[words.length - 1];
        const singularLastWord = lastWord.endsWith('s') ? lastWord.substring(0, lastWord.length - 1) : lastWord;
        
        // Construct potential singular form
        const potentialSingular = [...words.slice(0, words.length - 1), singularLastWord].join(' ');
        
        // Check if potential singular form exists in our tags
        if (tagMap.has(potentialSingular)) {
          const pluralTag = tag;
          const singularTag = tagMap.get(potentialSingular);
          
          // Keep the higher-scoring variant
          if (singularTag && pluralTag.score > singularTag.score) {
            phrasesToRemove.add(singularTag.tag);
          } else if (singularTag) {
            phrasesToRemove.add(pluralTag.tag);
          }
        }
      }
      
      // Check if this might be singular form (doesn't end with 's')
      else {
        // Try adding 's' to the last word
        const lastWord = words[words.length - 1];
        const pluralLastWord = lastWord + 's';
        
        // Construct potential plural form
        const potentialPlural = [...words.slice(0, words.length - 1), pluralLastWord].join(' ');
        
        // Check if potential plural form exists in our tags
        if (tagMap.has(potentialPlural)) {
          const singularTag = tag;
          const pluralTag = tagMap.get(potentialPlural);
          
          // Keep the higher-scoring variant
          if (pluralTag && singularTag.score > pluralTag.score) {
            phrasesToRemove.add(pluralTag.tag);
          } else if (pluralTag) {
            phrasesToRemove.add(singularTag.tag);
          }
        }
      }
    }
  }
  
  /**
   * Get singular form of a word or phrase
   * Handles common plural endings
   * 
   * @param text - Input text
   * @returns Singular form
   */
  private getSingularForm(text: string): string {
    // For phrases, we only care about the last word
    const words = text.split(' ');
    const lastWord = words[words.length - 1];
    let singularLastWord = lastWord;
    
    // Common plural endings
    if (lastWord.endsWith('s')) {
      if (lastWord.endsWith('ies')) {
        // babies -> baby, countries -> country
        singularLastWord = lastWord.substring(0, lastWord.length - 3) + 'y';
      } else if (lastWord.endsWith('es') && (
          lastWord.endsWith('ches') || 
          lastWord.endsWith('shes') || 
          lastWord.endsWith('sses') || 
          lastWord.endsWith('xes')
      )) {
        // matches -> match, boxes -> box
        singularLastWord = lastWord.substring(0, lastWord.length - 2);
      } else if (lastWord.endsWith('s')) {
        // cats -> cat
        singularLastWord = lastWord.substring(0, lastWord.length - 1);
      }
    }
    
    // Replace last word with singular form
    if (words.length > 1) {
      return words.slice(0, words.length - 1).join(' ') + ' ' + singularLastWord;
    }
    
    return singularLastWord;
  }
}
