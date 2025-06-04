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
  ngramSizes?: number[]; 
  minNgramSize?: number; 
  maxNgramSize?: number; 
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
   * Returns N words and N phrases (total of 2N tags) when a user asks for N tags
   */
  public generateTags(text: string, options: GeneratorOptions = {}): TagResult[] {
    const {
      maxTags = 10,
      minWordLength = 3,
      minFrequency = 1,
      includeNgrams = true,
      ngramSizes = [2], // Default to single size if not provided
      minNgramSize, // Alternative: min size for range
      maxNgramSize, // Alternative: max size for range
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
    
    // Create word tag results
    const wordResults: TagResult[] = [];
    for (const [word, score] of wordScores) {
      wordResults.push({
        tag: word,
        score: score,
        frequency: wordFreq.get(word) || 0,
        type: 'word'
      });
    }
    
    // Sort words by score and get top N
    const topWords = wordResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTags);
    
    // Generate n-grams if requested
    let topPhrases: TagResult[] = [];
    if (includeNgrams) {
      const ngramScores = this.generateNgrams(words, ngramSizes, minNgramSize, maxNgramSize, minFrequency);
      
      // Create phrase tag results
      const phraseResults: TagResult[] = [];
      for (const [ngram, score] of ngramScores) {
        phraseResults.push({
          tag: ngram,
          score: score,
          frequency: 1, // N-grams don't have direct frequency mapping
          type: 'phrase'
        });
      }
      
      // Sort phrases by score and get top N
      topPhrases = phraseResults
        .sort((a, b) => b.score - a.score)
        .slice(0, maxTags);
    }
    
    // Combine and sort all tags by score
    const allTags = [...topWords, ...topPhrases];
    const sortedTags = allTags.sort((a, b) => b.score - a.score);
    
    // Filter out component words that appear in higher-scoring phrases
    return this.filterComponentWords(sortedTags);
  }

  /**
   * Preprocess text: tokenize, clean, and normalize
   */
  private preprocessText(text: string, caseSensitive: boolean): string[] {
    let processedText = caseSensitive ? text : text.toLowerCase();

    // Step 1: Remove possessive forms comprehensively
    // Handle all variations: "Trump's", "Trump's", "students'", "students'"
    processedText = processedText.replace(/(['']s|s[''])\b/g, ''); // Remove 's, 's, s', s'
    
    // Step 2: Replace all non-alphanumeric characters (except whitespace) with a single space
    // This helps separate words joined by punctuation, e.g., "cost-cutting" -> "cost cutting"
    processedText = processedText.replace(/[^\w\s]/g, ' ');
    
    // Step 3: Normalize multiple spaces into single spaces and trim
    processedText = processedText.replace(/\s+/g, ' ').trim();

    // Step 4: Split into words and filter out stop words, empty strings, and single characters
    return processedText
      .split(/\s+/)
      .filter(word => 
        word.length > 1 && // Filter out single characters like 's'
        !this.stopWords.has(word) &&
        !/^[''"`\-_]+$/.test(word) // Filter out tokens that are only punctuation
      );
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
    ngramSizes: number[] = [2], 
    minNgramSize?: number, 
    maxNgramSize?: number, 
    minFrequency = 1
  ): Map<string, number> {
    const ngrams = new Map<string, number>();
    
    // First, get word scores to use for phrase scoring
    const wordFrequencies = this.calculateWordFrequency(words);
    const wordScores = this.calculateWordScores(wordFrequencies, words.length);
    
    // Determine actual sizes to generate
    let sizesToGenerate: number[] = [];
    
    if (minNgramSize !== undefined && maxNgramSize !== undefined) {
      // Use range-based generation
      for (let size = minNgramSize; size <= maxNgramSize; size++) {
        sizesToGenerate.push(size);
      }
    } else {
      // Use explicit sizes array
      sizesToGenerate = ngramSizes;
    }
    
    // Generate n-grams for each size
    for (const size of sizesToGenerate) {
      for (let i = 0; i <= words.length - size; i++) {
        const ngram = words.slice(i, i + size).join(' ');
        ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
      }
    }
    
    // Filter and score n-grams
    const scoredNgrams = new Map<string, number>();
    const maxNgramFreq = Math.max(...ngrams.values());
    
    for (const [ngram, freq] of ngrams) {
      if (freq >= minFrequency) {
        // Calculate phrase score based on multiple factors
        const phraseWords = ngram.split(' ');
        
        // 1. Average score of component words
        let componentScore = 0;
        let validComponents = 0;
        for (const word of phraseWords) {
          if (wordScores.has(word)) {
            componentScore += wordScores.get(word) || 0;
            validComponents++;
          }
        }
        const avgComponentScore = validComponents > 0 ? componentScore / validComponents : 0;
        
        // 2. Phrase frequency score (normalized)
        const phraseFreqScore = freq / maxNgramFreq;
        
        // 3. Phrase cohesion bonus (phrases that appear frequently relative to their components)
        let cohesionScore = 0;
        if (validComponents > 0) {
          // Calculate expected frequency if words were independent
          let expectedFreq = words.length;
          for (const word of phraseWords) {
            const wordFreq = wordFrequencies.get(word) || 0;
            expectedFreq = Math.min(expectedFreq, wordFreq);
          }
          // Cohesion is high when actual frequency approaches or exceeds expected
          cohesionScore = expectedFreq > 0 ? Math.min(freq / expectedFreq, 1) : 0;
        }
        
        // 4. Length penalty (longer phrases need stronger justification)
        const lengthPenalty = 1 / Math.sqrt(phraseWords.length);
        
        // Combine scores with weights
        // Give more weight to component scores to better relate to word scores
        const finalScore = (avgComponentScore * 0.5) + 
                          (phraseFreqScore * 0.2) + 
                          (cohesionScore * 0.2) + 
                          (lengthPenalty * 0.1);
        
        scoredNgrams.set(ngram, finalScore);
      }
    }
    
    return scoredNgrams;
  }

  /**
   * Filter out individual words that are components of higher-scoring phrases
   * and longer phrases that contain shorter, higher-scoring phrases
   */
  private filterComponentWords(tags: TagResult[]): TagResult[] {
    const filteredTags: TagResult[] = [];
    const componentWordsToRemove = new Set<string>();
    const phrasesToRemove = new Set<string>();
    
    // Sort tags by score (highest first) to process higher-scoring items first
    const sortedTags = [...tags].sort((a, b) => b.score - a.score);
    
    // First pass: identify phrases to keep and their components
    const keptPhrases = new Set<string>();
    for (const tag of sortedTags) {
      if (tag.type === 'phrase' && !phrasesToRemove.has(tag.tag)) {
        keptPhrases.add(tag.tag);
        
        // Mark component words for removal
        const words = tag.tag.split(' ');
        words.forEach(word => componentWordsToRemove.add(word));
        
        // Check if this phrase should exclude other phrases
        for (const otherTag of sortedTags) {
          if (otherTag.type === 'phrase' && 
              otherTag.tag !== tag.tag && 
              otherTag.score < tag.score) {
            
            // Check if the other phrase contains this phrase
            const otherWords = otherTag.tag.split(' ');
            const thisWords = tag.tag.split(' ');
            
            // Check if thisWords appears as a subsequence in otherWords
            for (let i = 0; i <= otherWords.length - thisWords.length; i++) {
              let matches = true;
              for (let j = 0; j < thisWords.length; j++) {
                if (otherWords[i + j] !== thisWords[j]) {
                  matches = false;
                  break;
                }
              }
              if (matches) {
                phrasesToRemove.add(otherTag.tag);
                break;
              }
            }
          }
        }
      }
    }
    
    // Second pass: filter tags
    for (const tag of sortedTags) {
      if (tag.type === 'phrase' && !phrasesToRemove.has(tag.tag)) {
        // Include phrases that weren't marked for removal
        filteredTags.push(tag);
      } else if (tag.type === 'word' && !componentWordsToRemove.has(tag.tag)) {
        // Only include words that are not components of any kept phrase
        filteredTags.push(tag);
      }
    }
    
    return filteredTags;
  }
}
