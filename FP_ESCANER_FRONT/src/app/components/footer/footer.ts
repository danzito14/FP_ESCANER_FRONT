import { Component } from '@angular/core';

import { API_VERSION, APP_VERSION } from '../../core/constants/version';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  readonly appVersion = APP_VERSION;
  readonly apiVersion = API_VERSION;
}
