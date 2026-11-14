import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSpaceDto {
  @ApiPropertyOptional({ example: 'Product Engineering & Design' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated roadmap and backlog' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '#10B981', description: 'Hex color (#RRGGBB)' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid 6-digit hex code in #RRGGBB format',
  })
  color?: string;

  @ApiPropertyOptional({ example: 'folder-code', description: 'Icon identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;
}
