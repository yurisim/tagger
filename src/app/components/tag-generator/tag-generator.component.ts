import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TextTagGeneratorService,
  TagResult,
  GeneratorOptions,
} from './text-tag-generator.service';
import { FilterByTypePipe } from './filter-by-type.pipe';

@Component({
  selector: 'app-tag-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterByTypePipe],
  templateUrl: './tag-generator.component.html',
  styleUrls: ['./tag-generator.component.scss'],
})
export class TagGeneratorComponent {
  @ViewChild('generatedTagsSection', { read: ElementRef }) generatedTagsSection?: ElementRef;

  inputText = '';
  placeholderText =
    'Machine learning is revolutionizing the technology industry at an unprecedented pace, fundamentally transforming how we interact with digital systems and process information. Artificial intelligence algorithms are becoming increasingly sophisticated, enabling computers to process natural language with remarkable accuracy, recognize complex patterns in vast datasets, and make intelligent decisions that often surpass human capabilities in specific domains. Deep learning neural networks have transformed computer vision, speech recognition, and predictive analytics, creating breakthrough applications that were once considered science fiction. These advanced systems can now identify objects in images with superhuman precision, translate languages in real-time, and predict market trends with extraordinary accuracy. The multi-layered architecture of neural networks allows for the processing of unstructured data, making it possible to extract meaningful insights from images, audio, video, and text at scale. Companies across all sectors are investing heavily in AI research and development to create innovative solutions for healthcare, finance, and autonomous vehicles. In healthcare, machine learning algorithms are being deployed to analyze medical imaging, accelerate drug discovery, and personalize treatment plans based on genetic profiles and patient history. Financial institutions are leveraging AI for fraud detection, algorithmic trading, risk assessment, and customer service automation, revolutionizing how they operate and serve clients. The autonomous vehicle industry represents one of the most ambitious applications of AI technology, with companies developing sophisticated sensor fusion systems, real-time decision-making algorithms, and predictive modeling capabilities that enable vehicles to navigate complex environments safely. These systems must process data from multiple sources including cameras, LiDAR, radar, and GPS to create a comprehensive understanding of their surroundings. Beyond these sectors, AI is making significant inroads into manufacturing through predictive maintenance systems that can anticipate equipment failures, retail through personalized recommendation engines and inventory optimization, agriculture through precision farming techniques, and entertainment through content creation and curation algorithms. The economic implications of this AI revolution are staggering, with analysts predicting that artificial intelligence could contribute trillions of dollars to global GDP over the next decade. However, this transformation also brings challenges including ethical considerations around algorithmic bias, privacy concerns regarding data collection and usage, and the need for workforce retraining as automation reshapes traditional job roles. As we move forward, the convergence of AI with other emerging technologies such as quantum computing, 5G networks, and Internet of Things devices promises to unlock even more transformative applications, creating a future where intelligent systems seamlessly integrate into every aspect of our daily lives.';

  // Options
  maxTags = 5;
  minWordLength = 2;
  minFrequency = 1;
  includeNgrams = true;
  phraseGenerationMode: 'specific' | 'range' = 'range';
  selectedPhraseSizes: number[] = [2, 3]; // For specific sizes
  minPhraseSize = 2; // For range mode
  maxPhraseSize = 5; // For range mode
  caseSensitive = false;

  // Results
  generatedTags: TagResult[] = [];
  showDetailedResults = false;
  
  // UI State
  isConfigExpanded = false;

  constructor(private tagGeneratorService: TextTagGeneratorService) {}

  generateTags(): void {
    const textToProcess = this.inputText || this.placeholderText;

    const options: GeneratorOptions = {
      maxTags: this.maxTags,
      minWordLength: this.minWordLength,
      minFrequency: this.minFrequency,
      includeNgrams: this.includeNgrams,
      caseSensitive: this.caseSensitive,
    };

    // Add phrase size options based on mode
    if (this.phraseGenerationMode === 'specific') {
      options.ngramSizes = this.selectedPhraseSizes;
    } else {
      options.minNgramSize = this.minPhraseSize;
      options.maxNgramSize = this.maxPhraseSize;
    }

    this.generatedTags = this.tagGeneratorService.generateTags(
      textToProcess,
      options
    );
    this.showDetailedResults = true;

    // Scroll to generated tags after a brief delay to ensure DOM is updated
    setTimeout(() => {
      this.scrollToGeneratedTags();
    }, 100);
  }

  private scrollToGeneratedTags(): void {
    if (this.generatedTagsSection?.nativeElement) {
      const element = this.generatedTagsSection.nativeElement;
      
      // Check if we're on a narrow screen (mobile)
      const isMobile = window.innerWidth < 768; // Tailwind's md breakpoint
      
      if (isMobile) {
        // On mobile, scroll into view with smooth behavior
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest' 
        });
      } else {
        // On desktop, just ensure it's visible (might already be)
        const rect = element.getBoundingClientRect();
        const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
        
        if (!isInViewport) {
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }
      
      // Optional: Add a subtle highlight effect to draw attention
      element.classList.add('highlight-tags');
      setTimeout(() => {
        element.classList.remove('highlight-tags');
      }, 1000);
    }
  }

  togglePhraseSize(size: number): void {
    const index = this.selectedPhraseSizes.indexOf(size);
    if (index > -1) {
      this.selectedPhraseSizes.splice(index, 1);
    } else {
      this.selectedPhraseSizes.push(size);
    }
    this.selectedPhraseSizes.sort((a, b) => a - b);
  }

  isPhraseSizeSelected(size: number): boolean {
    return this.selectedPhraseSizes.includes(size);
  }

  getScorePercentage(score: number): string {
    // Convert score to percentage format (0.8166 -> 81.7%)
    return (score * 100).toFixed(1);
  }

  getFormattedScore(score: number): string {
    // Format score to 4 decimal places
    return score.toFixed(4);
  }

  loadSampleText(): void {
    this.inputText = '';
  }

  toggleConfigExpanded(): void {
    this.isConfigExpanded = !this.isConfigExpanded;
  }
}
