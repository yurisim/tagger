import { Injectable } from '@angular/core';
import pluralize from './pluralize';

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
    const wordFrequencies = this.calculateWordFrequency(words);
    
    // Step 2: Generate word tags
    const wordResults = this.generateWordTags(words, wordFrequencies, minWordLength, minFrequency, maxTags);
    
    // Step 3: Generate phrase tags if requested
    let phraseResults: TagResult[] = [];
    if (includeNgrams) {
      phraseResults = this.generatePhraseTags(
        words, 
        wordFrequencies, 
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
   * @param wordFrequencies - Word frequency map
   * @param minWordLength - Minimum word length to consider
   * @param minFrequency - Minimum frequency threshold
   * @param maxTags - Maximum number of tags to return
   * @returns Array of word tag results
   */
  private generateWordTags(
    words: string[], 
    wordFrequencies: Map<string, number>,
    minWordLength: number, 
    minFrequency: number,
    maxTags: number
  ): TagResult[] {
    // Filter by criteria
    const filteredWords = this.filterWords(wordFrequencies, minWordLength, minFrequency);
    
    // Calculate scores
    const wordScores = this.calculateWordScores(filteredWords, words.length);
    
    // Create results
    const wordResults: TagResult[] = [];
    for (const [word, score] of wordScores) {
      wordResults.push({
        tag: word,
        score: score,
        frequency: wordFrequencies.get(word) || 0,
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
   * @param wordFrequencies - Word frequency map
   * @param ngramSizes - Explicit n-gram sizes to generate
   * @param minNgramSize - Minimum n-gram size (for range-based generation)
   * @param maxNgramSize - Maximum n-gram size (for range-based generation)
   * @param minFrequency - Minimum frequency threshold
   * @param maxTags - Maximum number of tags to return
   * @returns Array of phrase tag results
   */
  private generatePhraseTags(
    words: string[],
    wordFrequencies: Map<string, number>,
    ngramSizes: number[],
    minNgramSize: number | undefined,
    maxNgramSize: number | undefined,
    minFrequency: number,
    maxTags: number
  ): TagResult[] {
    const ngramScores = this.generateNgrams(
      words, 
      wordFrequencies,
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
   * @param wordFrequencies - Word frequency map
   * @param ngramSizes - Explicit sizes to generate
   * @param minNgramSize - Minimum size for range-based generation
   * @param maxNgramSize - Maximum size for range-based generation
   * @param minFrequency - Minimum frequency threshold
   * @returns Map of n-gram to score and frequency
   */
  private generateNgrams(
    words: string[], 
    wordFrequencies: Map<string, number>,
    ngramSizes: number[] = [2], 
    minNgramSize?: number, 
    maxNgramSize?: number, 
    minFrequency = 1
  ): Map<string, { score: number; frequency: number }> {
    // Get word scores for phrase scoring
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

  /**
   * Filter out redundant tags including:
   * - Individual words that are components of higher-scoring phrases
   * - Longer phrases that contain shorter, higher-scoring phrases
   * - Less relevant singular/plural forms of the same concept
   * 
   * @param tags - All generated tags sorted by score
   * @returns Filtered tags without redundant components
   */
  private filterComponentWords(tags: TagResult[]): TagResult[] {
    // Sort tags by score (highest first)
    const sortedTags = [...tags].sort((a, b) => b.score - a.score);
    
    // Track what needs to be removed
    const tagMap = new Map<string, TagResult>(); // For fast lookups
    const componentWordsToRemove = new Set<string>();
    const phrasesToRemove = new Set<string>();
    
    // Build lookup map
    for (const tag of sortedTags) {
      tagMap.set(tag.tag, tag);
    }
    
    // Single pass to handle all types of redundancy
    for (const tag of sortedTags) {
      // Skip if already marked for removal
      if (phrasesToRemove.has(tag.tag)) {
        continue;
      }
      
      const words = tag.tag.split(' ');
      
      // Handle component words - mark individual words for removal when they appear in phrases
      if (tag.type === 'phrase') {
        words.forEach(word => componentWordsToRemove.add(word));
        
        // Check for phrase overlaps (subsequence relationship)
        this.handlePhraseOverlaps(tag, sortedTags, phrasesToRemove);
        
        // Handle singular/plural pairs
        this.handleSingularPluralForms(tag, tagMap, phrasesToRemove);
      }
    }
    
    // Filter final results
    const filteredTags: TagResult[] = [];
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
   * Handle phrase overlaps - identifies when a phrase is a subsequence of another phrase
   * 
   * @param phrase - The phrase to check
   * @param allTags - All tags sorted by score
   * @param phrasesToRemove - Set to populate with phrases to remove
   */
  private handlePhraseOverlaps(
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
   * Handle singular/plural forms - detects and resolves when two tags represent the same concept
   * 
   * @param tag - Current tag to check
   * @param tagMap - Map of all tags for quick lookup
   * @param phrasesToRemove - Set to populate with forms to remove
   */
  private handleSingularPluralForms(
    tag: TagResult,
    tagMap: Map<string, TagResult>,
    phrasesToRemove: Set<string>
  ): void {
    const words = tag.tag.split(' ');
    
    // Skip single words (handled separately if needed)
    if (words.length <= 1) {
      return;
    }
    
    const lastWord = words[words.length - 1];
    let singularForm: string | null = null;
    let pluralForm: string | null = null;

    const wordStemArray = words.slice(0, words.length - 1);
    const singularLast = pluralize.singular(lastWord);
    const pluralLast = pluralize.plural(lastWord);

    // Only construct singular/plural phrase forms if pluralize determined
    // distinct singular and plural versions of the last word.
    if (singularLast !== pluralLast) {
      singularForm = [...wordStemArray, singularLast].join(' ');
      pluralForm = [...wordStemArray, pluralLast].join(' ');
    }
    
    // Check if counterpart exists
    if (singularForm && pluralForm && tagMap.has(singularForm) && tagMap.has(pluralForm)) {
      const singularTag = tagMap.get(singularForm);
      const pluralTag = tagMap.get(pluralForm);
      
      // Keep the higher-scoring variant, remove the other
      if (singularTag && pluralTag && singularTag.score > pluralTag.score) {
        phrasesToRemove.add(pluralForm);
      } else {
        phrasesToRemove.add(singularForm);
      }
    }
  }
}
