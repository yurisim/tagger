import { Injectable } from '@angular/core';

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
  ngramSize?: number;
  caseSensitive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TextTagGeneratorService {
  private stopWords: Set<string>;
  
  constructor() {
    // Common English stop words
    this.stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'would', 'could', 'should', 'this',
      'these', 'they', 'them', 'their', 'there', 'then', 'than', 'when',
      'where', 'who', 'which', 'what', 'how', 'why', 'but', 'or', 'so',
      'if', 'can', 'have', 'had', 'been', 'being', 'do', 'does', 'did',
      'very', 'really', 'quite', 'just', 'only', 'also', 'even', 'still'
    ]);
  }

  /**
   * Generate tags from paragraph text using statistical analysis
   */
  public generateTags(text: string, options: GeneratorOptions = {}): TagResult[] {
    const {
      maxTags = 10,
      minWordLength = 3,
      minFrequency = 1,
      includeNgrams = true,
      ngramSize = 2,
      caseSensitive = false
    } = options;

    // Preprocess text
    const words = this.preprocessText(text, caseSensitive);
    
    // Get word frequencies
    const wordFreq = this.calculateWordFrequency(words);
    
    // Filter words by criteria
    const filteredWords = this.filterWords(wordFreq, minWordLength, minFrequency);
    
    // Calculate TF-IDF-like scores
    const wordScores = this.calculateWordScores(filteredWords, words.length);
    
    // Generate n-grams if requested
    let ngramScores: Map<string, number> = new Map();
    if (includeNgrams) {
      ngramScores = this.generateNgrams(words, ngramSize, minFrequency);
    }
    
    // Combine and rank results
    const allCandidates = this.combineResults(wordScores, ngramScores, wordFreq);
    
    // Sort by score and return top results
    return allCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTags);
  }

  /**
   * Preprocess text: tokenize, clean, and normalize
   */
  private preprocessText(text: string, caseSensitive: boolean): string[] {
    let processedText = caseSensitive ? text : text.toLowerCase();

    // Step 1: Remove possessive 's, ’s, s', and s’
    // Handles cases like "Trump's", "Trump’s" -> "Trump"
    // Handles cases like "students'", "students’" -> "students"
    processedText = processedText.replace(/\b['’]s\b/g, ''); 
    processedText = processedText.replace(/\bs['’]\b/g, '');

    // Step 2: Replace all non-alphanumeric characters (except whitespace itself) with a single space.
    // This helps separate words joined by punctuation, e.g., "cost-cutting" -> "cost cutting".
    // It also removes any remaining apostrophes that are not part of the possessive patterns above (e.g. from contractions if not stop-worded).
    processedText = processedText.replace(/[^\w\s]/g, ' ');
    
    // Step 3: Normalize multiple spaces into single spaces and trim.
    // This ensures clean tokens after punctuation removal.
    processedText = processedText.replace(/\s+/g, ' ').trim();

    // Step 4: Split into words and filter out stop words and any empty strings resulting from the process.
    return processedText
      .split(/\s+/) // Use \s+ to handle any lingering multiple spaces robustly
      .filter(word => word.length > 0 && !this.stopWords.has(word));
  }

  /**
   * Calculate frequency of each word
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
   */
  private calculateWordScores(
    wordFreq: Map<string, number>, 
    totalWords: number
  ): Map<string, number> {
    const scores = new Map<string, number>();
    const maxFreq = Math.max(...wordFreq.values());
    
    for (const [word, freq] of wordFreq) {
      // Combine multiple scoring factors:
      // 1. Normalized frequency (TF)
      const tf = freq / maxFreq;
      
      // 2. Word length bonus (longer words often more meaningful)
      const lengthBonus = Math.log(word.length) / Math.log(10);
      
      // 3. Frequency significance (not too rare, not too common)
      const freqSignificance = this.calculateFrequencySignificance(freq, totalWords);
      
      // Combine scores with weights
      const finalScore = (tf * 0.4) + (lengthBonus * 0.3) + (freqSignificance * 0.3);
      
      scores.set(word, finalScore);
    }
    
    return scores;
  }

  /**
   * Calculate how significant a frequency is (not too common, not too rare)
   */
  private calculateFrequencySignificance(frequency: number, totalWords: number): number {
    const relativeFreq = frequency / totalWords;
    
    // Use a bell curve-like function where moderate frequencies score higher
    // Optimal frequency is around 1-5% of total words
    const optimalFreq = 0.03;
    const distance = Math.abs(relativeFreq - optimalFreq);
    
    return Math.exp(-distance * 50); // Exponential decay from optimal point
  }

  /**
   * Generate n-grams and score them
   */
  private generateNgrams(
    words: string[], 
    ngramSize: number, 
    minFrequency: number
  ): Map<string, number> {
    const ngrams = new Map<string, number>();
    
    for (let i = 0; i <= words.length - ngramSize; i++) {
      const ngram = words.slice(i, i + ngramSize).join(' ');
      ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
    }
    
    // Filter and score n-grams
    const scoredNgrams = new Map<string, number>();
    const maxNgramFreq = Math.max(...ngrams.values());
    
    for (const [ngram, freq] of ngrams) {
      if (freq >= minFrequency) {
        // Score n-grams lower than individual words but consider frequency
        const score = (freq / maxNgramFreq) * 0.7; // Reduced weight for n-grams
        scoredNgrams.set(ngram, score);
      }
    }
    
    return scoredNgrams;
  }

  /**
   * Combine word scores and n-gram scores into final results
   */
  private combineResults(
    wordScores: Map<string, number>,
    ngramScores: Map<string, number>,
    wordFreq: Map<string, number>
  ): TagResult[] {
    const results: TagResult[] = [];
    
    // Add word results
    for (const [word, score] of wordScores) {
      results.push({
        tag: word,
        score: score,
        frequency: wordFreq.get(word) || 0,
        type: 'word'
      });
    }
    
    // Add n-gram results
    for (const [ngram, score] of ngramScores) {
      results.push({
        tag: ngram,
        score: score,
        frequency: 1, // N-grams don't have direct frequency mapping
        type: 'phrase'
      });
    }
    
    return results;
  }

  /**
   * Advanced feature: Calculate semantic similarity between words (basic implementation)
   */
  private calculateSemanticSimilarity(word1: string, word2: string): number {
    // Simple character-based similarity (can be enhanced with more sophisticated methods)
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}
