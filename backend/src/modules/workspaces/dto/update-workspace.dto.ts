import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({
    example: 'Acme Global',
    description: 'Workspace display name',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'acme-global',
    description: 'Unique custom slug (lowercase, alphanumeric, hyphens)',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(48)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'Slug must consist of lowercase alphanumeric characters separated by single hyphens',
  })
  slug?: string;
}
