import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TextTagGeneratorService,
  TagResult,
  GeneratorOptions,
} from './text-tag-generator.service';

@Component({
  selector: 'app-tag-generator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tag-generator.component.html',
  styleUrls: ['./tag-generator.component.scss'],
})
export class TagGeneratorComponent {
  inputText = '';
  placeholderText =
    'Machine learning is revolutionizing the technology industry. Artificial intelligence algorithms are becoming increasingly sophisticated, enabling computers to process natural language, recognize patterns, and make intelligent decisions. Deep learning neural networks have transformed computer vision, speech recognition, and predictive analytics. Companies are investing heavily in AI research and development to create innovative solutions for healthcare, finance, and autonomous vehicles.';

  // Options
  maxTags = 10;
  minWordLength = 3;
  minFrequency = 1;
  includeNgrams = true;
  ngramSize = 2;
  caseSensitive = false;

  // Results
  generatedTags: TagResult[] = [];
  showDetailedResults = false;

  constructor(private tagGeneratorService: TextTagGeneratorService) {}

  generateTags(): void {
    const textToProcess = this.inputText || this.placeholderText;

    const options: GeneratorOptions = {
      maxTags: this.maxTags,
      minWordLength: this.minWordLength,
      minFrequency: this.minFrequency,
      includeNgrams: this.includeNgrams,
      ngramSize: this.ngramSize,
      caseSensitive: this.caseSensitive,
    };

    this.generatedTags = this.tagGeneratorService.generateTags(
      textToProcess,
      options
    );
    this.showDetailedResults = true;
  }

  getScorePercentage(score: number): string {
    // Convert score to percentage format (0.8166 -> 81.7%)
    return (score * 100).toFixed(1);
  }

  getFormattedScore(score: number): string {
    // Format score to 4 decimal places
    return score.toFixed(4);
  }
}
