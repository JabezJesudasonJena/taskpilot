import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  Matches,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateListDto {
  @ApiPropertyOptional({ example: 'Backend Roadmap & Sprints' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated backend scope' })
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

  @ApiPropertyOptional({
    description: 'Target space ID if moving to a different space',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional({
    description:
      'Target folder ID in destination space, or null to move to space root',
    example: '123e4567-e89b-12d3-a456-426614174001',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_obj, val) => val !== null && val !== undefined)
  @IsUUID()
  folderId?: string | null;
}
