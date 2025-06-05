import {
  STOP_WORDS,
  SCORING_WEIGHTS,
  OPTIMAL_RELATIVE_FREQUENCY,
  FREQUENCY_DECAY_FACTOR
} from './text-tag-generator.constants';
import { TagResult } from './text-tag-generator.model';

// ===========================
// TEXT PREPROCESSING
// ===========================

export function preprocessText(text: string, caseSensitive: boolean): string[] {
  let processedText = caseSensitive ? text : text.toLowerCase();
  processedText = processedText.replace(/('s|s')\b/g, ''); // Possessive forms
  processedText = processedText.replace(/[^\w\s]/g, ' '); // Non-alphanumeric to spaces
  processedText = processedText.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  return processedText
    .split(/\s+/)
    .filter(word =>
      word.length > 1 &&
      !STOP_WORDS.has(word) &&
      !/^['"`\-_]+$/.test(word) // Filter out words made of only quotes/hyphens
    );
}

// ===========================
// WORD TAG GENERATION UTILITIES
// ===========================

export function calculateWordFrequency(words: string[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  return frequency;
}

export function filterWords(
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

export function calculateFrequencySignificance(frequency: number, totalWords: number): number {
  if (totalWords === 0) return 0;
  const relativeFreq = frequency / totalWords;
  const distance = Math.abs(relativeFreq - OPTIMAL_RELATIVE_FREQUENCY);
  return Math.exp(-distance * FREQUENCY_DECAY_FACTOR);
}

export function calculateWordScores(
  wordFreq: Map<string, number>,
  totalWords: number
): Map<string, number> {
  const scores = new Map<string, number>();
  if (wordFreq.size === 0 || totalWords === 0) return scores;
  const maxFreq = Math.max(...wordFreq.values(), 1); // Avoid -Infinity if wordFreq is empty after filtering

  for (const [word, freq] of wordFreq) {
    const tf = freq / maxFreq;
    const lengthBonus = Math.min(1, word.length / 10);
    const freqSignificance = calculateFrequencySignificance(freq, totalWords);

    const finalScore =
      (tf * SCORING_WEIGHTS.word.termFrequency) +
      (lengthBonus * SCORING_WEIGHTS.word.lengthBonus) +
      (freqSignificance * SCORING_WEIGHTS.word.frequencySignificance);

    scores.set(word, finalScore);
  }
  return scores;
}

// ===========================
// NGRAM / PHRASE UTILITIES
// ===========================

export function generateNgrams(words: string[], size: number): string[][] {
  const ngrams: string[][] = [];
  if (size <= 0 || size > words.length) {
    return ngrams;
  }
  for (let i = 0; i <= words.length - size; i++) {
    ngrams.push(words.slice(i, i + size));
  }
  return ngrams;
}

export function calculateNgramFrequency(ngrams: string[][]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const ngramArray of ngrams) {
    const ngramString = ngramArray.join(' ');
    frequency.set(ngramString, (frequency.get(ngramString) || 0) + 1);
  }
  return frequency;
}

export function calculateCohesionScore(phraseWords: string[], allWords: string[]): number {
  if (phraseWords.length <= 1 || allWords.length === 0) return 0;

  let totalPMI = 0;
  const wordCounts = calculateWordFrequency(allWords);
  const totalWordOccurrences = allWords.length;

  for (let i = 0; i < phraseWords.length - 1; i++) {
    const word1 = phraseWords[i];
    const word2 = phraseWords[i + 1];

    let cooccurrence = 0;
    for (let j = 0; j < allWords.length - 1; j++) {
      if (allWords[j] === word1 && allWords[j + 1] === word2) {
        cooccurrence++;
      }
    }

    const pWord1 = (wordCounts.get(word1) || 0) / totalWordOccurrences;
    const pWord2 = (wordCounts.get(word2) || 0) / totalWordOccurrences;
    const pCooccurrence = cooccurrence / Math.max(1, totalWordOccurrences - 1); // Avoid division by zero

    if (pWord1 > 0 && pWord2 > 0 && pCooccurrence > 0) {
      totalPMI += Math.log2(pCooccurrence / (pWord1 * pWord2));
    }
  }
  return phraseWords.length > 1 ? totalPMI / (phraseWords.length - 1) : 0;
}

export function calculatePhraseScore(
  phrase: string,
  wordScores: Map<string, number>,
  phraseFreqMap: Map<string, number>,
  totalWordsInDoc: number, // Clarified name
  allWordsInDoc: string[] // Clarified name
): number {
  const phraseWords = phrase.split(' ');
  if (phraseWords.length === 0) return 0;
  const phraseFrequency = phraseFreqMap.get(phrase) || 0;

  let sumComponentScores = 0;
  let unknownWordsCount = 0;
  for (const word of phraseWords) {
    const score = wordScores.get(word);
    if (score !== undefined) {
      sumComponentScores += score;
    } else {
      unknownWordsCount++;
    }
  }
  const avgComponentScore = sumComponentScores / phraseWords.length * (1 - unknownWordsCount / phraseWords.length);
  const phraseFreqScore = calculateFrequencySignificance(phraseFrequency, totalWordsInDoc / phraseWords.length); // Normalize total for phrase length
  const cohesion = calculateCohesionScore(phraseWords, allWordsInDoc);
  
  // Simplified length penalty/bonus for now
  const lengthFactor = phraseWords.length;
  let lengthModifier = 0;
  if (lengthFactor === 2) lengthModifier = SCORING_WEIGHTS.phrase.lengthPenalty; // Example: 0.1
  else if (lengthFactor === 3) lengthModifier = SCORING_WEIGHTS.phrase.lengthPenalty / 2; // Example: 0.05
  else if (lengthFactor > 3) lengthModifier = -SCORING_WEIGHTS.phrase.lengthPenalty * (lengthFactor - 3) / 2; // Penalize longer

  const score =
    (avgComponentScore * SCORING_WEIGHTS.phrase.componentScore) +
    (phraseFreqScore * SCORING_WEIGHTS.phrase.frequencyScore) +
    (cohesion * SCORING_WEIGHTS.phrase.cohesionScore) +
    lengthModifier; // Applied modifier

  return Math.max(0, score);
}

// ===========================
// FILTERING AND POST-PROCESSING UTILITIES
// ===========================

export function isSubsequence(subsequence: string[], sequence: string[]): boolean {
  let i = 0;
  let j = 0;
  while (i < subsequence.length && j < sequence.length) {
    if (subsequence[i] === sequence[j]) {
      i++;
    }
    j++;
  }
  return i === subsequence.length;
}

function handlePhraseOverlapsInternal(
  phrase: TagResult,
  allPhraseTags: TagResult[], // Process only against other phrases
  phrasesToRemove: Set<string>
): void {
  const phraseWords = phrase.tag.split(' ');
  for (const otherTag of allPhraseTags) {
    if (otherTag.tag === phrase.tag) continue; // Skip self-comparison

    // Only consider removing otherTag if it's lower score OR same score but longer (less specific)
    if (otherTag.score < phrase.score || (otherTag.score === phrase.score && otherTag.tag.length > phrase.tag.length)) {
      const otherWords = otherTag.tag.split(' ');
      if (isSubsequence(phraseWords, otherWords)) { // Current (better) phrase is part of other (worse) phrase
        phrasesToRemove.add(otherTag.tag);
      }
    }
  }
}

export function filterComponentWordsAndOverlaps(allTags: TagResult[]): TagResult[] {
  const phrasesToRemove = new Set<string>();
  const phraseTags = allTags.filter(tag => tag.type === 'phrase');
  const wordTags = allTags.filter(tag => tag.type === 'word');

  // Pass 1: Identify overlapping phrases to remove (lower score ones)
  for (const phrase of phraseTags) {
    handlePhraseOverlapsInternal(phrase, phraseTags, phrasesToRemove);
  }

  const survivingTags: TagResult[] = [];
  const wordsInKeptPhrases = new Set<string>();

  // Add surviving phrases and collect their words
  for (const tag of phraseTags) {
    if (!phrasesToRemove.has(tag.tag)) {
      survivingTags.push(tag);
      tag.tag.split(' ').forEach(word => wordsInKeptPhrases.add(word));
    }
  }

  // Add word tags only if they are not part of any kept phrase
  for (const tag of wordTags) {
    if (!wordsInKeptPhrases.has(tag.tag)) {
      survivingTags.push(tag);
    }
  }
  
  return survivingTags.sort((a, b) => b.score - a.score);
}
