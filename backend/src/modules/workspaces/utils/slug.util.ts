import * as crypto from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'docs',
  'health',
  'auth',
  'users',
  'workspaces',
  'invites',
  'settings',
  'app',
  'www',
  'static',
]);

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSlug(slug: string): void {
  if (RESERVED_SLUGS.has(slug)) {
    throw new BadRequestException(`Slug '${slug}' is reserved`);
  }

  if (slug.length < 3 || slug.length > 48) {
    throw new BadRequestException('Slug must be between 3 and 48 characters');
  }

  if (!SLUG_REGEX.test(slug)) {
    throw new BadRequestException(
      'Slug must consist of lowercase alphanumeric characters separated by single hyphens',
    );
  }
}

export function generateSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length < 3) {
    const pad = crypto.randomBytes(2).toString('hex');
    slug = (slug ? `${slug}-` : '') + pad;
  }

  if (slug.length > 48) {
    slug = slug.substring(0, 48).replace(/-+$/, '');
  }

  if (RESERVED_SLUGS.has(slug)) {
    slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    if (slug.length > 48) {
      slug = slug.substring(0, 48).replace(/-+$/, '');
    }
  }

  return slug;
}

export function appendRandomSuffix(slug: string): string {
  const suffix = crypto.randomBytes(2).toString('hex'); // 4 hex chars e.g. "a1b2"
  const maxBaseLength = 48 - (suffix.length + 1);
  const truncatedBase = (slug.length > maxBaseLength
    ? slug.substring(0, maxBaseLength)
    : slug
  ).replace(/-+$/, '');
  return `${truncatedBase}-${suffix}`;
}
