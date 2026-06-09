import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { Embedding } from '../core/interfaces/embedding';

@Injectable({ providedIn: 'root' })
export class EmbeddingService extends BaseCrud<Embedding> {
  protected readonly resource = 'embeddings';
}
