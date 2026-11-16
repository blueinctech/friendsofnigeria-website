/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    admin: import('./lib/server/auth').Admin | null;
    session: import('./lib/server/auth').Session | null;
    /** True when a signed-in administrator previews unpublished content. */
    preview: boolean;
  }
}
