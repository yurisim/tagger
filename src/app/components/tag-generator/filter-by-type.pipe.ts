import { Pipe, PipeTransform } from '@angular/core';
import { TagResult } from './text-tag-generator.model';

@Pipe({
  name: 'filterByType',
  standalone: true
})
export class FilterByTypePipe implements PipeTransform {
  transform(tags: TagResult[], type: string): TagResult[] {
    if (!tags || !type) {
      return tags;
    }
    return tags.filter(tag => tag.type === type);
  }
}
