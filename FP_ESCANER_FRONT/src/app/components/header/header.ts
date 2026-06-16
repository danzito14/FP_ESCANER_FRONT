import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';

import { AuthService } from '../../service/auth';
import { LayoutService } from '../../service/layout';

@Component({
  selector: 'app-header',
  imports: [RouterLink, FaIconComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly auth = inject(AuthService);
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);

  readonly iconMenu = faBars;

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
