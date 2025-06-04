import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TagGeneratorComponent } from './components/tag-generator/tag-generator.component';

@Component({
  imports: [TagGeneratorComponent, RouterModule],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'tagger';
}
